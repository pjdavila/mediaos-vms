import { Router, type Request } from "express";
import {
  createScheduledPublish,
  getScheduledPublish,
  cancelScheduledPublish,
  listScheduledPublishes,
  processDueSchedules,
} from "../services/scheduler.js";

export function createSchedulerRouter(): Router {
  const router = Router({ mergeParams: true });

  // POST /api/schedules — Schedule a new publication
  router.post("/", (req, res) => {
    try {
      const { videoId, channelId, filePath, scheduledAt, timezone, maxRetries } = req.body;

      if (!videoId || !channelId || !filePath || !scheduledAt) {
        res.status(400).json({ error: "videoId, channelId, filePath, and scheduledAt are required" });
        return;
      }

      const schedule = createScheduledPublish({ videoId, channelId, filePath, scheduledAt, timezone, maxRetries });
      res.status(201).json({ status: "ok", data: schedule });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[scheduler] Error creating schedule:", err);
      res.status(400).json({ error: "Failed to create schedule", detail: message });
    }
  });

  // GET /api/schedules — List scheduled publications
  router.get("/", (req, res) => {
    try {
      const videoId = req.query.videoId as string | undefined;
      const channelId = req.query.channelId as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const result = listScheduledPublishes({ videoId, channelId, status: status as never, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[scheduler] Error listing schedules:", err);
      res.status(500).json({ error: "Failed to list schedules", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/schedules/:id — Get a single schedule
  router.get("/:id", (req: Request<{ id: string }>, res) => {
    try {
      const schedule = getScheduledPublish(req.params.id);
      if (!schedule) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      res.json({ status: "ok", data: schedule });
    } catch (err) {
      console.error("[scheduler] Error getting schedule:", err);
      res.status(500).json({ error: "Failed to get schedule", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // DELETE /api/schedules/:id — Cancel a pending schedule
  router.delete("/:id", (req: Request<{ id: string }>, res) => {
    try {
      const schedule = cancelScheduledPublish(req.params.id);
      if (!schedule) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      res.json({ status: "ok", data: schedule });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("Cannot cancel") ? 409 : 500;
      console.error("[scheduler] Error cancelling schedule:", err);
      res.status(status).json({ error: "Failed to cancel schedule", detail: message });
    }
  });

  // POST /api/schedules/process — Manually trigger processing of due schedules
  router.post("/process", async (_req, res) => {
    try {
      const results = await processDueSchedules();
      res.json({
        status: "ok",
        data: {
          processed: results.length,
          results,
        },
      });
    } catch (err) {
      console.error("[scheduler] Error processing due schedules:", err);
      res.status(500).json({ error: "Failed to process schedules", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
