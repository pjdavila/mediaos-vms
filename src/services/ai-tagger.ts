import OpenAI from "openai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tag } from "../schemas/metadata.js";

const execFileAsync = promisify(execFile);

export interface FrameExtractionOptions {
  /** Interval in seconds between extracted frames (default: 5) */
  intervalSec?: number;
  /** Maximum number of frames to extract (default: 10) */
  maxFrames?: number;
}

export interface AiTaggingOptions extends FrameExtractionOptions {
  /** Minimum confidence score to include a tag (default: 0.85) */
  minConfidence?: number;
  /** OpenAI model to use (default: gpt-4o) */
  model?: string;
}

export interface AiTaggingResult {
  tags: Tag[];
  framesAnalyzed: number;
  model: string;
}

/**
 * Extract keyframes from a video file at a fixed interval using FFmpeg.
 * Returns paths to the extracted JPEG frames in a temp directory.
 */
export async function extractFrames(
  videoPath: string,
  options?: FrameExtractionOptions
): Promise<{ framePaths: string[]; tmpDir: string }> {
  const intervalSec = options?.intervalSec ?? 5;
  const maxFrames = options?.maxFrames ?? 10;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediaos-frames-"));
  const outputPattern = path.join(tmpDir, "frame-%03d.jpg");

  // Use fps filter to extract one frame every N seconds, limit with -frames:v
  await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vf", `fps=1/${intervalSec}`,
    "-frames:v", String(maxFrames),
    "-q:v", "2",
    "-f", "image2",
    outputPattern,
  ]);

  const framePaths = fs.readdirSync(tmpDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map((f) => path.join(tmpDir, f));

  return { framePaths, tmpDir };
}

/**
 * Encode a local image file to a base64 data URL for the OpenAI Vision API.
 */
function imageToDataUrl(imagePath: string): string {
  const data = fs.readFileSync(imagePath);
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

const VISION_SYSTEM_PROMPT = `You are a video content tagger. Analyze this video frame and return structured JSON tags.

Return ONLY a JSON array of objects, each with:
- "label": a concise, lowercase tag (e.g. "basketball", "outdoor scene", "interview")
- "confidence": a number between 0 and 1 representing how confident you are
- "category": one of "object", "scene", "action", "text", "person", "category"

Identify: objects, scenes, activities, visible text/OCR, notable people/roles, and content categories.
Be specific but concise. Return 5-15 tags per frame. Only include tags with confidence >= 0.7.`;

interface VisionTag {
  label: string;
  confidence: number;
  category: string;
}

/**
 * Send a batch of frames to OpenAI Vision and aggregate tags.
 */
async function analyzeFramesWithVision(
  framePaths: string[],
  openai: OpenAI,
  model: string
): Promise<VisionTag[]> {
  const allTags: VisionTag[] = [];

  // Process frames in parallel (batch of up to 5 at a time)
  const batchSize = 5;
  for (let i = 0; i < framePaths.length; i += batchSize) {
    const batch = framePaths.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (framePath) => {
        const dataUrl = imageToDataUrl(framePath);
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: VISION_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: dataUrl, detail: "low" },
                },
                { type: "text", text: "Analyze this video frame and return JSON tags." },
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        try {
          const parsed = JSON.parse(content);
          // Handle both { tags: [...] } and direct array
          const tags = Array.isArray(parsed) ? parsed : (parsed.tags ?? []);
          return tags as VisionTag[];
        } catch {
          return [];
        }
      })
    );
    allTags.push(...results.flat());
  }

  return allTags;
}

/**
 * Deduplicate and merge tags from multiple frames.
 * Tags with the same label are merged, keeping the highest confidence.
 */
function deduplicateTags(tags: VisionTag[], minConfidence: number): Tag[] {
  const tagMap = new Map<string, VisionTag>();

  for (const tag of tags) {
    const key = tag.label.toLowerCase().trim();
    const existing = tagMap.get(key);
    if (!existing || tag.confidence > existing.confidence) {
      tagMap.set(key, { ...tag, label: key });
    }
  }

  return Array.from(tagMap.values())
    .filter((t) => t.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .map((t) => ({
      label: t.label,
      confidence: Math.round(t.confidence * 100) / 100,
      source: "ai" as const,
    }));
}

/**
 * Clean up extracted frames from disk.
 */
function cleanupFrames(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Main entry point: extract frames from a video and tag them with AI.
 *
 * @param videoPath - Local file path to the video
 * @param options - Configuration for frame extraction and tagging
 * @returns Structured tags with confidence scores
 */
export async function tagVideo(
  videoPath: string,
  options?: AiTaggingOptions
): Promise<AiTaggingResult> {
  const minConfidence = options?.minConfidence ?? 0.85;
  const model = options?.model ?? "gpt-4o";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const openai = new OpenAI({ apiKey });

  // Step 1: Extract frames
  const { framePaths, tmpDir } = await extractFrames(videoPath, {
    intervalSec: options?.intervalSec,
    maxFrames: options?.maxFrames,
  });

  if (framePaths.length === 0) {
    cleanupFrames(tmpDir);
    return { tags: [], framesAnalyzed: 0, model };
  }

  try {
    // Step 2: Analyze frames with Vision API
    const rawTags = await analyzeFramesWithVision(framePaths, openai, model);

    // Step 3: Deduplicate and filter
    const tags = deduplicateTags(rawTags, minConfidence);

    return { tags, framesAnalyzed: framePaths.length, model };
  } finally {
    cleanupFrames(tmpDir);
  }
}

/**
 * Convenience: tag a video and store results in the metadata store.
 */
export async function tagVideoAndStore(
  videoId: string,
  videoPath: string,
  options?: AiTaggingOptions
): Promise<AiTaggingResult> {
  // Lazy import to avoid circular deps
  const { upsertMetadata } = await import("./metadata-store.js");

  upsertMetadata(videoId, { status: "processing" });

  try {
    const result = await tagVideo(videoPath, options);
    upsertMetadata(videoId, { tags: result.tags, status: "ready" });
    return result;
  } catch (err) {
    upsertMetadata(videoId, { status: "failed" });
    throw err;
  }
}
