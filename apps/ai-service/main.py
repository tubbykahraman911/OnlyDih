import io
from typing import Any, Dict, Optional

import cv2
import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, HttpUrl

app = FastAPI(title="SizeAI Analyzer Service")


class AnalyzeRequest(BaseModel):
    jobId: str = Field(min_length=3, max_length=128)
    consented: bool = Field(...)
    downloadUrl: HttpUrl
    autoDeleteAfterProcessing: bool = False


class AnalyzeResponse(BaseModel):
    jobId: str
    status: str
    overallScore: Optional[int] = None
    percentile: Optional[int] = None
    label: Optional[str] = None
    confidence: Optional[float] = None
    feedback: Optional[Dict[str, str]] = None
    radar: Optional[Dict[str, int]] = None
    aiSummary: Optional[str] = None
    csamCheck: Optional[Dict[str, Any]] = None


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "sizeai-ai-service"}


def clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def to_int_score(x: float) -> int:
    return int(round(clamp(x)))


def label_for_score(score: int) -> str:
    if score >= 96:
        return "Mythic Tier"
    if score >= 81:
        return "Engineered"
    if score >= 66:
        return "Above Average"
    if score >= 46:
        return "Balanced Build"
    return "Compact King"


def download_image_bytes(url: str) -> bytes:
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    return r.content


def load_image(b: bytes) -> np.ndarray:
    arr = np.frombuffer(b, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


def resize_for_analysis(img: np.ndarray, max_dim: int = 900) -> np.ndarray:
    h, w = img.shape[:2]
    m = max(h, w)
    if m <= max_dim:
        return img
    scale = max_dim / float(m)
    nh = int(round(h * scale))
    nw = int(round(w * scale))
    return cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)


def score_quality(gray: np.ndarray) -> Dict[str, float]:
    # Blur (variance of Laplacian)
    blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    blur_score = clamp((blur_var - 30.0) / 220.0 * 100.0)

    mean = float(np.mean(gray))
    exposure_score = clamp(100.0 - abs(mean - 120.0) * 0.7)

    std = float(np.std(gray))
    contrast_score = clamp((std / 60.0) * 100.0)

    photo_quality = 0.45 * blur_score + 0.3 * exposure_score + 0.25 * contrast_score
    return {
        "blur_score": float(blur_score),
        "exposure_score": float(exposure_score),
        "contrast_score": float(contrast_score),
        "photo_quality": float(photo_quality),
    }


def segment_silhouette(img: np.ndarray) -> Dict[str, Any]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Otsu threshold tends to separate subject from background reasonably for MVP.
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Heuristic: treat smaller foreground as subject.
    if float(np.mean(thresh) / 255.0) > 0.55:
        thresh = 255 - thresh

    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return {"mask": mask, "bbox": None, "area": 0.0, "sil_mask": None}

    largest = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(largest))
    x, y, w, h = cv2.boundingRect(largest)
    if w < 10 or h < 10:
        return {"mask": mask, "bbox": None, "area": area, "sil_mask": None}

    sil_mask = mask[y : y + h, x : x + w]
    return {"mask": mask, "bbox": (x, y, w, h), "area": area, "sil_mask": sil_mask}


def score_shape(img: np.ndarray, sil_mask: np.ndarray, bbox: tuple) -> Dict[str, float]:
    x, y, w, h = bbox
    # Length: based on silhouette aspect ratio (orientation-agnostic)
    aspect = max(float(h), float(w)) / (max(1.0, min(float(h), float(w))) + 1e-6)
    length_score = clamp((aspect - 1.1) / 5.0 * 100.0)

    # Girth: based on fill ratio within bbox.
    bbox_area = float(w * h)
    sil_area = float(np.sum(sil_mask > 0))
    fill_ratio = sil_area / (bbox_area + 1e-6)
    girth_score = clamp(fill_ratio * 160.0)

    # Symmetry: compare left/right of resized mask
    resized = cv2.resize(sil_mask, (64, 64), interpolation=cv2.INTER_NEAREST)
    left = (resized[:, :32] > 0).astype(np.float32)
    right = (np.fliplr(resized[:, 32:]) > 0).astype(np.float32)
    diff = float(np.mean(np.abs(left - right)))
    symmetry_score = clamp((1.0 - diff) * 100.0)

    return {
        "length": float(length_score),
        "girth": float(girth_score),
        "symmetry": float(symmetry_score),
    }


