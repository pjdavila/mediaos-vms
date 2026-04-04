import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock child_process.execFile (safe from shell injection) before importing the module
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
    // Support both (cmd, args, cb) and (cmd, args, opts, cb) signatures
    const callback = cb ?? (_opts as Function);
    const outputArg = _args[_args.length - 1];
    if (outputArg && typeof outputArg === "string") {
      const dir = path.dirname(outputArg);
      if (fs.existsSync(dir)) {
        // Check if this is scene detection or interval extraction
        const prefix = outputArg.includes("scene-") ? "scene-" : "interval-";
        fs.writeFileSync(path.join(dir, `${prefix}001.jpg`), "fake-jpeg-data");
        fs.writeFileSync(path.join(dir, `${prefix}002.jpg`), "fake-jpeg-data");
        fs.writeFileSync(path.join(dir, `${prefix}003.jpg`), "fake-jpeg-data");
        fs.writeFileSync(path.join(dir, `${prefix}004.jpg`), "fake-jpeg-data");
      }
    }
    callback(null, { stdout: "", stderr: "" });
  }),
}));

// Mock OpenAI — return varying quality scores
let callIndex = 0;
vi.mock("openai", () => {
  const scores = [
    { qualityScore: 0.92, reasoning: "Sharp, well-composed frame with clear subject" },
    { qualityScore: 0.78, reasoning: "Decent composition but slightly blurry" },
    { qualityScore: 0.95, reasoning: "Excellent thumbnail: clear face, good lighting" },
    { qualityScore: 0.61, reasoning: "Low contrast, no clear focal point" },
  ];

  const mockCreate = vi.fn().mockImplementation(() => {
    const score = scores[callIndex % scores.length];
    callIndex++;
    return Promise.resolve({
      choices: [{ message: { content: JSON.stringify(score) } }],
    });
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

import { extractCandidateFrames, selectThumbnails } from "./thumbnail-selector.js";

describe("thumbnail-selector", () => {
  let tmpVideoDir: string;
  let fakeVideoPath: string;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    callIndex = 0;
    tmpVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumb-test-"));
    fakeVideoPath = path.join(tmpVideoDir, "test-video.mp4");
    fs.writeFileSync(fakeVideoPath, "fake-video-content");
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    fs.rmSync(tmpVideoDir, { recursive: true, force: true });
  });

  describe("extractCandidateFrames", () => {
    it("extracts frames via scene detection", async () => {
      const { framePaths, tmpDir } = await extractCandidateFrames(fakeVideoPath);

      expect(framePaths.length).toBeGreaterThanOrEqual(3);
      expect(framePaths[0]).toContain("scene-");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns timestamps for each frame", async () => {
      const { framePaths, timestamps, tmpDir } = await extractCandidateFrames(fakeVideoPath);

      expect(timestamps).toHaveLength(framePaths.length);
      for (const ts of timestamps) {
        expect(ts).toBeGreaterThanOrEqual(0);
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("selectThumbnails", () => {
    it("returns top-3 thumbnails by default", async () => {
      const result = await selectThumbnails(fakeVideoPath);

      expect(result.thumbnails).toHaveLength(3);
      expect(result.candidatesEvaluated).toBeGreaterThan(0);
      expect(result.model).toBe("gpt-4o");
    });

    it("returns thumbnails sorted by qualityScore descending", async () => {
      const result = await selectThumbnails(fakeVideoPath);

      for (let i = 1; i < result.thumbnails.length; i++) {
        expect(result.thumbnails[i - 1].qualityScore!).toBeGreaterThanOrEqual(
          result.thumbnails[i].qualityScore!
        );
      }
    });

    it("marks the top thumbnail as selected", async () => {
      const result = await selectThumbnails(fakeVideoPath);

      expect(result.thumbnails[0].selected).toBe(true);
      for (let i = 1; i < result.thumbnails.length; i++) {
        expect(result.thumbnails[i].selected).toBe(false);
      }
    });

    it("includes qualityScore between 0 and 1", async () => {
      const result = await selectThumbnails(fakeVideoPath);

      for (const thumb of result.thumbnails) {
        expect(thumb.qualityScore).toBeGreaterThanOrEqual(0);
        expect(thumb.qualityScore).toBeLessThanOrEqual(1);
      }
    });

    it("respects topN option", async () => {
      const result = await selectThumbnails(fakeVideoPath, { topN: 2 });
      expect(result.thumbnails).toHaveLength(2);
    });

    it("throws when OPENAI_API_KEY is missing", async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(selectThumbnails(fakeVideoPath)).rejects.toThrow(
        "OPENAI_API_KEY environment variable is required"
      );
    });

    it("returns empty thumbnails when no frames are extracted", async () => {
      const { execFile } = await import("node:child_process");
      // Override mock to not create any files (uses execFile, safe from shell injection)
      (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
          const callback = cb ?? (_opts as Function);
          callback(null, { stdout: "", stderr: "" });
        }
      );

      const result = await selectThumbnails(fakeVideoPath);
      expect(result.thumbnails).toEqual([]);
      expect(result.candidatesEvaluated).toBe(0);
    });
  });
});
