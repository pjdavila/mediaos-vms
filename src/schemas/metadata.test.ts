import { describe, it, expect } from "vitest";
import {
  VideoMetadataSchema,
  VideoMetadataPatchSchema,
  TagSchema,
  TranscriptSegmentSchema,
  ChapterSchema,
  ThumbnailSchema,
} from "./metadata.js";

describe("TagSchema", () => {
  it("accepts a valid tag", () => {
    const result = TagSchema.parse({ label: "sports", confidence: 0.95, source: "ai" });
    expect(result.label).toBe("sports");
    expect(result.confidence).toBe(0.95);
    expect(result.source).toBe("ai");
  });

  it("defaults source to manual", () => {
    const result = TagSchema.parse({ label: "news" });
    expect(result.source).toBe("manual");
  });

  it("rejects empty label", () => {
    expect(() => TagSchema.parse({ label: "" })).toThrow();
  });

  it("rejects confidence out of range", () => {
    expect(() => TagSchema.parse({ label: "x", confidence: 1.5 })).toThrow();
    expect(() => TagSchema.parse({ label: "x", confidence: -0.1 })).toThrow();
  });
});

describe("TranscriptSegmentSchema", () => {
  it("accepts valid segment", () => {
    const result = TranscriptSegmentSchema.parse({ start: 0, end: 5.5, text: "Hello world" });
    expect(result.text).toBe("Hello world");
  });

  it("rejects negative timestamps", () => {
    expect(() => TranscriptSegmentSchema.parse({ start: -1, end: 5, text: "x" })).toThrow();
  });
});

describe("ChapterSchema", () => {
  it("accepts valid chapter", () => {
    const result = ChapterSchema.parse({ title: "Intro", startTime: 0, endTime: 30 });
    expect(result.title).toBe("Intro");
  });

  it("endTime is optional", () => {
    const result = ChapterSchema.parse({ title: "Outro", startTime: 120 });
    expect(result.endTime).toBeUndefined();
  });
});

describe("ThumbnailSchema", () => {
  it("accepts valid thumbnail", () => {
    const result = ThumbnailSchema.parse({
      url: "https://cdn.example.com/thumb.jpg",
      timestamp: 15.5,
      qualityScore: 0.87,
      selected: true,
    });
    expect(result.selected).toBe(true);
  });

  it("defaults selected to false", () => {
    const result = ThumbnailSchema.parse({ url: "https://cdn.example.com/thumb.jpg" });
    expect(result.selected).toBe(false);
  });
});

describe("VideoMetadataSchema", () => {
  it("accepts minimal metadata", () => {
    const result = VideoMetadataSchema.parse({ videoId: "vid-001" });
    expect(result.videoId).toBe("vid-001");
    expect(result.tags).toEqual([]);
    expect(result.transcript).toEqual([]);
    expect(result.chapters).toEqual([]);
    expect(result.thumbnails).toEqual([]);
    expect(result.language).toBeNull();
    expect(result.duration).toBeNull();
    expect(result.resolution).toBeNull();
    expect(result.status).toBe("pending");
  });

  it("accepts full metadata", () => {
    const result = VideoMetadataSchema.parse({
      videoId: "vid-002",
      tags: [{ label: "music", confidence: 0.9, source: "ai" }],
      transcript: [{ start: 0, end: 3, text: "Welcome" }],
      chapters: [{ title: "Intro", startTime: 0, endTime: 10 }],
      thumbnails: [{ url: "https://cdn.example.com/t.jpg", selected: true }],
      language: "en",
      duration: 300.5,
      resolution: { width: 1920, height: 1080 },
      status: "ready",
    });
    expect(result.tags).toHaveLength(1);
    expect(result.resolution?.width).toBe(1920);
  });

  it("rejects empty videoId", () => {
    expect(() => VideoMetadataSchema.parse({ videoId: "" })).toThrow();
  });
});

describe("VideoMetadataPatchSchema", () => {
  it("accepts partial updates", () => {
    const result = VideoMetadataPatchSchema.parse({ status: "processing" });
    expect(result.status).toBe("processing");
  });

  it("accepts empty patch", () => {
    const result = VideoMetadataPatchSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects invalid status", () => {
    expect(() => VideoMetadataPatchSchema.parse({ status: "invalid" })).toThrow();
  });
});
