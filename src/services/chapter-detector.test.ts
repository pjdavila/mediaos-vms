import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TranscriptSegment } from "../schemas/metadata.js";

// Mock node:child_process.execFile — simulates ffmpeg scene detection
// Note: we mock execFile (safe from shell injection), not exec
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    // Simulate ffmpeg showinfo output with scene-change timestamps
    const stderr = [
      "[Parsed_showinfo_1 @ 0x1] n:   0 pts:   7500 pts_time:30.5    ",
      "[Parsed_showinfo_1 @ 0x1] n:   1 pts:  15000 pts_time:65.2    ",
      "[Parsed_showinfo_1 @ 0x1] n:   2 pts:  30000 pts_time:120.8   ",
    ].join("\n");
    cb(null, { stdout: "", stderr });
  }),
}));

// Mock OpenAI — simulates title generation
vi.mock("openai", () => {
  let callCount = 0;
  const titles = [
    "Introduction and Overview",
    "Main Discussion Points",
    "Technical Deep Dive",
    "Closing Remarks",
  ];

  const mockCreate = vi.fn().mockImplementation(async () => {
    const title = titles[callCount % titles.length];
    callCount++;
    return {
      choices: [
        { message: { content: JSON.stringify({ title }) } },
      ],
    };
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

import {
  detectSceneBoundaries,
  detectTopicShifts,
  mergeBoundaries,
  detectChapters,
} from "./chapter-detector.js";

// Helper to build transcript segments for testing
function makeSegments(count: number, intervalSec: number = 5): TranscriptSegment[] {
  const topics = [
    // Topic A: cooking
    ["Today we are cooking a delicious pasta recipe", "First we need to boil the water", "Add salt to the boiling water", "Now put the spaghetti into the pot", "Stir occasionally while cooking"],
    // Topic B: technology
    ["Now lets talk about artificial intelligence", "Machine learning models need large datasets", "Neural networks process information in layers", "Deep learning has revolutionized computer vision", "GPT models generate human-like text"],
    // Topic C: travel
    ["Moving on to our travel recommendations", "Paris is a wonderful destination for couples", "The Eiffel Tower offers breathtaking views", "French cuisine is among the best worldwide", "Dont forget to visit the Louvre museum"],
  ];

  const segments: TranscriptSegment[] = [];
  for (let i = 0; i < count; i++) {
    const topicIdx = Math.floor(i / (count / topics.length));
    const sentenceIdx = i % topics[Math.min(topicIdx, topics.length - 1)].length;
    segments.push({
      start: i * intervalSec,
      end: (i + 1) * intervalSec,
      text: topics[Math.min(topicIdx, topics.length - 1)][sentenceIdx],
    });
  }
  return segments;
}

describe("chapter-detector", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe("detectSceneBoundaries", () => {
    it("parses FFmpeg showinfo output for scene-change timestamps", async () => {
      const boundaries = await detectSceneBoundaries("/fake/video.mp4", 0.3);

      expect(boundaries).toEqual([30.5, 65.2, 120.8]);
    });

    it("returns sorted timestamps", async () => {
      const boundaries = await detectSceneBoundaries("/fake/video.mp4", 0.3);

      for (let i = 1; i < boundaries.length; i++) {
        expect(boundaries[i]).toBeGreaterThan(boundaries[i - 1]);
      }
    });
  });

  describe("detectTopicShifts", () => {
    it("returns empty array for too few segments", () => {
      const segments: TranscriptSegment[] = [
        { start: 0, end: 5, text: "Hello world" },
        { start: 5, end: 10, text: "Goodbye world" },
      ];
      expect(detectTopicShifts(segments)).toEqual([]);
    });

    it("detects topic shifts in diverse transcript segments", () => {
      const segments = makeSegments(15, 5);
      const shifts = detectTopicShifts(segments);

      // Should find at least one topic shift between the distinct topics
      expect(shifts.length).toBeGreaterThanOrEqual(1);
      // Shifts should be valid timestamps
      for (const ts of shifts) {
        expect(ts).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("mergeBoundaries", () => {
    it("merges nearby boundaries within merge distance", () => {
      const scene = [10, 22, 60, 90];
      const topic = [12, 65, 95];
      const merged = mergeBoundaries(scene, topic, 20, 10);

      // 10 and 12 merge, 22 dropped (too close to 10), 60 and 65 merge, 90 and 95 merge
      // After min duration filter: 10, 60, 90 (each >= 20s apart)
      expect(merged).toEqual([10, 60, 90]);
    });

    it("filters out chapters shorter than minimum duration", () => {
      const scene = [0, 10, 20, 100];
      const topic: number[] = [];
      const merged = mergeBoundaries(scene, topic, 30);

      // 0, then skip 10 and 20 (< 30s from 0), include 100
      expect(merged).toEqual([0, 100]);
    });

    it("handles empty inputs", () => {
      expect(mergeBoundaries([], [], 30)).toEqual([]);
    });
  });

  describe("detectChapters", () => {
    it("returns chapters with titles and timestamps", async () => {
      const segments = makeSegments(15, 10);
      const duration = 150;

      const result = await detectChapters("/fake/video.mp4", segments, duration);

      expect(result.chapters.length).toBeGreaterThanOrEqual(1);
      expect(result.model).toBe("gpt-4o");

      for (const chapter of result.chapters) {
        expect(chapter.title).toBeTruthy();
        expect(chapter.startTime).toBeGreaterThanOrEqual(0);
        expect(chapter.endTime).toBeGreaterThan(chapter.startTime);
      }
    });

    it("first chapter starts at time 0", async () => {
      const segments = makeSegments(15, 10);
      const result = await detectChapters("/fake/video.mp4", segments, 150);

      expect(result.chapters[0].startTime).toBe(0);
    });

    it("last chapter ends at video duration", async () => {
      const segments = makeSegments(15, 10);
      const duration = 150;
      const result = await detectChapters("/fake/video.mp4", segments, duration);

      const lastChapter = result.chapters[result.chapters.length - 1];
      expect(lastChapter.endTime).toBe(duration);
    });

    it("respects maxChapters option", async () => {
      const segments = makeSegments(15, 10);
      const result = await detectChapters("/fake/video.mp4", segments, 150, {
        maxChapters: 2,
      });

      expect(result.chapters.length).toBeLessThanOrEqual(2);
    });

    it("throws when OPENAI_API_KEY is missing", async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(
        detectChapters("/fake/video.mp4", [], 100)
      ).rejects.toThrow("OPENAI_API_KEY environment variable is required");
    });

    it("returns scene boundaries from FFmpeg", async () => {
      const segments = makeSegments(15, 10);
      const result = await detectChapters("/fake/video.mp4", segments, 150);

      expect(result.sceneBoundaries).toEqual([30.5, 65.2, 120.8]);
    });
  });
});
