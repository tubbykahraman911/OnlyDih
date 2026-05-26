import { Router } from "express";
import { z } from "zod";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const response = z.object({ ok: z.literal(true), service: z.literal("sizeai-api") }).parse({
    ok: true,
    service: "sizeai-api"
  });
  res.json(response);
});

