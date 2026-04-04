import { Router, type Request } from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import { tagVideoAndStore } from "../services/ai-tagger.js";
import type { AiTaggingOptions } from "../services/ai-tagger.js";

/**
 * POST /api/videos/:videoId/ai-tags
 *
 * Trigger AI tagging for a video. Accepts either:
 * - { "videoPath": "/path/to/local/file.mp4" }  (server-side file)
 * - { "uploadDir": "uploads" } + existing uploaded file
 *
 * Optional config: intervalSec, maxFrames, minConfidence, model
 */
export function createAiTagsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request<{ videoId: string }>, res) => {
    const { videoId } = req.params;
    if (!videoId) {
      res.status(400).json({ error: "videoId is required in URL path" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "AI tagging is not configured (OPENAI_API_KEY missing)" });
      return;
    }

    const { videoPath, intervalSec, maxFrames, minConfidence, model } = req.body;

    if (!videoPath || typeof videoPath !== "string") {
      res.status(400).json({ error: "videoPath is required (local file path to the video)" });
      return;
    }

    // Resolve relative paths against the uploads directory
    const resolvedPath = path.isAbsolute(videoPath)
      ? videoPath
      : path.join(process.cwd(), "uploads", videoPath);

    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: "Video file not found", path: resolvedPath });
      return;
    }

    const options: AiTaggingOptions = {};
    if (typeof intervalSec === "number") options.intervalSec = intervalSec;
    if (typeof maxFrames === "number") options.maxFrames = maxFrames;
    if (typeof minConfidence === "number") options.minConfidence = minConfidence;
    if (typeof model === "string") options.model = model;

    try {
      const result = await tagVideoAndStore(videoId, resolvedPath, options);
      res.json({
        status: "ok",
        data: {
          videoId,
          tags: result.tags,
          framesAnalyzed: result.framesAnalyzed,
          model: result.model,
        },
      });
    } catch (err) {
      console.error("[ai-tags] Tagging failed:", err);
      res.status(500).json({
        error: "AI tagging failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
