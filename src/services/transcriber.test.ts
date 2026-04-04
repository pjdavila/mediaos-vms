import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Readable } from "node:stream";

// Mock child_process.execFile — simulates ffmpeg extracting audio
// Note: the service uses execFile (not exec) which is safe from shell injection
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: Function) => {
    const outputArg = _args[_args.length - 1];
    if (outputArg && typeof outputArg === "string" && outputArg.endsWith(".wav")) {
      fs.writeFileSync(outputArg, "fake-wav-data");
    }
    cb(null, { stdout: "", stderr: "" });
  }),
}));

// Mock OpenAI — simulates Whisper API response
// Destroy the file stream parameter to prevent ENOENT errors after temp dir cleanup
vi.mock("openai", () => {
  const mockCreate = vi.fn().mockImplementation(
    async (params: Record<string, unknown>) => {
      // Drain and close the readable stream passed as `file`
      const file = params.file;
      if (file && typeof file === "object" && "on" in file) {
        const stream = file as Readable;
        stream.on("error", () => {}); // suppress ENOENT
        stream.destroy();
      }
      return {
        text: "Hello world. This is a test transcript.",
        language: "en",
        duration: 12.5,
        segments: [
          { start: 0.0, end: 3.2, text: " Hello world." },
          { start: 3.2, end: 7.8, text: " This is a test transcript." },
        ],
      };
    }
  );

  return {
    default: vi.fn().mockImplementation(() => ({
      audio: { transcriptions: { create: mockCreate } },
    })),
  };
});

import { extractAudio, transcribeVideo } from "./transcriber.js";

describe("transcriber", () => {
  let tmpVideoDir: string;
  let fakeVideoPath: string;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    tmpVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcriber-test-"));
    fakeVideoPath = path.join(tmpVideoDir, "test-video.mp4");
    fs.writeFileSync(fakeVideoPath, "fake-video-content");
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    fs.rmSync(tmpVideoDir, { recursive: true, force: true });
  });

  describe("extractAudio", () => {
    it("calls ffmpeg and returns a WAV audio path", async () => {
      const { audioPath, tmpDir } = await extractAudio(fakeVideoPath);

      expect(audioPath).toContain("audio.wav");
      expect(fs.existsSync(audioPath)).toBe(true);

      // Verify ffmpeg was called with correct args for 16kHz mono WAV
      const { execFile } = await import("node:child_process");
      const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
      const [cmd, args] = mockExecFile.mock.calls[0];
      expect(cmd).toBe("ffmpeg");
      expect(args).toContain("-vn");
      expect(args).toContain("16000");
      expect(args).toContain("1");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("transcribeVideo", () => {
    it("returns timestamped segments with language and duration", async () => {
      const result = await transcribeVideo(fakeVideoPath);

      expect(result.segments).toHaveLength(2);
      expect(result.language).toBe("en");
      expect(result.duration).toBe(12.5);
      expect(result.model).toBe("whisper-1");
      expect(result.fullText).toBe("Hello world. This is a test transcript.");
    });

    it("returns segments with correct start/end timestamps", async () => {
      const result = await transcribeVideo(fakeVideoPath);

      expect(result.segments[0]).toEqual({
        start: 0.0,
        end: 3.2,
        text: "Hello world.",
      });
      expect(result.segments[1]).toEqual({
        start: 3.2,
        end: 7.8,
        text: "This is a test transcript.",
      });
    });

    it("passes language option to Whisper API", async () => {
      const result = await transcribeVideo(fakeVideoPath, { language: "es" });

      const OpenAI = (await import("openai")).default;
      const instance = (OpenAI as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
      const createCall = instance.audio.transcriptions.create;
      const lastCallArgs = createCall.mock.calls[createCall.mock.calls.length - 1][0];

      expect(lastCallArgs.language).toBe("es");
      expect(result.model).toBe("whisper-1");
    });

    it("throws when OPENAI_API_KEY is missing", async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(transcribeVideo(fakeVideoPath)).rejects.toThrow(
        "OPENAI_API_KEY environment variable is required"
      );
    });

    it("handles empty segments gracefully", async () => {
      const OpenAI = (await import("openai")).default;
      const instance = (OpenAI as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
      instance.audio.transcriptions.create.mockImplementationOnce(
        async (params: Record<string, unknown>) => {
          const file = params.file;
          if (file && typeof file === "object" && "on" in file) {
            const stream = file as Readable;
            stream.on("error", () => {});
            stream.destroy();
          }
          return { text: "", language: "en", duration: 0, segments: [] };
        }
      );

      const result = await transcribeVideo(fakeVideoPath);
      expect(result.segments).toEqual([]);
      expect(result.fullText).toBe("");
      expect(result.duration).toBe(0);
    });
  });
});
