import { Router, type Request } from "express";
import { ZodError } from "zod";
import { CreateAdPodSchema, UpdateAdPodSchema } from "../schemas/ads.js";
import {
  createAdPod,
  getAdPod,
  updateAdPod,
  deleteAdPod,
  listAdPods,
} from "../services/ad-store.js";
import { generateVastResponse } from "../services/vast-service.js";
import {
  createSsaiSession,
  getSsaiSession,
  rewriteHlsManifest,
} from "../services/ssai-service.js";

/** CRUD routes for ad pod configurations: /api/ads/pods */
export function createAdPodsRouter(): Router {
  const router = Router({ mergeParams: true });

  // POST /api/ads/pods — Create an ad pod config
  router.post("/", (req, res) => {
    try {
      const input = CreateAdPodSchema.parse(req.body);
      const pod = createAdPod(input);
      res.status(201).json({ status: "ok", data: pod });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid ad pod data", detail: err.errors });
        return;
      }
      console.error("[ads] Error creating ad pod:", err);
      res.status(500).json({
        error: "Failed to create ad pod",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/ads/pods — List ad pods (filters: videoId, channelId, enabled)
  router.get("/", (req, res) => {
    try {
      const videoId = req.query.videoId as string | undefined;
      const channelId = req.query.channelId as string | undefined;
      const enabled = req.query.enabled !== undefined
        ? req.query.enabled === "true"
        : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const result = listAdPods({ videoId, channelId, enabled, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[ads] Error listing ad pods:", err);
      res.status(500).json({
        error: "Failed to list ad pods",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/ads/pods/:adPodId — Get a single ad pod
  router.get("/:adPodId", (req: Request<{ adPodId: string }>, res) => {
    try {
      const pod = getAdPod(req.params.adPodId);
      if (!pod) {
        res.status(404).json({ error: "Ad pod not found" });
        return;
      }
      res.json({ status: "ok", data: pod });
    } catch (err) {
      console.error("[ads] Error getting ad pod:", err);
      res.status(500).json({
        error: "Failed to get ad pod",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PATCH /api/ads/pods/:adPodId — Update an ad pod
  router.patch("/:adPodId", (req: Request<{ adPodId: string }>, res) => {
    try {
      const patch = UpdateAdPodSchema.parse(req.body);
      const pod = updateAdPod(req.params.adPodId, patch);
      if (!pod) {
        res.status(404).json({ error: "Ad pod not found" });
        return;
      }
      res.json({ status: "ok", data: pod });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid ad pod data", detail: err.errors });
        return;
      }
      console.error("[ads] Error updating ad pod:", err);
      res.status(500).json({
        error: "Failed to update ad pod",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // DELETE /api/ads/pods/:adPodId — Delete an ad pod
  router.delete("/:adPodId", (req: Request<{ adPodId: string }>, res) => {
    try {
      const deleted = deleteAdPod(req.params.adPodId);
      if (!deleted) {
        res.status(404).json({ error: "Ad pod not found" });
        return;
      }
      res.json({ status: "ok", message: "Ad pod deleted" });
    } catch (err) {
      console.error("[ads] Error deleting ad pod:", err);
      res.status(500).json({
        error: "Failed to delete ad pod",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

/** VAST tag endpoint: GET /api/ads/vast?videoId=...&channelId=...&position=... */
export function createVastRouter(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    try {
      const videoId = req.query.videoId as string | undefined;
      const channelId = req.query.channelId as string | undefined;
      const position = req.query.position as string | undefined;

      if (!videoId && !channelId) {
        res.status(400).json({ error: "videoId or channelId required" });
        return;
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const xml = generateVastResponse(
        {
          videoId,
          channelId,
          position: position as "pre-roll" | "mid-roll" | "post-roll" | undefined,
        },
        baseUrl
      );

      res.set("Content-Type", "application/xml");
      res.send(xml);
    } catch (err) {
      console.error("[ads] Error generating VAST:", err);
      res.status(500).json({
        error: "Failed to generate VAST response",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

/** SSAI session routes: POST /api/ads/ssai/session, GET /api/ads/ssai/manifest/:sessionId */
export function createSsaiRouter(): Router {
  const router = Router();

  // POST /api/ads/ssai/session — Create an SSAI session for a video
  router.post("/session", (req, res) => {
    try {
      const { videoId, manifestUrl, channelId } = req.body;

      if (!videoId || !manifestUrl) {
        res.status(400).json({ error: "videoId and manifestUrl are required" });
        return;
      }

      const session = createSsaiSession(videoId, manifestUrl, channelId);
      if (!session) {
        res.status(404).json({ error: "No SSAI-enabled ad pods found for this video" });
        return;
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      res.status(201).json({
        status: "ok",
        data: {
          sessionId: session.sessionId,
          manifestUrl: `${baseUrl}/api/ads/ssai/manifest/${session.sessionId}`,
          adBreaks: session.adBreaks,
        },
      });
    } catch (err) {
      console.error("[ads] Error creating SSAI session:", err);
      res.status(500).json({
        error: "Failed to create SSAI session",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/ads/ssai/manifest/:sessionId — Get ad-stitched HLS manifest
  router.get("/manifest/:sessionId", async (req, res) => {
    try {
      const session = getSsaiSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: "SSAI session not found or expired" });
        return;
      }

      // Fetch the original manifest
      const manifestRes = await fetch(session.manifestUrl);
      if (!manifestRes.ok) {
        res.status(502).json({ error: "Failed to fetch original manifest" });
        return;
      }

      const manifest = await manifestRes.text();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const rewritten = rewriteHlsManifest(manifest, session, baseUrl);

      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.send(rewritten);
    } catch (err) {
      console.error("[ads] Error serving SSAI manifest:", err);
      res.status(500).json({
        error: "Failed to serve SSAI manifest",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

/** Ad event tracking: GET /api/ads/tracking/:event */
export function createAdTrackingRouter(): Router {
  const router = Router();

  router.get("/:event", (req, res) => {
    const { event } = req.params;
    const { ad } = req.query;

    console.log(`[ads:tracking] event=${event} ad=${ad}`);

    // Return 1x1 transparent GIF (tracking pixel)
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-store");
    res.send(pixel);
  });

  return router;
}
