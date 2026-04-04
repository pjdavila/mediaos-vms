import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-status-test-"));
process.env.DIST_STATUS_DB_PATH = path.join(tmpDir, "test-dist-status.db");

import {
  createDistributionRecord,
  getDistributionRecord,
  updateDistributionStatus,
  getVideoDistributionStatus,
  getChannelDistributionStatus,
  listDistributionStatus,
  closeDistStatusDb,
} from "./distribution-status.js";

afterAll(() => {
  closeDistStatusDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("distribution-status", () => {
  it("creates a distribution record with queued status", () => {
    const record = createDistributionRecord("vid-1", "ch-1", "youtube");

    expect(record.id).toBeDefined();
    expect(record.videoId).toBe("vid-1");
    expect(record.channelId).toBe("ch-1");
    expect(record.channelType).toBe("youtube");
    expect(record.status).toBe("queued");
    expect(record.platformId).toBeNull();
    expect(record.platformUrl).toBeNull();
    expect(record.error).toBeNull();
    expect(record.createdAt).toBeDefined();
    expect(record.updatedAt).toBeDefined();
  });

  it("retrieves a record by id", () => {
    const created = createDistributionRecord("vid-2", "ch-2", "twitter");
    const fetched = getDistributionRecord(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.videoId).toBe("vid-2");
  });

  it("returns null for nonexistent id", () => {
    expect(getDistributionRecord("nonexistent")).toBeNull();
  });

  it("updates status from queued to processing", () => {
    const record = createDistributionRecord("vid-3", "ch-3", "embed");
    const updated = updateDistributionStatus(record.id, "processing");

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("processing");
  });

  it("updates status to live with platform details", () => {
    const record = createDistributionRecord("vid-4", "ch-4", "youtube");
    const updated = updateDistributionStatus(record.id, "live", {
      platformId: "yt-abc123",
      platformUrl: "https://youtube.com/watch?v=abc123",
    });

    expect(updated!.status).toBe("live");
    expect(updated!.platformId).toBe("yt-abc123");
    expect(updated!.platformUrl).toBe("https://youtube.com/watch?v=abc123");
    expect(updated!.error).toBeNull();
  });

  it("updates status to failed with error", () => {
    const record = createDistributionRecord("vid-5", "ch-5", "twitter");
    const updated = updateDistributionStatus(record.id, "failed", {
      error: "Rate limit exceeded",
    });

    expect(updated!.status).toBe("failed");
    expect(updated!.error).toBe("Rate limit exceeded");
  });

  it("returns null when updating nonexistent record", () => {
    expect(updateDistributionStatus("nonexistent", "live")).toBeNull();
  });

  it("gets all distribution records for a video", () => {
    const vid = "vid-multi-" + Date.now();
    createDistributionRecord(vid, "ch-a", "youtube");
    createDistributionRecord(vid, "ch-b", "twitter");
    createDistributionRecord(vid, "ch-c", "embed");

    const records = getVideoDistributionStatus(vid);
    expect(records).toHaveLength(3);
    expect(records.every((r) => r.videoId === vid)).toBe(true);
  });

  it("gets distribution records for a channel with filtering", () => {
    const ch = "ch-filter-" + Date.now();
    const r1 = createDistributionRecord("v1", ch, "youtube");
    const r2 = createDistributionRecord("v2", ch, "youtube");
    createDistributionRecord("v3", ch, "youtube");

    updateDistributionStatus(r1.id, "live");
    updateDistributionStatus(r2.id, "failed", { error: "err" });

    const live = getChannelDistributionStatus(ch, { status: "live" });
    expect(live.total).toBe(1);
    expect(live.items[0].status).toBe("live");

    const all = getChannelDistributionStatus(ch);
    expect(all.total).toBe(3);
  });

  it("lists all distribution records with pagination", () => {
    // Clear-ish — use unique statuses to filter
    const result = listDistributionStatus({ limit: 5, offset: 0 });
    expect(result.items.length).toBeLessThanOrEqual(5);
    expect(typeof result.total).toBe("number");
  });

  it("lists with status filter", () => {
    const r = createDistributionRecord("vid-filt", "ch-filt", "embed");
    updateDistributionStatus(r.id, "cancelled");

    const cancelled = listDistributionStatus({ status: "cancelled" });
    expect(cancelled.items.some((i) => i.id === r.id)).toBe(true);
  });

  it("preserves platform details across status updates", () => {
    const record = createDistributionRecord("vid-preserve", "ch-preserve", "youtube");
    updateDistributionStatus(record.id, "processing");
    updateDistributionStatus(record.id, "live", {
      platformId: "yt-xyz",
      platformUrl: "https://youtube.com/watch?v=xyz",
    });

    // Update status without clearing platform details
    const updated = updateDistributionStatus(record.id, "live");
    expect(updated!.platformId).toBe("yt-xyz");
    expect(updated!.platformUrl).toBe("https://youtube.com/watch?v=xyz");
  });
});
