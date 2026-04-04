import "dotenv/config";
import express from "express";
import cors from "cors";
import { createVideoRouter } from "./routes/videos.js";
import { createStreamRouter } from "./routes/streams.js";
import { createMetadataRouter } from "./routes/metadata.js";
import { createAiTagsRouter } from "./routes/ai-tags.js";
import { createTranscriptsRouter } from "./routes/transcripts.js";
import { createThumbnailsRouter } from "./routes/thumbnails.js";
import { createChaptersRouter } from "./routes/chapters.js";
import { createPipelineRouter, createWebhookRouter } from "./routes/pipeline.js";
import { createChannelsRouter } from "./routes/channels.js";
import { createFormatAdaptRouter } from "./routes/format-adapt.js";
import { createPublishRouter } from "./routes/publish.js";
import { createDistributionStatusRouter, createVideoDistStatusRouter, createChannelDistStatusRouter } from "./routes/distribution-status.js";
import { createSchedulerRouter } from "./routes/scheduler.js";
import { createAdPodsRouter, createVastRouter, createSsaiRouter, createAdTrackingRouter } from "./routes/ads.js";
import { createPlansRouter, createSubscriptionsRouter, createAccessRulesRouter, createAccessCheckRouter, createStripeWebhookRouter } from "./routes/subscriptions.js";
import { paywallGate } from "./middleware/paywall.js";
import { startSchedulerPoll } from "./services/scheduler.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

const allowedOrigins = [
  "https://videoos-gray.vercel.app",
  "https://videoos.ai",
];
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:3000", "http://localhost:3001");
}

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mediaos-vms" });
});

// Video routes (VOD upload, transcode, HLS)
app.use("/api/videos", createVideoRouter());

// Stream routes (live streaming CRUD)
app.use("/api/streams", createStreamRouter());

// Metadata routes: GET/PATCH /api/videos/:videoId/metadata, GET /api/videos/metadata
const metadataRouter = createMetadataRouter();
app.use("/api/videos/metadata", metadataRouter);
app.use("/api/videos/:videoId/metadata", metadataRouter);

// AI tagging: POST /api/videos/:videoId/ai-tags
app.use("/api/videos/:videoId/ai-tags", createAiTagsRouter());

// Transcription: POST /api/videos/:videoId/transcripts
app.use("/api/videos/:videoId/transcripts", createTranscriptsRouter());

// Thumbnail selection: POST /api/videos/:videoId/thumbnails
app.use("/api/videos/:videoId/thumbnails", createThumbnailsRouter());

// Chapter detection: POST /api/videos/:videoId/chapters
app.use("/api/videos/:videoId/chapters", createChaptersRouter());

// AI metadata pipeline: POST /api/videos/:videoId/pipeline, GET .../pipeline/status
app.use("/api/videos/:videoId/pipeline", createPipelineRouter());

// Distribution channels: CRUD /api/channels
app.use("/api/channels", createChannelsRouter());

// Format adaptation: POST /api/videos/:videoId/adapt, GET .../adapt/preview
app.use("/api/videos/:videoId/adapt", createFormatAdaptRouter());

// Publishing: POST /api/videos/:videoId/publish, POST .../publish/batch
app.use("/api/videos/:videoId/publish", createPublishRouter());

// Distribution status: CRUD /api/distribution, per-video, per-channel
app.use("/api/distribution", createDistributionStatusRouter());
app.use("/api/videos/:videoId/distribution", createVideoDistStatusRouter());
app.use("/api/channels/:channelId/distribution", createChannelDistStatusRouter());

// Scheduling: POST/GET/DELETE /api/schedules, POST /api/schedules/process
app.use("/api/schedules", createSchedulerRouter());

// Webhook management: POST/GET/DELETE /api/webhooks
app.use("/api/webhooks", createWebhookRouter());

// Ad integration: CRUD /api/ads/pods, VAST /api/ads/vast, SSAI /api/ads/ssai, tracking /api/ads/tracking
app.use("/api/ads/pods", createAdPodsRouter());
app.use("/api/ads/vast", createVastRouter());
app.use("/api/ads/ssai", createSsaiRouter());
app.use("/api/ads/tracking", createAdTrackingRouter());

// Subscription & paywall: CRUD plans, subscriptions, access rules, Stripe webhooks
app.use("/api/subscriptions/plans", createPlansRouter());
app.use("/api/subscriptions/access-rules", createAccessRulesRouter());
app.use("/api/subscriptions/access", createAccessCheckRouter());
app.use("/api/subscriptions/webhooks", createStripeWebhookRouter());
app.use("/api/subscriptions", createSubscriptionsRouter());

// Paywall gate on SSAI manifest (premium stream access)
app.use("/api/ads/ssai/manifest", paywallGate);

app.listen(port, () => {
  console.log(`MediaOS VMS running on port ${port}`);
  // Start scheduler polling (every 30s by default)
  startSchedulerPoll();
});
