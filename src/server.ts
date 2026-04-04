import "dotenv/config";
import express from "express";
import { createVideoRouter } from "./routes/videos.js";
import { createStreamRouter } from "./routes/streams.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mediaos-vms" });
});

// Video routes (VOD upload, transcode, HLS)
app.use("/api/videos", createVideoRouter());

// Stream routes (live streaming CRUD)
app.use("/api/streams", createStreamRouter());

app.listen(port, () => {
  console.log(`MediaOS VMS running on port ${port}`);
});
