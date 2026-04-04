import { Router, type Request } from "express";
import { publishToChannel, publishToMultipleChannels } from "../services/publisher.js";

export function createPublishRouter(): Router {
  const router = Router({ mergeParams: true });

  // POST /api/videos/:videoId/publish — Publish to a single channel
  router.post("/", async (req: Request<{ videoId: string }>, res) => {
    try {
      const { videoId } = req.params;
      const { channelId, filePath, metadata } = req.body;

      if (!channelId) {
        res.status(400).json({ error: "channelId is required" });
        return;
      }
      if (!filePath) {
        res.status(400).json({ error: "filePath is required" });
        return;
      }

      const result = await publishToChannel({ videoId, channelId, filePath, metadata });

      const status = result.status === "published" ? 200 : 502;
      res.status(status).json({ status: result.status === "published" ? "ok" : "error", data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404
        : message.includes("not active") ? 409
        : 500;
      console.error("[publish] Error:", err);
      res.status(status).json({ error: "Publish failed", detail: message });
    }
  });

  // POST /api/videos/:videoId/publish/batch — Publish to multiple channels
  router.post("/batch", async (req: Request<{ videoId: string }>, res) => {
    try {
      const { videoId } = req.params;
      const { channelIds, filePath, metadata } = req.body;

      if (!Array.isArray(channelIds) || channelIds.length === 0) {
        res.status(400).json({ error: "channelIds (non-empty array) is required" });
        return;
      }
      if (!filePath) {
        res.status(400).json({ error: "filePath is required" });
        return;
      }

      const results = await publishToMultipleChannels(videoId, channelIds, filePath, metadata);

      const published = results.filter((r) => r.status === "published").length;
      const failed = results.filter((r) => r.status === "failed").length;

      res.json({
        status: failed === 0 ? "ok" : published > 0 ? "partial" : "error",
        data: { results, summary: { total: results.length, published, failed } },
      });
    } catch (err) {
      console.error("[publish] Batch error:", err);
      res.status(500).json({
        error: "Batch publish failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
