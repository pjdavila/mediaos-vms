import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock all AI services
vi.mock("./ai-tagger.js", () => ({
  tagVideo: vi.fn().mockResolvedValue({
    tags: [
      { label: "basketball", confidence: 0.95, source: "ai" },
      { label: "sports", confidence: 0.9, source: "ai" },
    ],
    framesAnalyzed: 3,
    model: "gpt-4o",
  }),
}));

vi.mock("./transcriber.js", () => ({
  transcribeVideo: vi.fn().mockResolvedValue({
    segments: [
      { start: 0, end: 5.2, text: "Welcome to the game" },
      { start: 5.2, end: 10.1, text: "The players are warming up" },
    ],
    language: "en",
    duration: 120,
    model: "whisper-1",
    fullText: "Welcome to the game. The players are warming up.",
  }),
}));

vi.mock("./thumbnail-selector.js", () => ({
  selectThumbnails: vi.fn().mockResolvedValue({
    thumbnails: [
      { url: "thumbnail://1", timestamp: 10, qualityScore: 0.92, selected: true },
      { url: "thumbnail://2", timestamp: 30, qualityScore: 0.85, selected: false },
    ],
    candidatesEvaluated: 8,
    model: "gpt-4o",
  }),
}));

vi.mock("./chapter-detector.js", () => ({
  detectChapters: vi.fn().mockResolvedValue({
    chapters: [
      { title: "Introduction", startTime: 0, endTime: 30 },
      { title: "Main Event", startTime: 30, endTime: 90 },
    ],
    sceneBoundaries: [0, 30, 90],
    model: "gpt-4o",
  }),
}));

vi.mock("./webhook-emitter.js", () => ({
  emitWebhook: vi.fn().mockResolvedValue(undefined),
}));

import { runAiMetadataPipeline, triggerAiMetadataPipeline } from "./ai-metadata-pipeline.js";
import { upsertMetadata, getMetadata, closeDb } from "./metadata-store.js";
import { emitWebhook } from "./webhook-emitter.js";
import { tagVideo } from "./ai-tagger.js";
import { transcribeVideo } from "./transcriber.js";
import { selectThumbnails } from "./thumbnail-selector.js";
import { detectChapters } from "./chapter-detector.js";

describe("ai-metadata-pipeline", () => {
  let tmpDir: string;
  let fakeVideoPath: string;

  beforeEach(() => {
    // Set up a test DB
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
    process.env.METADATA_DB_PATH = path.join(tmpDir, "test.db");

    fakeVideoPath = path.join(tmpDir, "test.mp4");
    fs.writeFileSync(fakeVideoPath, "fake-video");

    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
    delete process.env.METADATA_DB_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("runs all four AI stages and sets status to ready", async () => {
    const result = await runAiMetadataPipeline("vid-1", fakeVideoPath);

    expect(result.status).toBe("ready");
    expect(result.videoId).toBe("vid-1");
    expect(result.stages.tags.status).toBe("ok");
    expect(result.stages.transcript.status).toBe("ok");
    expect(result.stages.thumbnails.status).toBe("ok");
    expect(result.stages.chapters.status).toBe("ok");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("stores metadata from all stages", async () => {
    await runAiMetadataPipeline("vid-2", fakeVideoPath);

    const meta = getMetadata("vid-2");
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe("ready");
    expect(meta!.tags).toHaveLength(2);
    expect(meta!.transcript).toHaveLength(2);
    expect(meta!.thumbnails).toHaveLength(2);
    expect(meta!.chapters).toHaveLength(2);
    expect(meta!.language).toBe("en");
    expect(meta!.duration).toBe(120);
  });

  it("emits metadata.ready webhook on success", async () => {
    await runAiMetadataPipeline("vid-3", fakeVideoPath);

    expect(emitWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "metadata.ready",
        videoId: "vid-3",
      })
    );
  });

  it("skips stages when skip options are set", async () => {
    const result = await runAiMetadataPipeline("vid-4", fakeVideoPath, {
      skip: { tags: true, chapters: true },
    });

    expect(result.stages.tags.status).toBe("skipped");
    expect(result.stages.chapters.status).toBe("skipped");
    expect(result.stages.transcript.status).toBe("ok");
    expect(result.stages.thumbnails.status).toBe("ok");
    expect(tagVideo).not.toHaveBeenCalled();
  });

  it("handles individual stage failures gracefully", async () => {
    vi.mocked(tagVideo).mockRejectedValueOnce(new Error("OpenAI rate limit"));

    const result = await runAiMetadataPipeline("vid-5", fakeVideoPath);

    // Still ready because other stages succeeded
    expect(result.status).toBe("ready");
    expect(result.stages.tags.status).toBe("failed");
    expect(result.stages.tags.error).toContain("rate limit");
    expect(result.stages.transcript.status).toBe("ok");
  });

  it("sets status to failed when all non-skipped stages fail", async () => {
    vi.mocked(tagVideo).mockRejectedValueOnce(new Error("fail"));
    vi.mocked(transcribeVideo).mockRejectedValueOnce(new Error("fail"));
    vi.mocked(selectThumbnails).mockRejectedValueOnce(new Error("fail"));

    const result = await runAiMetadataPipeline("vid-6", fakeVideoPath, {
      skip: { chapters: true },
    });

    expect(result.status).toBe("failed");
    expect(emitWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "metadata.failed",
        videoId: "vid-6",
      })
    );
  });

  it("skips chapters when transcript fails (no segments available)", async () => {
    vi.mocked(transcribeVideo).mockRejectedValueOnce(new Error("whisper error"));

    const result = await runAiMetadataPipeline("vid-7", fakeVideoPath);

    // Chapters depend on transcript — should be skipped
    expect(result.stages.chapters.status).toBe("skipped");
    expect(detectChapters).not.toHaveBeenCalled();
  });

  it("triggerAiMetadataPipeline fires asynchronously and completes", async () => {
    triggerAiMetadataPipeline("vid-8", fakeVideoPath);

    // Immediately after trigger, status should be pending or processing
    const meta = getMetadata("vid-8");
    expect(meta).not.toBeNull();
    expect(["pending", "processing"]).toContain(meta!.status);

    // Wait for the async pipeline to complete
    await new Promise((r) => setTimeout(r, 100));

    const updated = getMetadata("vid-8");
    expect(updated!.status).toBe("ready");
  });
});
