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

app.listen(port, () => {
  console.log(`MediaOS VMS running on port ${port}`);
});
