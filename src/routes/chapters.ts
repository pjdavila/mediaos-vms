import { Router, type Request } from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import { detectChaptersAndStore } from "../services/chapter-detector.js";
import { getMetadata } from "../services/metadata-store.js";
import type { ChapterDetectionOptions } from "../services/chapter-detector.js";

/**
 * POST /api/videos/:videoId/chapters
 *
 * Trigger chapter detection for a video.
 * Requires transcript to already exist in metadata store.
 * Body: { "videoPath": "/path/to/local/file.mp4" }
 * Optional: sceneThreshold, minChapterDurationSec, maxChapters, model
 */
export function createChaptersRouter(): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request<{ videoId: string }>, res) => {
    const { videoId } = req.params;
    if (!videoId) {
      res.status(400).json({ error: "videoId is required in URL path" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "Chapter detection is not configured (OPENAI_API_KEY missing)" });
      return;
    }

    const { videoPath, sceneThreshold, minChapterDurationSec, maxChapters, model } = req.body;

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

    // Retrieve existing transcript and duration from metadata store
    const metadata = getMetadata(videoId);
    const segments = metadata?.transcript ?? [];
    const duration = metadata?.duration ?? 0;

    if (segments.length === 0) {
      res.status(400).json({
        error: "No transcript found for this video. Run transcription first (POST /api/videos/:videoId/transcripts).",
      });
      return;
    }

    if (duration <= 0) {
      res.status(400).json({
        error: "Video duration not available in metadata. Run transcription first.",
      });
      return;
    }

    const options: ChapterDetectionOptions = {};
    if (typeof sceneThreshold === "number") options.sceneThreshold = sceneThreshold;
    if (typeof minChapterDurationSec === "number") options.minChapterDurationSec = minChapterDurationSec;
    if (typeof maxChapters === "number") options.maxChapters = maxChapters;
    if (typeof model === "string") options.model = model;

    try {
      const result = await detectChaptersAndStore(videoId, resolvedPath, segments, duration, options);
      res.json({
        status: "ok",
        data: {
          videoId,
          chapters: result.chapters,
          sceneBoundariesDetected: result.sceneBoundaries.length,
          model: result.model,
        },
      });
    } catch (err) {
      console.error("[chapters] Chapter detection failed:", err);
      res.status(500).json({
        error: "Chapter detection failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
