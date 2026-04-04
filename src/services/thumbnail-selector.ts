import OpenAI from "openai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Thumbnail } from "../schemas/metadata.js";

const execFileAsync = promisify(execFile);

export interface ThumbnailExtractionOptions {
  /** Number of candidate frames to extract (default: 12) */
  maxCandidates?: number;
  /** Scene-change detection threshold for FFmpeg (0-1, lower = more sensitive, default: 0.3) */
  sceneThreshold?: number;
  /** Fallback interval in seconds if scene detection yields too few frames (default: 5) */
  fallbackIntervalSec?: number;
  /** Number of top thumbnails to return (default: 3) */
  topN?: number;
  /** OpenAI model to use for scoring (default: gpt-4o) */
  model?: string;
}

export interface ScoredCandidate {
  framePath: string;
  timestamp: number;
  qualityScore: number;
  reasoning: string;
}

export interface ThumbnailSelectionResult {
  thumbnails: Thumbnail[];
  candidatesEvaluated: number;
  model: string;
}

/**
 * Extract candidate frames using FFmpeg scene-change detection.
 * Falls back to interval-based extraction if scene detection yields too few frames.
 */
export async function extractCandidateFrames(
  videoPath: string,
  options?: Pick<ThumbnailExtractionOptions, "maxCandidates" | "sceneThreshold" | "fallbackIntervalSec">
): Promise<{ framePaths: string[]; timestamps: number[]; tmpDir: string }> {
  const maxCandidates = options?.maxCandidates ?? 12;
  const sceneThreshold = options?.sceneThreshold ?? 0.3;
  const fallbackIntervalSec = options?.fallbackIntervalSec ?? 5;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediaos-thumbs-"));

  // First, try scene-change detection to find visually distinct frames
  const sceneOutputPattern = path.join(tmpDir, "scene-%03d.jpg");
  try {
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vf", `select='gt(scene,${sceneThreshold})',showinfo`,
      "-vsync", "vfr",
      "-frames:v", String(maxCandidates),
      "-q:v", "2",
      "-f", "image2",
      sceneOutputPattern,
    ], { maxBuffer: 10 * 1024 * 1024 });
  } catch {
    // Scene detection may fail on short or static videos — continue to fallback
  }

  let framePaths = fs.readdirSync(tmpDir)
    .filter((f) => f.startsWith("scene-") && f.endsWith(".jpg"))
    .sort()
    .map((f) => path.join(tmpDir, f));

  // Fallback: interval-based extraction if scene detection found fewer than 3 frames
  if (framePaths.length < 3) {
    const intervalOutputPattern = path.join(tmpDir, "interval-%03d.jpg");
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vf", `fps=1/${fallbackIntervalSec}`,
      "-frames:v", String(maxCandidates),
      "-q:v", "2",
      "-f", "image2",
      intervalOutputPattern,
    ]);

    const intervalFrames = fs.readdirSync(tmpDir)
      .filter((f) => f.startsWith("interval-") && f.endsWith(".jpg"))
      .sort()
      .map((f) => path.join(tmpDir, f));

    framePaths = [...framePaths, ...intervalFrames].slice(0, maxCandidates);
  }

  // Derive approximate timestamps from frame order and fallback interval
  const timestamps = framePaths.map((_, i) => i * fallbackIntervalSec);

  return { framePaths, timestamps, tmpDir };
}

