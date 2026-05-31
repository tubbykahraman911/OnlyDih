import os
from typing import Literal, Optional

import cv2
import numpy as np
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, HttpUrl

app = FastAPI(title="OnlyDihs Phase 1 Private Analyzer Service")
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_MB", "8")) * 1024 * 1024


class AnalyzeRequest(BaseModel):
    job_id: str = Field(min_length=3, max_length=128)
    consented: bool
    image_url: HttpUrl
    calibration_object_present: bool = False


class AnalyzerOutput(BaseModel):
    length_score: int
    girth_score: int
    skin_clarity_score: int
    presentation_score: int
    picture_quality_score: int
    confidence_score: int
    total_score: float
    confidence_level: Literal["low", "medium", "high"]
    warnings: list[str]


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "onlydihs-phase1-private-analyzer"}


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def score(value: float) -> int:
    return int(round(clamp(value)))


def weighted_total(output: dict[str, int]) -> float:
    return round(
        output["length_score"] * 0.35
        + output["girth_score"] * 0.30
        + output["skin_clarity_score"] * 0.15
        + output["presentation_score"] * 0.10
        + output["picture_quality_score"] * 0.05
        + output["confidence_score"] * 0.05,
        2,
    )


def confidence_level(confidence_score: int) -> Literal["low", "medium", "high"]:
    if confidence_score >= 70:
        return "high"
    if confidence_score >= 45:
        return "medium"
    return "low"


def fetch_image(url: str) -> np.ndarray:
    response = requests.get(url, timeout=20, stream=True)
    response.raise_for_status()
    content_length = int(response.headers.get("content-length", 0))
    if content_length and content_length > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds upload limit")
    body = response.content
    if len(body) > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds upload limit")
    return load_image(body)


def load_image(body: bytes) -> np.ndarray:
    if len(body) > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds upload limit")
    image = cv2.imdecode(np.frombuffer(body, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Image format could not be decoded")
    height, width = image.shape[:2]
    if max(height, width) > 1024:
        ratio = 1024 / float(max(height, width))
        image = cv2.resize(image, (int(width * ratio), int(height * ratio)), interpolation=cv2.INTER_AREA)
    return image


def foreground_bbox(gray: np.ndarray) -> Optional[tuple[int, int, int, int, float]]:
    _, threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if float(np.mean(threshold)) / 255.0 > 0.55:
        threshold = 255 - threshold
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(threshold, cv2.MORPH_OPEN, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(contour))
    if area < 2500:
        return None
    x, y, width, height = cv2.boundingRect(contour)
    return x, y, width, height, area


def analyze_image(image: np.ndarray, calibration_object_present: bool) -> AnalyzerOutput:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    image_height, image_width = gray.shape[:2]
    sharpness = clamp((cv2.Laplacian(gray, cv2.CV_64F).var() - 25.0) / 210.0 * 100.0)
    exposure = clamp(100.0 - abs(float(np.mean(gray)) - 122.0) * 0.75)
    contrast = clamp(float(np.std(gray)) / 58.0 * 100.0)
    picture_quality = score(0.46 * sharpness + 0.30 * exposure + 0.24 * contrast)

    bbox = foreground_bbox(gray)
    warnings = [
        "Private visual estimate only.",
        "No exact measurement is claimed without a calibration object or known reference scale.",
    ]
    if bbox is None:
        base = {
            "length_score": 0,
            "girth_score": 0,
            "skin_clarity_score": 0,
            "presentation_score": 0,
            "picture_quality_score": picture_quality,
            "confidence_score": 10,
        }
        warnings.append("Image quality or framing was too limited for a reliable visual estimate.")
        return AnalyzerOutput(**base, total_score=weighted_total(base), confidence_level="low", warnings=warnings)

    x, y, box_width, box_height, area = bbox
    crop_gray = gray[y : y + box_height, x : x + box_width]
    coverage = area / float(image_height * image_width)
    aspect = box_height / max(1, box_width)

    length_visual = score(42 + clamp(aspect, 0.6, 4.0) * 12)
    girth_visual = score(42 + clamp(box_width / max(1, image_width), 0.05, 0.55) * 80)
    skin_clarity = score(100.0 - min(80.0, float(np.std(crop_gray)) * 1.15))
    presentation = score(100.0 - abs(coverage - 0.38) * 170.0)
    confidence = score((picture_quality * 0.45) + (min(100.0, coverage * 180.0) * 0.35) + (20 if calibration_object_present else 0))

    if not calibration_object_present:
        confidence = min(confidence, 45)
        warnings.append("Confidence is capped because no calibration object or known reference scale was provided.")

    base = {
        "length_score": length_visual,
        "girth_score": girth_visual,
        "skin_clarity_score": skin_clarity,
        "presentation_score": presentation,
        "picture_quality_score": picture_quality,
        "confidence_score": confidence,
    }
    return AnalyzerOutput(
        **base,
        total_score=weighted_total(base),
        confidence_level=confidence_level(confidence),
        warnings=warnings,
    )


@app.post("/analyze", response_model=AnalyzerOutput)
def analyze(request: AnalyzeRequest):
    if not request.consented:
        raise HTTPException(status_code=400, detail="Consent is required.")
    try:
        image = fetch_image(str(request.image_url))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except requests.RequestException as error:
        raise HTTPException(status_code=400, detail=f"Could not retrieve private image: {error}")
    return analyze_image(image, request.calibration_object_present)


@app.post("/analyze-upload", response_model=AnalyzerOutput)
async def analyze_upload(
    file: UploadFile = File(...),
    job_id: str = Form(..., min_length=3, max_length=128),
    consented: bool = Form(...),
    calibration_object_present: bool = Form(False),
):
    if not job_id:
        raise HTTPException(status_code=400, detail="Job id is required.")
    if not consented:
        raise HTTPException(status_code=400, detail="Consent is required.")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")
    try:
        image = load_image(await file.read())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return analyze_image(image, calibration_object_present)
