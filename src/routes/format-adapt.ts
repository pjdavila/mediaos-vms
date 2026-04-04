import { Router, type Request } from "express";
import { createClient, loadCdnConfig } from "../lib/5centscdn/index.js";
import { adaptVideoForChannel, previewAdaptation } from "../services/format-adapter.js";

export function createFormatAdaptRouter(): Router {
  const router = Router({ mergeParams: true });

  // POST /api/videos/:videoId/adapt — Adapt video for a distribution channel
  router.post("/", async (req: Request<{ videoId: string }>, res) => {
    try {
      const { videoId } = req.params;
      const { channelId, zoneId } = req.body;

      if (!channelId) {
        res.status(400).json({ error: "channelId is required" });
        return;
      }
      if (!zoneId || typeof zoneId !== "number") {
        res.status(400).json({ error: "zoneId (number) is required" });
        return;
      }

      const client = createClient(loadCdnConfig());
      const result = await adaptVideoForChannel(client, { videoId, channelId, zoneId });

      res.json({ status: "ok", data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404
        : message.includes("not active") ? 409
        : 500;

      console.error("[format-adapt] Error:", err);
      res.status(status).json({ error: "Format adaptation failed", detail: message });
    }
  });

  // GET /api/videos/:videoId/adapt/preview?channelId=... — Preview adaptation without transcoding
  router.get("/preview", (req: Request<{ videoId: string }>, res) => {
    try {
      const { videoId } = req.params;
      const channelId = req.query.channelId as string;

      if (!channelId) {
        res.status(400).json({ error: "channelId query parameter is required" });
        return;
      }

      const preview = previewAdaptation(videoId, channelId);

      res.json({ status: "ok", data: preview });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 500;

      console.error("[format-adapt] Preview error:", err);
      res.status(status).json({ error: "Preview failed", detail: message });
    }
  });

  return router;
}
