import { Router } from "express";
import { ZodError } from "zod";
import { CreateRevenueEventSchema } from "../schemas/revenue.js";
import {
  recordRevenue, listRevenueEvents,
  getRevenueSummary, getDailyRevenue, getRevenueByAsset, getRevenueByChannel,
} from "../services/revenue-store.js";

/** Revenue event ingestion: /api/revenue/events */
export function createRevenueEventsRouter(): Router {
  const router = Router();

  // POST /api/revenue/events — Record a revenue event
  router.post("/", (req, res) => {
    try {
      const input = CreateRevenueEventSchema.parse(req.body);
      const event = recordRevenue(input);
      res.status(201).json({ status: "ok", data: event });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid revenue event", detail: err.errors });
        return;
      }
      console.error("[revenue] Error recording event:", err);
      res.status(500).json({ error: "Failed to record revenue event", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/revenue/events — List revenue events (filters: videoId, channelId, source, from, to)
  router.get("/", (req, res) => {
    try {
      const result = listRevenueEvents({
        videoId: req.query.videoId as string | undefined,
        channelId: req.query.channelId as string | undefined,
        source: req.query.source as any,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[revenue] Error listing events:", err);
      res.status(500).json({ error: "Failed to list revenue events", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Revenue analytics: /api/revenue/analytics */
export function createRevenueAnalyticsRouter(): Router {
  const router = Router();

  // GET /api/revenue/analytics/summary — Aggregate revenue summary
  router.get("/summary", (req, res) => {
    try {
      const summary = getRevenueSummary({
        videoId: req.query.videoId as string | undefined,
        channelId: req.query.channelId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      res.json({ status: "ok", data: summary });
    } catch (err) {
      console.error("[revenue] Error getting summary:", err);
      res.status(500).json({ error: "Failed to get revenue summary", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/revenue/analytics/daily — Daily time-series breakdown
  router.get("/daily", (req, res) => {
    try {
      const daily = getDailyRevenue({
        videoId: req.query.videoId as string | undefined,
        channelId: req.query.channelId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      res.json({ status: "ok", data: daily });
    } catch (err) {
      console.error("[revenue] Error getting daily revenue:", err);
      res.status(500).json({ error: "Failed to get daily revenue", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/revenue/analytics/by-asset — Revenue ranked by video asset
  router.get("/by-asset", (req, res) => {
    try {
      const assets = getRevenueByAsset({
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ status: "ok", data: assets });
    } catch (err) {
      console.error("[revenue] Error getting per-asset revenue:", err);
      res.status(500).json({ error: "Failed to get per-asset revenue", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/revenue/analytics/by-channel — Revenue ranked by channel
  router.get("/by-channel", (req, res) => {
    try {
      const channels = getRevenueByChannel({
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ status: "ok", data: channels });
    } catch (err) {
      console.error("[revenue] Error getting per-channel revenue:", err);
      res.status(500).json({ error: "Failed to get per-channel revenue", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
