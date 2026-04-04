import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock child_process.execFile before importing the module
// Note: the actual service uses execFile (not exec) which is safe from shell injection
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: Function) => {
    // Simulate ffmpeg creating frame files in the output dir
    const outputArg = _args[_args.length - 1];
    if (outputArg && typeof outputArg === "string") {
      const dir = path.dirname(outputArg);
      if (fs.existsSync(dir)) {
        fs.writeFileSync(path.join(dir, "frame-001.jpg"), "fake-jpeg-data");
        fs.writeFileSync(path.join(dir, "frame-002.jpg"), "fake-jpeg-data");
      }
    }
    cb(null, { stdout: "", stderr: "" });
  }),
}));

// Mock OpenAI
vi.mock("openai", () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            tags: [
              { label: "basketball", confidence: 0.95, category: "object" },
              { label: "indoor court", confidence: 0.92, category: "scene" },
              { label: "sports", confidence: 0.9, category: "category" },
              { label: "player", confidence: 0.88, category: "person" },
              { label: "blurry background", confidence: 0.6, category: "scene" },
            ],
          }),
        },
      },
    ],
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

import { extractFrames, tagVideo } from "./ai-tagger.js";

describe("ai-tagger", () => {
  let tmpVideoDir: string;
  let fakeVideoPath: string;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    tmpVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-tagger-test-"));
    fakeVideoPath = path.join(tmpVideoDir, "test-video.mp4");
    fs.writeFileSync(fakeVideoPath, "fake-video-content");
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    fs.rmSync(tmpVideoDir, { recursive: true, force: true });
  });

  describe("extractFrames", () => {
    it("calls ffmpeg and returns extracted frame paths", async () => {
      const { framePaths, tmpDir } = await extractFrames(fakeVideoPath, {
        intervalSec: 3,
        maxFrames: 5,
      });

      expect(framePaths).toHaveLength(2); // Our mock creates 2 frames
      expect(framePaths[0]).toContain("frame-001.jpg");
      expect(framePaths[1]).toContain("frame-002.jpg");

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("tagVideo", () => {
    it("returns tags with confidence >= minConfidence", async () => {
      const result = await tagVideo(fakeVideoPath, { minConfidence: 0.85 });

      expect(result.framesAnalyzed).toBe(2);
      expect(result.model).toBe("gpt-4o");
      expect(result.tags.length).toBeGreaterThan(0);

      for (const tag of result.tags) {
        expect(tag.confidence).toBeGreaterThanOrEqual(0.85);
        expect(tag.source).toBe("ai");
      }
    });

    it("filters out low-confidence tags", async () => {
      const result = await tagVideo(fakeVideoPath, { minConfidence: 0.85 });

      const labels = result.tags.map((t) => t.label);
      expect(labels).not.toContain("blurry background");
    });

    it("deduplicates tags across frames keeping highest confidence", async () => {
      const result = await tagVideo(fakeVideoPath, { minConfidence: 0.85 });

      const labels = result.tags.map((t) => t.label);
      const unique = new Set(labels);
      expect(labels.length).toBe(unique.size);
    });

    it("returns tags sorted by confidence descending", async () => {
      const result = await tagVideo(fakeVideoPath, { minConfidence: 0.85 });

      for (let i = 1; i < result.tags.length; i++) {
        expect(result.tags[i - 1].confidence!).toBeGreaterThanOrEqual(
          result.tags[i].confidence!
        );
      }
    });

    it("throws when OPENAI_API_KEY is missing", async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(tagVideo(fakeVideoPath)).rejects.toThrow(
        "OPENAI_API_KEY environment variable is required"
      );
    });

    it("returns empty tags when no frames are extracted", async () => {
      const { execFile } = await import("node:child_process");
      (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_cmd: string, _args: string[], cb: Function) => {
          cb(null, { stdout: "", stderr: "" });
        }
      );

      const result = await tagVideo(fakeVideoPath);
      expect(result.tags).toEqual([]);
      expect(result.framesAnalyzed).toBe(0);
    });
  });
});
