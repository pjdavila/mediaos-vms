import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// Point to a temp DB before importing the store
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metadata-test-"));
process.env.METADATA_DB_PATH = path.join(tmpDir, "test-metadata.db");

import {
  getMetadata,
  upsertMetadata,
  deleteMetadata,
  listMetadata,
  closeDb,
} from "./metadata-store.js";

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("metadata-store", () => {
  beforeEach(() => {
    // Clean up between tests
    const all = listMetadata({ limit: 1000 });
    for (const item of all.items) {
      deleteMetadata(item.videoId);
    }
  });

  it("returns null for unknown videoId", () => {
    expect(getMetadata("nonexistent")).toBeNull();
  });

  it("creates metadata via upsert", () => {
    const result = upsertMetadata("vid-001", {
      tags: [{ label: "sports", source: "ai", confidence: 0.9 }],
      status: "processing",
      language: "en",
    });

    expect(result.videoId).toBe("vid-001");
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].label).toBe("sports");
    expect(result.status).toBe("processing");
    expect(result.language).toBe("en");
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it("retrieves created metadata", () => {
    upsertMetadata("vid-002", { duration: 120.5 });
    const fetched = getMetadata("vid-002");

    expect(fetched).not.toBeNull();
    expect(fetched!.videoId).toBe("vid-002");
    expect(fetched!.duration).toBe(120.5);
    expect(fetched!.status).toBe("pending");
  });

  it("updates existing metadata (merge)", () => {
    upsertMetadata("vid-003", {
      tags: [{ label: "music", source: "manual" }],
      status: "processing",
    });

    const updated = upsertMetadata("vid-003", {
      status: "ready",
      language: "en",
    });

    expect(updated.status).toBe("ready");
    expect(updated.language).toBe("en");
    // Tags should be preserved from first upsert
    expect(updated.tags).toHaveLength(1);
    expect(updated.tags[0].label).toBe("music");
  });

  it("replaces array fields on update", () => {
    upsertMetadata("vid-004", {
      tags: [{ label: "old", source: "manual" }],
    });

    const updated = upsertMetadata("vid-004", {
      tags: [{ label: "new1", source: "ai" }, { label: "new2", source: "ai" }],
    });

    expect(updated.tags).toHaveLength(2);
    expect(updated.tags[0].label).toBe("new1");
  });

  it("deletes metadata", () => {
    upsertMetadata("vid-005", { status: "ready" });
    expect(deleteMetadata("vid-005")).toBe(true);
    expect(getMetadata("vid-005")).toBeNull();
  });

  it("returns false when deleting nonexistent", () => {
    expect(deleteMetadata("nonexistent")).toBe(false);
  });

  it("lists metadata with pagination", () => {
    for (let i = 0; i < 5; i++) {
      upsertMetadata(`vid-list-${i}`, { status: "ready" });
    }

    const page1 = listMetadata({ limit: 3, offset: 0 });
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(5);

    const page2 = listMetadata({ limit: 3, offset: 3 });
    expect(page2.items).toHaveLength(2);
    expect(page2.total).toBe(5);
  });

  it("filters by status", () => {
    upsertMetadata("vid-ready", { status: "ready" });
    upsertMetadata("vid-pending", { status: "pending" });
    upsertMetadata("vid-processing", { status: "processing" });

    const ready = listMetadata({ status: "ready" });
    expect(ready.total).toBe(1);
    expect(ready.items[0].videoId).toBe("vid-ready");
  });

  it("validates patch input", () => {
    expect(() =>
      upsertMetadata("vid-bad", { status: "invalid" as never })
    ).toThrow();
  });

  it("handles resolution field", () => {
    const result = upsertMetadata("vid-res", {
      resolution: { width: 1920, height: 1080 },
    });
    expect(result.resolution).toEqual({ width: 1920, height: 1080 });
  });

  it("handles transcript segments", () => {
    const result = upsertMetadata("vid-transcript", {
      transcript: [
        { start: 0, end: 3.5, text: "Hello" },
        { start: 3.5, end: 7, text: "World" },
      ],
    });
    expect(result.transcript).toHaveLength(2);
    expect(result.transcript[1].text).toBe("World");
  });

  it("handles chapters", () => {
    const result = upsertMetadata("vid-chapters", {
      chapters: [
        { title: "Intro", startTime: 0, endTime: 30 },
        { title: "Main", startTime: 30 },
      ],
    });
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[1].endTime).toBeUndefined();
  });

  it("handles thumbnails", () => {
    const result = upsertMetadata("vid-thumbs", {
      thumbnails: [
        { url: "https://cdn.example.com/t1.jpg", qualityScore: 0.9, selected: true },
        { url: "https://cdn.example.com/t2.jpg", qualityScore: 0.7, selected: false },
      ],
    });
    expect(result.thumbnails).toHaveLength(2);
    expect(result.thumbnails[0].selected).toBe(true);
  });
});