def score_skin_and_presentation(img: np.ndarray, sil_mask: np.ndarray, bbox: tuple) -> Dict[str, float]:
    x, y, w, h = bbox
    # Skin clarity proxy: how "consistent" the intensity is inside the silhouette.
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0]

    crop_L = L[y : y + h, x : x + w]
    inside = crop_L[sil_mask > 0]
    if inside.size < 50:
        skin_std = 999.0
    else:
        skin_std = float(np.std(inside))

    skin_score = clamp(100.0 - skin_std * 1.2)

    # Presentation/grooming proxy: edge density outside silhouette should be lower.
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)

    crop_edges = edges[y : y + h, x : x + w]
    outside = crop_edges[sil_mask == 0]
    inside_edges = crop_edges[sil_mask > 0]

    outside_density = float(np.mean(outside > 0)) if outside.size else 1.0
    inside_density = float(np.mean(inside_edges > 0)) if inside_edges.size else 0.0

    # Penalize background clutter; slight reward for crisp edges on subject.
    presentation_score = clamp(100.0 - outside_density * 180.0 + inside_density * 20.0)

    return {"skin": float(skin_score), "presentation": float(presentation_score)}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    if not req.consented:
        raise HTTPException(status_code=400, detail="Consent required for analysis.")

    try:
        img_bytes = download_image_bytes(str(req.downloadUrl))
        img = load_image(img_bytes)
        img = resize_for_analysis(img)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load image: {e}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    quality = score_quality(gray)

    # Basic quality gate (entertainment; not medical)
    if quality["blur_score"] < 10.0 or min(h, w) < 256:
        return AnalyzeResponse(
            jobId=req.jobId,
            status="rejected_low_quality",
            feedback={
                "humor": "This photo is giving 'camera is sprinting' energy. Retake with steadier focus.",
                "confidence": "Low confidence due to blur / low detail. Entertainment-only scoring."
            },
            radar={
                "Length": 0,
                "Girth": 0,
                "Symmetry": 0,
                "Skin clarity": 0,
                "Presentation": 0,
                "Photo quality": to_int_score(quality["photo_quality"])
            },
            csamCheck={"status": "not_run_placeholder"}
        )

    seg = segment_silhouette(img)
    bbox = seg.get("bbox")
    sil_mask = seg.get("sil_mask")
    area = float(seg.get("area") or 0.0)

    if bbox is None or sil_mask is None or area < 2500:
        return AnalyzeResponse(
            jobId=req.jobId,
            status="rejected_unreadable",
            feedback={
                "humor": "I couldn't clearly read the shape. Your camera might be staging a plot twist.",
                "confidence": "Low confidence due to unreadable silhouette. Entertainment-only."
            },
            radar={
                "Length": 0,
                "Girth": 0,
                "Symmetry": 0,
                "Skin clarity": 0,
                "Presentation": 0,
                "Photo quality": to_int_score(quality["photo_quality"])
            },
            csamCheck={"status": "not_run_placeholder"}
        )

    shape_scores = score_shape(img, sil_mask, bbox)
    # Crop skin/presentation uses the same crop region assumption as sil_mask.
    skin_pres = score_skin_and_presentation(img, sil_mask, bbox)

    radar = {
        "Length": to_int_score(shape_scores["length"]),
        "Girth": to_int_score(shape_scores["girth"]),
        "Symmetry": to_int_score(shape_scores["symmetry"]),
        "Skin clarity": to_int_score(skin_pres["skin"]),
        "Presentation": to_int_score(skin_pres["presentation"]),
        "Photo quality": to_int_score(quality["photo_quality"]),
    }

    # Weighted entertainment score
    overall = (
        radar["Length"] * 0.40
        + radar["Girth"] * 0.35
        + radar["Symmetry"] * 0.10
        + radar["Skin clarity"] * 0.05
        + radar["Presentation"] * 0.05
        + radar["Photo quality"] * 0.05
    )
    overall_int = int(round(clamp(overall)))

    label = label_for_score(overall_int)

    # Confidence oriented (not clinical)
    seg_conf = clamp(20.0 + (shape_scores["symmetry"] * 0.3) + (area / (float(h * w) + 1e-6)) * 80.0)
    photo_conf = clamp(quality["photo_quality"] * 0.9)
    confidence = float(clamp(0.25 + 0.55 * (photo_conf / 100.0) + 0.2 * (seg_conf / 100.0), 0.0, 1.0))

    percentile = int(max(1, min(99, round(overall_int + (photo_conf - 50.0) / 6.0))))

    humor = (
        f"{label} vibes detected. Entertainment-only confidence scoring, not medical advice."
    )

    # Confidence-oriented feedback
    confidence_text = f"Confidence: {int(confidence * 100)}%. This is a playful visual read—your mileage may vary."

    ai_summary = f"Overall score: {overall_int}/100. Label: {label}. {confidence_text}"

    return AnalyzeResponse(
        jobId=req.jobId,
        status="completed",
        overallScore=overall_int,
        percentile=percentile,
        label=label,
        confidence=round(confidence, 2),
        feedback={"humor": humor, "confidence": confidence_text},
        radar=radar,
        aiSummary=ai_summary,
        csamCheck={"status": "not_run_placeholder"}
    )