function imageToDataUrl(imagePath: string): string {
  const data = fs.readFileSync(imagePath);
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

const SCORING_SYSTEM_PROMPT = `You are a video thumbnail quality evaluator. Score this frame as a potential video thumbnail.

Return ONLY a JSON object with:
- "qualityScore": a number between 0 and 1 (1 = excellent thumbnail)
- "reasoning": a brief explanation (1 sentence)

Evaluate based on:
- Composition: rule of thirds, visual balance, clear focal point
- Faces: presence of clear, well-lit faces (bonus)
- Sharpness: no motion blur, good focus
- Contrast: good dynamic range, not over/under-exposed
- Text: readable text overlays are a plus, cluttered text is a minus
- Visual interest: engaging, representative content

A great thumbnail is sharp, well-composed, has a clear subject, and would make someone want to click.`;

interface FrameScore {
  qualityScore: number;
  reasoning: string;
}

/**
 * Score a batch of candidate frames using OpenAI Vision.
 */
async function scoreFrames(
  framePaths: string[],
  openai: OpenAI,
  model: string
): Promise<FrameScore[]> {
  const scores: FrameScore[] = [];

  // Process in parallel batches of 4
  const batchSize = 4;
  for (let i = 0; i < framePaths.length; i += batchSize) {
    const batch = framePaths.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (framePath): Promise<FrameScore> => {
        const dataUrl = imageToDataUrl(framePath);
        try {
          const response = await openai.chat.completions.create({
            model,
            messages: [
              { role: "system", content: SCORING_SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: dataUrl, detail: "low" },
                  },
                  { type: "text", text: "Score this frame as a video thumbnail." },
                ],
              },
            ],
            response_format: { type: "json_object" },
            max_tokens: 200,
          });

          const content = response.choices[0]?.message?.content;
          if (!content) return { qualityScore: 0, reasoning: "No response" };

          const parsed = JSON.parse(content);
          return {
            qualityScore: Math.max(0, Math.min(1, Number(parsed.qualityScore) || 0)),
            reasoning: String(parsed.reasoning ?? ""),
          };
        } catch {
          return { qualityScore: 0, reasoning: "Scoring failed" };
        }
      })
    );
    scores.push(...results);
  }

  return scores;
}

function cleanupTmpDir(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Main entry point: extract candidate frames, score them with AI, and return the top-N thumbnails.
 *
 * @param videoPath - Local file path to the video
 * @param options - Configuration for extraction and scoring
 * @returns Top-N thumbnails ranked by quality score
 */
export async function selectThumbnails(
  videoPath: string,
  options?: ThumbnailExtractionOptions
): Promise<ThumbnailSelectionResult> {
  const topN = options?.topN ?? 3;
  const model = options?.model ?? "gpt-4o";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const openai = new OpenAI({ apiKey });

  const { framePaths, timestamps, tmpDir } = await extractCandidateFrames(videoPath, {
    maxCandidates: options?.maxCandidates,
    sceneThreshold: options?.sceneThreshold,
    fallbackIntervalSec: options?.fallbackIntervalSec,
  });

  if (framePaths.length === 0) {
    cleanupTmpDir(tmpDir);
    return { thumbnails: [], candidatesEvaluated: 0, model };
  }

  try {
    const scores = await scoreFrames(framePaths, openai, model);

    // Pair scores with timestamps and sort by quality
    const ranked = scores
      .map((score, i) => ({
        ...score,
        timestamp: timestamps[i] ?? 0,
        index: i,
      }))
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, topN);

    // Build Thumbnail objects — URL is a placeholder for the caller to fill with CDN URLs
    const thumbnails: Thumbnail[] = ranked.map((candidate, rank) => ({
      url: `thumbnail://${rank + 1}`, // placeholder — route layer replaces with real CDN URL
      timestamp: candidate.timestamp,
      qualityScore: Math.round(candidate.qualityScore * 100) / 100,
      selected: rank === 0,
    }));

    return { thumbnails, candidatesEvaluated: framePaths.length, model };
  } finally {
    cleanupTmpDir(tmpDir);
  }
}

/**
 * Convenience: select thumbnails and store results in the metadata store.
 */
export async function selectThumbnailsAndStore(
  videoId: string,
  videoPath: string,
  cdnBaseUrl: string,
  options?: ThumbnailExtractionOptions
): Promise<ThumbnailSelectionResult> {
  const { upsertMetadata } = await import("./metadata-store.js");

  upsertMetadata(videoId, { status: "processing" });

  try {
    const result = await selectThumbnails(videoPath, options);

    // Replace placeholder URLs with CDN-based thumbnail URLs
    const thumbnails = result.thumbnails.map((thumb, i) => ({
      ...thumb,
      url: `${cdnBaseUrl}/thumbnails/${videoId}/thumb-${i + 1}.jpg`,
    }));

    upsertMetadata(videoId, { thumbnails, status: "ready" });
    return { ...result, thumbnails };
  } catch (err) {
    upsertMetadata(videoId, { status: "failed" });
    throw err;
  }
}
