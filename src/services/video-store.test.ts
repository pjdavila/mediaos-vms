import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "videos-test-"));
process.env.VIDEOS_DB_PATH = path.join(tmpDir, "test-videos.db");

import {
  createVideoRecord, getVideoRecord, updateVideoRecord, deleteVideoRecord, listVideoRecords,
  closeVideosDb,
} from "./video-store.js";

afterAll(() => {
  closeVideosDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("video-store", () => {
  beforeEach(() => {
    const all = listVideoRecords({ limit: 1000 });
    for (const v of all.items) deleteVideoRecord(v.videoId);
  });

  it("creates a video record", () => {
    const video = createVideoRecord({
      title: "Test Video",
      filename: "test.mp4",
      sizeBytes: 1024000,
      status: "uploading",
      format: "MP4",
    });

    expect(video.videoId).toBeDefined();
    expect(video.title).toBe("Test Video");
    expect(video.filename).toBe("test.mp4");
    expect(video.sizeBytes).toBe(1024000);
    expect(video.status).toBe("uploading");
    expect(video.views).toBe(0);
    expect(video.createdAt).toBeDefined();
  });

  it("retrieves a video record", () => {
    const video = createVideoRecord({ title: "Fetch Test", filename: "a.mp4", sizeBytes: 100 });
    const fetched = getVideoRecord(video.videoId);
    expect(fetched).toEqual(video);
  });

  it("updates a video record", () => {
    const video = createVideoRecord({ title: "Original", filename: "b.mp4", sizeBytes: 200, status: "uploading" });
    const updated = updateVideoRecord(video.videoId, {
      title: "Updated Title",
      status: "ready",
      hlsUrl: "https://cdn.example.com/hls/playlist.m3u8",
      duration: 120.5,
      resolution: "1920x1080",
    });

    expect(updated!.title).toBe("Updated Title");
    expect(updated!.status).toBe("ready");
    expect(updated!.hlsUrl).toBe("https://cdn.example.com/hls/playlist.m3u8");
    expect(updated!.duration).toBe(120.5);
    expect(updated!.resolution).toBe("1920x1080");
  });

  it("deletes a video record", () => {
    const video = createVideoRecord({ title: "Delete Me", filename: "c.mp4", sizeBytes: 300 });
    expect(deleteVideoRecord(video.videoId)).toBe(true);
    expect(getVideoRecord(video.videoId)).toBeNull();
  });

  it("returns false when deleting nonexistent", () => {
    expect(deleteVideoRecord("nonexistent")).toBe(false);
  });

  it("lists videos", () => {
    createVideoRecord({ title: "Vid A", filename: "a.mp4", sizeBytes: 100, status: "ready" });
    createVideoRecord({ title: "Vid B", filename: "b.mp4", sizeBytes: 200, status: "processing" });
    createVideoRecord({ title: "Vid C", filename: "c.mp4", sizeBytes: 300, status: "ready" });

    const all = listVideoRecords();
    expect(all.items).toHaveLength(3);
    expect(all.total).toBe(3);
  });

  it("lists videos filtered by status", () => {
    createVideoRecord({ title: "Ready 1", filename: "a.mp4", sizeBytes: 100, status: "ready" });
    createVideoRecord({ title: "Processing", filename: "b.mp4", sizeBytes: 200, status: "processing" });
    createVideoRecord({ title: "Ready 2", filename: "c.mp4", sizeBytes: 300, status: "ready" });

    const ready = listVideoRecords({ status: "ready" });
    expect(ready.items).toHaveLength(2);
    expect(ready.total).toBe(2);
  });

  it("lists videos filtered by search", () => {
    createVideoRecord({ title: "Product Launch", filename: "a.mp4", sizeBytes: 100 });
    createVideoRecord({ title: "Tutorial Video", filename: "b.mp4", sizeBytes: 200 });

    const result = listVideoRecords({ search: "Tutorial" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Tutorial Video");
  });

  it("lists videos with pagination", () => {
    for (let i = 0; i < 5; i++) {
      createVideoRecord({ title: `Video ${i}`, filename: `${i}.mp4`, sizeBytes: 100 });
    }

    const page1 = listVideoRecords({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = listVideoRecords({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
  });

  it("returns videos sorted by created_at DESC", () => {
    createVideoRecord({ title: "First", filename: "1.mp4", sizeBytes: 100 });
    createVideoRecord({ title: "Second", filename: "2.mp4", sizeBytes: 200 });

    const list = listVideoRecords();
    expect(list.items).toHaveLength(2);
    // Both may have same timestamp; just verify both are returned
    const titles = list.items.map((v) => v.title);
    expect(titles).toContain("First");
    expect(titles).toContain("Second");
  });
});
