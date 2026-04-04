import { Router } from "express";
import { createClient, loadCdnConfig } from "../lib/5centscdn/index.js";
import {
  createLiveStream,
  listLiveStreams,
  getLiveStream,
  setStreamEnabled,
  deleteLiveStream,
} from "../services/stream.js";

export function createStreamRouter(): Router {
  const router = Router();

  let _client: ReturnType<typeof createClient> | null = null;

  function getCdnClient() {
    if (!_client) _client = createClient(loadCdnConfig());
    return _client;
  }

  // POST /api/streams — Create a new live push stream
  router.post("/", async (req, res) => {
    const { name, server, codec, protocols } = req.body;

    if (!name) {
      res.status(400).json({ error: "Stream name is required" });
      return;
    }

    try {
      const stream = await createLiveStream(getCdnClient(), {
        name,
        server,
        codec,
        protocols,
      });
      res.status(201).json({ status: "ok", data: stream });
    } catch (err) {
      console.error("[streams] Error creating stream:", err);
      res.status(500).json({
        error: "Failed to create stream",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/streams — List all live streams
  router.get("/", async (_req, res) => {
    try {
      const streams = await listLiveStreams(getCdnClient());
      res.json({ status: "ok", data: streams });
    } catch (err) {
      console.error("[streams] Error listing streams:", err);
      res.status(500).json({
        error: "Failed to list streams",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/streams/:id — Get stream details with optional stats
  router.get("/:id", async (req, res) => {
    const streamId = Number(req.params.id);
    if (Number.isNaN(streamId)) {
      res.status(400).json({ error: "Invalid stream ID" });
      return;
    }

    const includeStats = req.query.stats === "true";

    try {
      const stream = await getLiveStream(getCdnClient(), streamId, includeStats);
      res.json({ status: "ok", data: stream });
    } catch (err) {
      console.error("[streams] Error getting stream:", err);
      res.status(500).json({
        error: "Failed to get stream",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PATCH /api/streams/:id/enable — Enable a stream
  router.patch("/:id/enable", async (req, res) => {
    const streamId = Number(req.params.id);
    if (Number.isNaN(streamId)) {
      res.status(400).json({ error: "Invalid stream ID" });
      return;
    }

    try {
      const stream = await setStreamEnabled(getCdnClient(), streamId, true);
      res.json({ status: "ok", data: stream });
    } catch (err) {
      console.error("[streams] Error enabling stream:", err);
      res.status(500).json({
        error: "Failed to enable stream",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PATCH /api/streams/:id/disable — Disable a stream
  router.patch("/:id/disable", async (req, res) => {
    const streamId = Number(req.params.id);
    if (Number.isNaN(streamId)) {
      res.status(400).json({ error: "Invalid stream ID" });
      return;
    }

    try {
      const stream = await setStreamEnabled(getCdnClient(), streamId, false);
      res.json({ status: "ok", data: stream });
    } catch (err) {
      console.error("[streams] Error disabling stream:", err);
      res.status(500).json({
        error: "Failed to disable stream",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // DELETE /api/streams/:id — Delete a stream
  router.delete("/:id", async (req, res) => {
    const streamId = Number(req.params.id);
    if (Number.isNaN(streamId)) {
      res.status(400).json({ error: "Invalid stream ID" });
      return;
    }

    try {
      await deleteLiveStream(getCdnClient(), streamId);
      res.json({ status: "ok", message: "Stream deleted" });
    } catch (err) {
      console.error("[streams] Error deleting stream:", err);
      res.status(500).json({
        error: "Failed to delete stream",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
