import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-test-"));
process.env.SCHEDULER_DB_PATH = path.join(tmpDir, "test-scheduler.db");
process.env.CHANNELS_DB_PATH = path.join(tmpDir, "test-channels.db");
process.env.METADATA_DB_PATH = path.join(tmpDir, "test-metadata.db");
process.env.DIST_STATUS_DB_PATH = path.join(tmpDir, "test-dist-status.db");
process.env.EMBED_BASE_URL = "https://embed.test.mediaos.dev";

import {
  createChannel,
  deleteChannel,
  listChannels,
  closeChannelsDb,
} from "./channel-store.js";
import { closeDb as closeMetadataDb } from "./metadata-store.js";
import { closeDistStatusDb } from "./distribution-status.js";
import {
  createScheduledPublish,
  getScheduledPublish,
  cancelScheduledPublish,
  listScheduledPublishes,
  getDueSchedules,
  processScheduledPublish,
  closeSchedulerDb,
} from "./scheduler.js";

// Create a temp video file
const tmpVideoPath = path.join(tmpDir, "test-video.mp4");
fs.writeFileSync(tmpVideoPath, Buffer.alloc(256, 0));

afterAll(() => {
  closeSchedulerDb();
  closeChannelsDb();
  closeMetadataDb();
  closeDistStatusDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("scheduler", () => {
  let embedChannelId: string;

  beforeEach(() => {
    // Ensure we have an embed channel for testing
    const channels = listChannels({ type: "embed", limit: 1 });
    if (channels.total === 0) {
      const ch = createChannel({ name: "Test Embed", type: "embed" });
      embedChannelId = ch.channelId;
    } else {
      embedChannelId = channels.items[0].channelId;
    }
  });

  it("creates a scheduled publish", () => {
    const schedule = createScheduledPublish({
      videoId: "vid-s1",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2026-12-31T12:00:00Z",
      timezone: "America/New_York",
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.videoId).toBe("vid-s1");
    expect(schedule.channelId).toBe(embedChannelId);
    expect(schedule.status).toBe("pending");
    expect(schedule.timezone).toBe("America/New_York");
    expect(schedule.retryCount).toBe(0);
    expect(schedule.maxRetries).toBe(3);
  });

  it("defaults timezone to UTC", () => {
    const schedule = createScheduledPublish({
      videoId: "vid-s2",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2026-06-15T08:00:00Z",
    });

    expect(schedule.timezone).toBe("UTC");
  });

  it("rejects invalid scheduledAt", () => {
    expect(() =>
      createScheduledPublish({
        videoId: "vid-bad",
        channelId: embedChannelId,
        filePath: tmpVideoPath,
        scheduledAt: "not-a-date",
      })
    ).toThrow("valid ISO 8601");
  });

  it("retrieves a schedule by id", () => {
    const created = createScheduledPublish({
      videoId: "vid-s3",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2026-07-01T00:00:00Z",
    });

    const fetched = getScheduledPublish(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it("returns null for nonexistent id", () => {
    expect(getScheduledPublish("nonexistent")).toBeNull();
  });

  it("cancels a pending schedule", () => {
    const schedule = createScheduledPublish({
      videoId: "vid-cancel",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2026-12-25T00:00:00Z",
    });

    const cancelled = cancelScheduledPublish(schedule.id);
    expect(cancelled!.status).toBe("cancelled");
  });

  it("returns null when cancelling nonexistent", () => {
    expect(cancelScheduledPublish("nonexistent")).toBeNull();
  });

  it("lists schedules with filters", () => {
    const vid = "vid-list-" + Date.now();
    createScheduledPublish({
      videoId: vid,
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2026-08-01T10:00:00Z",
    });
    createScheduledPublish({
      videoId: vid,
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2026-08-02T10:00:00Z",
    });

    const result = listScheduledPublishes({ videoId: vid });
    expect(result.total).toBe(2);
    // Should be ordered by scheduledAt ASC
    expect(result.items[0].scheduledAt < result.items[1].scheduledAt).toBe(true);
  });

  it("finds due schedules (past scheduledAt)", () => {
    // Create a schedule in the past
    const schedule = createScheduledPublish({
      videoId: "vid-due",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2020-01-01T00:00:00Z", // in the past
    });

    const due = getDueSchedules();
    expect(due.some((s) => s.id === schedule.id)).toBe(true);
  });

  it("does not return future schedules as due", () => {
    const schedule = createScheduledPublish({
      videoId: "vid-future",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2099-01-01T00:00:00Z",
    });

    const due = getDueSchedules();
    expect(due.some((s) => s.id === schedule.id)).toBe(false);
  });

  it("processes a due embed schedule successfully", async () => {
    const schedule = createScheduledPublish({
      videoId: "vid-process",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2020-01-01T00:00:00Z",
    });

    const result = await processScheduledPublish(schedule);

    expect(result.status).toBe("completed");
    expect(result.distributionId).toBeDefined();
  });

  it("retries on failure and eventually marks as failed", async () => {
    // Create a channel with bad credentials to force failure
    const badChannel = createChannel({
      name: "Bad Twitter",
      type: "twitter",
      credentials: { accessToken: "bad-token" },
    });

    // Mock fetch to simulate Twitter API failure
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const schedule = createScheduledPublish({
      videoId: "vid-retry",
      channelId: badChannel.channelId,
      filePath: tmpVideoPath,
      scheduledAt: "2020-01-01T00:00:00Z",
      maxRetries: 2,
    });

    // First attempt — should go back to pending (retry)
    const r1 = await processScheduledPublish(schedule);
    expect(r1.status).toBe("pending");
    expect(r1.retryCount).toBe(1);

    // Second attempt — should fail permanently
    const r2 = await processScheduledPublish(r1);
    expect(r2.status).toBe("failed");
    expect(r2.retryCount).toBe(2);
    expect(r2.error).toBeDefined();

    vi.restoreAllMocks();
  });

  it("respects custom maxRetries", () => {
    const schedule = createScheduledPublish({
      videoId: "vid-retries",
      channelId: embedChannelId,
      filePath: tmpVideoPath,
      scheduledAt: "2026-01-01T00:00:00Z",
      maxRetries: 5,
    });

    expect(schedule.maxRetries).toBe(5);
  });
});
