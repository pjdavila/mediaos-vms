import { Router, type Request } from "express";
import multer from "multer";
import * as path from "node:path";
import { ZodError } from "zod";
import { loadCdnConfig, createClient } from "../lib/5centscdn/index.js";
import { processVideo } from "../services/video-pipeline.js";
import { getActiveJobs } from "../services/transcode.js";
import { UpdateVideoSchema } from "../schemas/videos.js";
import {
  createVideoRecord, getVideoRecord, updateVideoRecord, deleteVideoRecord, listVideoRecords,
} from "../services/video-store.js";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB
  fileFilter: (_req, file, cb) => {
    const allowed = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".wmv", ".mpeg", ".mpg", ".m4v"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

export function createVideoRouter(): Router {
  const router = Router();

  let _config: ReturnType<typeof loadCdnConfig> | null = null;
  let _client: ReturnType<typeof createClient> | null = null;

  function getCdnConfig() {
    if (!_config) _config = loadCdnConfig();
    return _config;
  }

  function getCdnClient() {
    if (!_client) _client = createClient(getCdnConfig());
    return _client;
  }

  // POST /api/videos/upload — Upload video, transcode, return HLS URL + persist to DB
  router.post("/upload", upload.single("video"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No video file provided" });
      return;
    }

    try {
      const autoTranscode = req.body.autoTranscode !== "false";
      const profileId = req.body.profileId
        ? Number(req.body.profileId)
        : undefined;
      const skipAiMetadata = req.body.skipAiMetadata === "true";
      const title = (req.body.title as string) || req.file.originalname || req.file.filename;
      const userId = req.body.userId as string | undefined;

      // Create DB record immediately with uploading status
      const videoRecord = createVideoRecord({
        title,
        description: req.body.description as string | undefined,
        filename: req.file.originalname || req.file.filename,
        sizeBytes: req.file.size,
        status: "uploading",
        format: path.extname(req.file.originalname || "").replace(".", "").toUpperCase() || undefined,
        userId,
      });

      // Process in background — update record as pipeline progresses
      processVideo(req.file.path, getCdnConfig(), getCdnClient(), {
        autoTranscode,
        profileId,
        videoId: !skipAiMetadata ? videoRecord.videoId : undefined,
        onProgress: (stage, detail) => {
          console.log(`[video-pipeline] ${stage}: ${detail}`);
          if (stage === "upload") {
            updateVideoRecord(videoRecord.videoId, { status: "processing" });
          }
        },
      }).then((result) => {
        updateVideoRecord(videoRecord.videoId, {
          hlsUrl: result.hlsUrl ?? undefined,
          status: "ready",
        });
        console.log(`[videos] ${videoRecord.videoId} pipeline complete`);
      }).catch((err) => {
        updateVideoRecord(videoRecord.videoId, { status: "failed" });
        console.error(`[videos] ${videoRecord.videoId} pipeline failed:`, err);
      });

      res.status(201).json({
        status: "ok",
        data: videoRecord,
      });
    } catch (err) {
      console.error("[video-pipeline] Error:", err);
      res.status(500).json({
        error: "Video processing failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/videos/jobs — List active transcoding jobs
  router.get("/jobs", async (_req, res) => {
    try {
      const jobs = await getActiveJobs(getCdnClient());
      res.json({ status: "ok", data: jobs });
    } catch (err) {
      console.error("[transcode] Error listing jobs:", err);
      res.status(500).json({
        error: "Failed to list jobs",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/videos/profiles — List transcoding profiles
  router.get("/profiles", async (_req, res) => {
    try {
      const profiles = await getCdnClient().listProfiles();
      res.json({ status: "ok", data: profiles });
    } catch (err) {
      console.error("[transcode] Error listing profiles:", err);
      res.status(500).json({
        error: "Failed to list profiles",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/videos/zones — List CDN zones
  router.get("/zones", async (_req, res) => {
    try {
      const zones = await getCdnClient().listZones();
      res.json({ status: "ok", data: zones });
    } catch (err) {
      console.error("[zones] Error listing zones:", err);
      res.status(500).json({
        error: "Failed to list zones",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ── Video Library CRUD ──

  // GET /api/videos — List all videos
  router.get("/", (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const userId = req.query.userId as string | undefined;
      const search = req.query.search as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const result = listVideoRecords({ status: status as any, userId, search, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[videos] Error listing videos:", err);
      res.status(500).json({ error: "Failed to list videos", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/videos/:videoId — Get video detail
  router.get("/:videoId", (req: Request<{ videoId: string }>, res) => {
    try {
      const video = getVideoRecord(req.params.videoId);
      if (!video) { res.status(404).json({ error: "Video not found" }); return; }
      res.json({ status: "ok", data: video });
    } catch (err) {
      console.error("[videos] Error getting video:", err);
      res.status(500).json({ error: "Failed to get video", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // PATCH /api/videos/:videoId — Update video metadata
  router.patch("/:videoId", (req: Request<{ videoId: string }>, res) => {
    try {
      const patch = UpdateVideoSchema.parse(req.body);
      const video = updateVideoRecord(req.params.videoId, patch);
      if (!video) { res.status(404).json({ error: "Video not found" }); return; }
      res.json({ status: "ok", data: video });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid video data", detail: err.errors });
        return;
      }
      console.error("[videos] Error updating video:", err);
      res.status(500).json({ error: "Failed to update video", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // DELETE /api/videos/:videoId — Delete a video
  router.delete("/:videoId", (req: Request<{ videoId: string }>, res) => {
    try {
      const deleted = deleteVideoRecord(req.params.videoId);
      if (!deleted) { res.status(404).json({ error: "Video not found" }); return; }
      res.json({ status: "ok", message: "Video deleted" });
    } catch (err) {
      console.error("[videos] Error deleting video:", err);
      res.status(500).json({ error: "Failed to delete video", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
