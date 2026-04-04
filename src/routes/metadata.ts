import { Router, type Request } from "express";
import { ZodError } from "zod";
import { VideoMetadataPatchSchema } from "../schemas/metadata.js";
import {
  getMetadata,
  upsertMetadata,
  listMetadata,
} from "../services/metadata-store.js";

export function createMetadataRouter(): Router {
  const router = Router({ mergeParams: true });

  // When mounted at /api/videos/metadata → list all
  // When mounted at /api/videos/:videoId/metadata → get/patch one
  router.get("/", (req: Request<{ videoId?: string }>, res) => {
    try {
      const { videoId } = req.params;

      // If videoId is present (mounted at /api/videos/:videoId/metadata), return single
      if (videoId) {
        const metadata = getMetadata(videoId);
        if (!metadata) {
          res.status(404).json({ error: "Metadata not found for this video" });
          return;
        }
        res.json({ status: "ok", data: metadata });
        return;
      }

      // Otherwise list all metadata
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const result = listMetadata({ status, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[metadata] Error:", err);
      res.status(500).json({
        error: "Failed to get metadata",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PATCH /api/videos/:videoId/metadata — Create or update metadata
  router.patch("/", (req: Request<{ videoId?: string }>, res) => {
    try {
      const { videoId } = req.params;
      if (!videoId) {
        res.status(400).json({ error: "videoId is required" });
        return;
      }

      const patch = VideoMetadataPatchSchema.parse(req.body);
      const metadata = upsertMetadata(videoId, patch);
      res.json({ status: "ok", data: metadata });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "Invalid metadata",
          detail: err.errors,
        });
        return;
      }
      console.error("[metadata] Error updating metadata:", err);
      res.status(500).json({
        error: "Failed to update metadata",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
