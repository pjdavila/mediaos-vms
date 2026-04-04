import OpenAI from "openai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TranscriptSegment } from "../schemas/metadata.js";

const execFileAsync = promisify(execFile);

export interface TranscriptionOptions {
  /** OpenAI Whisper model to use (default: whisper-1) */
  model?: string;
  /** Language hint for Whisper in ISO-639-1 (default: "en") */
  language?: string;
  /** Response format — we always use verbose_json for timestamps */
  prompt?: string;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  language: string;
  duration: number;
  model: string;
  fullText: string;
}

/**
 * Extract the audio track from a video file using FFmpeg.
 * Returns the path to a temporary WAV file (16kHz mono — optimal for Whisper).
 */
export async function extractAudio(
  videoPath: string
): Promise<{ audioPath: string; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediaos-audio-"));
  const audioPath = path.join(tmpDir, "audio.wav");

  await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vn",                    // no video
    "-acodec", "pcm_s16le",  // 16-bit PCM
    "-ar", "16000",           // 16 kHz sample rate
    "-ac", "1",               // mono
    "-y",                     // overwrite
    audioPath,
  ]);

  return { audioPath, tmpDir };
}

/**
 * Send an audio file to OpenAI Whisper API and return timestamped segments.
 */
async function transcribeWithWhisper(
  audioPath: string,
  openai: OpenAI,
  options: TranscriptionOptions
): Promise<TranscriptionResult> {
  const model = options.model ?? "whisper-1";
  const language = options.language ?? "en";

  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model,
    language,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    ...(options.prompt ? { prompt: options.prompt } : {}),
  });

  // verbose_json returns segments with start/end timestamps
  const raw = response as unknown as {
    text: string;
    language: string;
    duration: number;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  const segments: TranscriptSegment[] = (raw.segments ?? []).map((seg) => ({
    start: Math.round(seg.start * 100) / 100,
    end: Math.round(seg.end * 100) / 100,
    text: seg.text.trim(),
  }));

  return {
    segments,
    language: raw.language ?? language,
    duration: raw.duration ?? 0,
    model,
    fullText: raw.text ?? segments.map((s) => s.text).join(" "),
  };
}

function cleanupTmpDir(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Main entry point: extract audio from a video and transcribe it.
 *
 * @param videoPath - Local file path to the video
 * @param options - Transcription configuration
 * @returns Timestamped transcript segments
 */
export async function transcribeVideo(
  videoPath: string,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const openai = new OpenAI({ apiKey });
  const opts = options ?? {};

  // Step 1: Extract audio track
  const { audioPath, tmpDir } = await extractAudio(videoPath);

  try {
    // Step 2: Transcribe with Whisper
    return await transcribeWithWhisper(audioPath, openai, opts);
  } finally {
    cleanupTmpDir(tmpDir);
  }
}

/**
 * Convenience: transcribe a video and store results in the metadata store.
 */
export async function transcribeVideoAndStore(
  videoId: string,
  videoPath: string,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  const { upsertMetadata } = await import("./metadata-store.js");

  upsertMetadata(videoId, { status: "processing" });

  try {
    const result = await transcribeVideo(videoPath, options);
    upsertMetadata(videoId, {
      transcript: result.segments,
      language: result.language,
      duration: result.duration,
      status: "ready",
    });
    return result;
  } catch (err) {
    upsertMetadata(videoId, { status: "failed" });
    throw err;
  }
}
