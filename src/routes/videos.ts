import { Router } from "express";
import multer from "multer";
import * as path from "node:path";
import { loadCdnConfig, createClient } from "../lib/5centscdn/index.js";
import { processVideo } from "../services/video-pipeline.js";
import { getActiveJobs } from "../services/transcode.js";

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

  // POST /api/videos/upload — Upload video, transcode, return HLS URL
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

      const result = await processVideo(req.file.path, getCdnConfig(), getCdnClient(), {
        autoTranscode,
        profileId,
        onProgress: (stage, detail) => {
          console.log(`[video-pipeline] ${stage}: ${detail}`);
        },
      });

      res.json({
        status: "ok",
        data: {
          filename: result.filename,
          remotePath: result.remotePath,
          sizeBytes: result.sizeBytes,
          hlsUrl: result.hlsUrl,
          transcode: result.transcode,
        },
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

  return router;
}
