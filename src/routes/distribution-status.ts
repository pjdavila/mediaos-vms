import { Router, type Request } from "express";
import {
  createDistributionRecord,
  getDistributionRecord,
  updateDistributionStatus,
  getVideoDistributionStatus,
  getChannelDistributionStatus,
  listDistributionStatus,
  type DistributionStatus,
} from "../services/distribution-status.js";

const VALID_STATUSES: DistributionStatus[] = ["queued", "processing", "live", "failed", "cancelled"];

export function createDistributionStatusRouter(): Router {
  const router = Router({ mergeParams: true });

  // GET /api/distribution — List all distribution records
  router.get("/", (_req, res) => {
    try {
      const status = _req.query.status as DistributionStatus | undefined;
      const limit = _req.query.limit ? Number(_req.query.limit) : undefined;
      const offset = _req.query.offset ? Number(_req.query.offset) : undefined;

      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
        return;
      }

      const result = listDistributionStatus({ status, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[dist-status] Error listing:", err);
      res.status(500).json({ error: "Failed to list distribution status", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/distribution — Create a new distribution record
  router.post("/", (req, res) => {
    try {
      const { videoId, channelId, channelType } = req.body;
      if (!videoId || !channelId || !channelType) {
        res.status(400).json({ error: "videoId, channelId, and channelType are required" });
        return;
      }
      const record = createDistributionRecord(videoId, channelId, channelType);
      res.status(201).json({ status: "ok", data: record });
    } catch (err) {
      console.error("[dist-status] Error creating:", err);
      res.status(500).json({ error: "Failed to create distribution record", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/distribution/:id — Get a single distribution record
  router.get("/:id", (req: Request<{ id: string }>, res) => {
    try {
      const record = getDistributionRecord(req.params.id);
      if (!record) {
        res.status(404).json({ error: "Distribution record not found" });
        return;
      }
      res.json({ status: "ok", data: record });
    } catch (err) {
      console.error("[dist-status] Error getting:", err);
      res.status(500).json({ error: "Failed to get distribution record", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // PATCH /api/distribution/:id — Update distribution status
  router.patch("/:id", (req: Request<{ id: string }>, res) => {
    try {
      const { status, platformId, platformUrl, error } = req.body;
      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `status is required and must be one of: ${VALID_STATUSES.join(", ")}` });
        return;
      }

      const record = updateDistributionStatus(req.params.id, status, { platformId, platformUrl, error });
      if (!record) {
        res.status(404).json({ error: "Distribution record not found" });
        return;
      }
      res.json({ status: "ok", data: record });
    } catch (err) {
      console.error("[dist-status] Error updating:", err);
      res.status(500).json({ error: "Failed to update distribution status", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

export function createVideoDistStatusRouter(): Router {
  const router = Router({ mergeParams: true });

  // GET /api/videos/:videoId/distribution — Get distribution status for a video
  router.get("/", (req: Request<{ videoId: string }>, res) => {
    try {
      const records = getVideoDistributionStatus(req.params.videoId);
      res.json({ status: "ok", data: records });
    } catch (err) {
      console.error("[dist-status] Error getting video status:", err);
      res.status(500).json({ error: "Failed to get video distribution status", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

export function createChannelDistStatusRouter(): Router {
  const router = Router({ mergeParams: true });

  // GET /api/channels/:channelId/distribution — Get distribution status for a channel
  router.get("/", (req: Request<{ channelId: string }>, res) => {
    try {
      const status = req.query.status as DistributionStatus | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const result = getChannelDistributionStatus(req.params.channelId, { status, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[dist-status] Error getting channel status:", err);
      res.status(500).json({ error: "Failed to get channel distribution status", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
