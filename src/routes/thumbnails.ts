import { Router, type Request } from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import { selectThumbnailsAndStore } from "../services/thumbnail-selector.js";
import type { ThumbnailExtractionOptions } from "../services/thumbnail-selector.js";

/**
 * POST /api/videos/:videoId/thumbnails
 *
 * Trigger AI thumbnail selection for a video. Accepts:
 * - { "videoPath": "/path/to/local/file.mp4" }
 *
 * Optional config: maxCandidates, sceneThreshold, fallbackIntervalSec, topN, model
 * Optional: cdnBaseUrl (defaults to CDN_BASE_URL env var or empty string)
 */
export function createThumbnailsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request<{ videoId: string }>, res) => {
    const { videoId } = req.params;
    if (!videoId) {
      res.status(400).json({ error: "videoId is required in URL path" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "Thumbnail selection is not configured (OPENAI_API_KEY missing)" });
      return;
    }

    const { videoPath, maxCandidates, sceneThreshold, fallbackIntervalSec, topN, model, cdnBaseUrl } = req.body;

    if (!videoPath || typeof videoPath !== "string") {
      res.status(400).json({ error: "videoPath is required (local file path to the video)" });
      return;
    }

    const resolvedPath = path.isAbsolute(videoPath)
      ? videoPath
      : path.join(process.cwd(), "uploads", videoPath);

    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: "Video file not found", path: resolvedPath });
      return;
    }

    const cdn = cdnBaseUrl ?? process.env.CDN_BASE_URL ?? "";

    const options: ThumbnailExtractionOptions = {};
    if (typeof maxCandidates === "number") options.maxCandidates = maxCandidates;
    if (typeof sceneThreshold === "number") options.sceneThreshold = sceneThreshold;
    if (typeof fallbackIntervalSec === "number") options.fallbackIntervalSec = fallbackIntervalSec;
    if (typeof topN === "number") options.topN = topN;
    if (typeof model === "string") options.model = model;

    try {
      const result = await selectThumbnailsAndStore(videoId, resolvedPath, cdn, options);
      res.json({
        status: "ok",
        data: {
          videoId,
          thumbnails: result.thumbnails,
          candidatesEvaluated: result.candidatesEvaluated,
          model: result.model,
        },
      });
    } catch (err) {
      console.error("[thumbnails] Selection failed:", err);
      res.status(500).json({
        error: "Thumbnail selection failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
