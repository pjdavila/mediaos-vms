import { Router, type Request } from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import { transcribeVideoAndStore } from "../services/transcriber.js";
import type { TranscriptionOptions } from "../services/transcriber.js";

/**
 * POST /api/videos/:videoId/transcripts
 *
 * Trigger transcription for a video.
 * Body: { "videoPath": "/path/to/local/file.mp4" }
 * Optional: language (ISO-639-1), model, prompt
 */
export function createTranscriptsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request<{ videoId: string }>, res) => {
    const { videoId } = req.params;
    if (!videoId) {
      res.status(400).json({ error: "videoId is required in URL path" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "Transcription is not configured (OPENAI_API_KEY missing)" });
      return;
    }

    const { videoPath, language, model, prompt } = req.body;

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

    const options: TranscriptionOptions = {};
    if (typeof language === "string") options.language = language;
    if (typeof model === "string") options.model = model;
    if (typeof prompt === "string") options.prompt = prompt;

    try {
      const result = await transcribeVideoAndStore(videoId, resolvedPath, options);
      res.json({
        status: "ok",
        data: {
          videoId,
          segments: result.segments,
          language: result.language,
          duration: result.duration,
          fullText: result.fullText,
          model: result.model,
        },
      });
    } catch (err) {
      console.error("[transcripts] Transcription failed:", err);
      res.status(500).json({
        error: "Transcription failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
