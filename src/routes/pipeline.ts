import { Router, type Request } from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { runAiMetadataPipeline, triggerAiMetadataPipeline } from "../services/ai-metadata-pipeline.js";
import { getMetadata } from "../services/metadata-store.js";
import { registerWebhook, getWebhooks, clearWebhooks } from "../services/webhook-emitter.js";

export function createPipelineRouter(): Router {
  const router = Router({ mergeParams: true });

  /**
   * POST /api/videos/:videoId/pipeline
   * Manually trigger the AI metadata pipeline for a video.
   * Body: { videoPath: string, async?: boolean, skip?: { tags, transcript, thumbnails, chapters } }
   */
  router.post("/", async (req: Request<{ videoId: string }>, res) => {
    const { videoId } = req.params;
    if (!videoId) {
      res.status(400).json({ error: "videoId is required" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "AI pipeline not configured (OPENAI_API_KEY missing)" });
      return;
    }

    const { videoPath, async: asyncMode, skip } = req.body;

    if (!videoPath || typeof videoPath !== "string") {
      res.status(400).json({ error: "videoPath is required" });
      return;
    }

    const resolvedPath = path.isAbsolute(videoPath)
      ? videoPath
      : path.join(process.cwd(), "uploads", videoPath);

    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: "Video file not found", path: resolvedPath });
      return;
    }

    const options = { skip };

    if (asyncMode !== false) {
      // Default: async (fire-and-forget)
      triggerAiMetadataPipeline(videoId, resolvedPath, options);
      res.json({
        status: "ok",
        message: "AI metadata pipeline triggered",
        videoId,
        metadataStatus: "pending",
      });
    } else {
      // Synchronous: wait for completion
      try {
        const result = await runAiMetadataPipeline(videoId, resolvedPath, options);
        res.json({ status: "ok", data: result });
      } catch (err) {
        res.status(500).json({
          error: "Pipeline failed",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  /**
   * GET /api/videos/:videoId/pipeline/status
   * Check the current metadata processing status for a video.
   */
  router.get("/status", (req: Request<{ videoId: string }>, res) => {
    const { videoId } = req.params;
    const meta = getMetadata(videoId);

    if (!meta) {
      res.status(404).json({ error: "No metadata found for this video" });
      return;
    }

    res.json({
      status: "ok",
      data: {
        videoId,
        metadataStatus: meta.status,
        hasTags: meta.tags.length > 0,
        hasTranscript: meta.transcript.length > 0,
        hasThumbnails: meta.thumbnails.length > 0,
        hasChapters: meta.chapters.length > 0,
        updatedAt: meta.updatedAt,
      },
    });
  });

  return router;
}

/**
 * Webhook management routes: POST/GET/DELETE /api/webhooks
 */
export function createWebhookRouter(): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const { url, secret } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }
    registerWebhook({ url, secret });
    res.json({ status: "ok", message: "Webhook registered" });
  });

  router.get("/", (_req, res) => {
    const hooks = getWebhooks().map((h) => ({
      url: h.url,
      hasSecret: !!h.secret,
    }));
    res.json({ status: "ok", data: hooks });
  });

  router.delete("/", (_req, res) => {
    clearWebhooks();
    res.json({ status: "ok", message: "All webhooks cleared" });
  });

  return router;
}
