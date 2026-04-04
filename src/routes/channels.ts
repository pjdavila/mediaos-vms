import { Router, type Request } from "express";
import { ZodError } from "zod";
import { CreateChannelSchema, UpdateChannelSchema, ChannelTypeSchema } from "../schemas/channels.js";
import {
  createChannel,
  getChannel,
  updateChannel,
  deleteChannel,
  listChannels,
} from "../services/channel-store.js";

export function createChannelsRouter(): Router {
  const router = Router({ mergeParams: true });

  // POST /api/channels — Create a new distribution channel
  router.post("/", (req, res) => {
    try {
      const input = CreateChannelSchema.parse(req.body);
      const channel = createChannel(input);
      res.status(201).json({ status: "ok", data: channel });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid channel data", detail: err.errors });
        return;
      }
      console.error("[channels] Error creating channel:", err);
      res.status(500).json({
        error: "Failed to create channel",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/channels — List all channels (optional filters: type, status)
  router.get("/", (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      if (type) {
        const result = ChannelTypeSchema.safeParse(type);
        if (!result.success) {
          res.status(400).json({
            error: "Invalid channel type",
            detail: `Must be one of: ${ChannelTypeSchema.options.join(", ")}`,
          });
          return;
        }
      }

      const result = listChannels({ type, status, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[channels] Error listing channels:", err);
      res.status(500).json({
        error: "Failed to list channels",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/channels/:channelId — Get a single channel
  router.get("/:channelId", (req: Request<{ channelId: string }>, res) => {
    try {
      const channel = getChannel(req.params.channelId);
      if (!channel) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }
      res.json({ status: "ok", data: channel });
    } catch (err) {
      console.error("[channels] Error getting channel:", err);
      res.status(500).json({
        error: "Failed to get channel",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PATCH /api/channels/:channelId — Update a channel
  router.patch("/:channelId", (req: Request<{ channelId: string }>, res) => {
    try {
      const patch = UpdateChannelSchema.parse(req.body);
      const channel = updateChannel(req.params.channelId, patch);
      if (!channel) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }
      res.json({ status: "ok", data: channel });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid channel data", detail: err.errors });
        return;
      }
      console.error("[channels] Error updating channel:", err);
      res.status(500).json({
        error: "Failed to update channel",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // DELETE /api/channels/:channelId — Delete a channel
  router.delete("/:channelId", (req: Request<{ channelId: string }>, res) => {
    try {
      const deleted = deleteChannel(req.params.channelId);
      if (!deleted) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }
      res.json({ status: "ok", message: "Channel deleted" });
    } catch (err) {
      console.error("[channels] Error deleting channel:", err);
      res.status(500).json({
        error: "Failed to delete channel",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
