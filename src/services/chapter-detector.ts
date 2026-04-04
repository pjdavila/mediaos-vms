import OpenAI from "openai";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Chapter, TranscriptSegment } from "../schemas/metadata.js";

const execFileAsync = promisify(execFile);

export interface ChapterDetectionOptions {
  /** FFmpeg scene-change threshold (0-1, lower = more sensitive, default: 0.3) */
  sceneThreshold?: number;
  /** Minimum chapter duration in seconds (default: 30) */
  minChapterDurationSec?: number;
  /** Maximum number of chapters to detect (default: 20) */
  maxChapters?: number;
  /** OpenAI model to use for title generation (default: gpt-4o) */
  model?: string;
}

export interface ChapterDetectionResult {
  chapters: Chapter[];
  sceneBoundaries: number[];
  model: string;
}

/**
 * Use FFmpeg scene-change detection to find timestamps where the visual content shifts.
 * Returns an array of timestamps (in seconds) where scene changes occur.
 */
export async function detectSceneBoundaries(
  videoPath: string,
  sceneThreshold: number
): Promise<number[]> {
  // FFmpeg showinfo filter logs frame timestamps; select filter picks scene changes
  // Note: execFile is used (not exec) to prevent shell injection
  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vf", `select='gt(scene,${sceneThreshold})',showinfo`,
    "-vsync", "vfr",
    "-f", "null",
    "-",
  ], { maxBuffer: 20 * 1024 * 1024 });

  // Parse showinfo output for pts_time values
  const timestamps: number[] = [];
  const ptsRegex = /pts_time:\s*([\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = ptsRegex.exec(stderr)) !== null) {
    timestamps.push(parseFloat(match[1]));
  }

  return timestamps.sort((a, b) => a - b);
}

/**
 * Analyze transcript segments to find topic shift boundaries.
 * Uses a sliding window to detect where adjacent transcript chunks diverge in topic.
 * Returns timestamps where topic shifts likely occur.
 */
export function detectTopicShifts(
  segments: TranscriptSegment[],
  windowSize: number = 5
): number[] {
  if (segments.length < windowSize * 2) return [];

  const shifts: number[] = [];

  // Build text windows and look for vocabulary divergence
  for (let i = windowSize; i <= segments.length - windowSize; i++) {
    const before = segments.slice(i - windowSize, i).map((s) => s.text).join(" ");
    const after = segments.slice(i, i + windowSize).map((s) => s.text).join(" ");

    const similarity = jaccardSimilarity(
      extractWords(before),
      extractWords(after)
    );

    // Low similarity = topic shift
    if (similarity < 0.15) {
      shifts.push(segments[i].start);
    }
  }

  return shifts;
}

function extractWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 3)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Merge scene boundaries and topic shifts into unified chapter boundaries.
 * Boundaries that are within `mergeDist` seconds of each other are merged.
 */
export function mergeBoundaries(
  sceneBoundaries: number[],
  topicShifts: number[],
  minChapterDuration: number,
  mergeDist: number = 10
): number[] {
  // Combine and sort all candidate boundaries
  const all = [...sceneBoundaries, ...topicShifts].sort((a, b) => a - b);

  // Merge nearby boundaries (prefer the earlier one)
  const merged: number[] = [];
  for (const ts of all) {
    if (merged.length === 0 || ts - merged[merged.length - 1] > mergeDist) {
      merged.push(ts);
    }
  }

  // Filter out chapters that are too short
  const filtered: number[] = [];
  for (const ts of merged) {
    if (filtered.length === 0 || ts - filtered[filtered.length - 1] >= minChapterDuration) {
      filtered.push(ts);
    }
  }

  return filtered;
}

const TITLE_GENERATION_PROMPT = `You are a video chapter title generator. Given transcript text for a video chapter segment, generate a concise, descriptive chapter title.

Return ONLY a JSON object with:
- "title": a concise chapter title (3-8 words, no quotes)

The title should describe the main topic or activity in the segment. Be specific but concise.`;

/**
 * Generate chapter titles from transcript context using OpenAI.
 */
async function generateChapterTitles(
  boundaries: number[],
  segments: TranscriptSegment[],
  videoDuration: number,
  openai: OpenAI,
  model: string
): Promise<Chapter[]> {
  // Build chapter ranges: [boundary[0], boundary[1]), [boundary[1], boundary[2]), ...
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : videoDuration;
    ranges.push({ start, end });
  }

  // If no boundaries, entire video is one chapter
  if (ranges.length === 0) {
    ranges.push({ start: 0, end: videoDuration });
  }

  // Get transcript text for each chapter range
  const chapters: Chapter[] = [];
  for (const range of ranges) {
    const chapterSegments = segments.filter(
      (s) => s.start >= range.start && s.start < range.end
    );
    const text = chapterSegments.map((s) => s.text).join(" ").trim();

    let title = `Chapter ${chapters.length + 1}`;
    if (text.length > 10) {
      try {
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: TITLE_GENERATION_PROMPT },
            { role: "user", content: `Generate a chapter title for this segment:\n\n${text.slice(0, 1000)}` },
          ],
          response_format: { type: "json_object" },
          max_tokens: 100,
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.title) title = String(parsed.title);
        }
      } catch {
        // Keep fallback title
      }
    }

    chapters.push({
      title,
      startTime: Math.round(range.start * 100) / 100,
      endTime: Math.round(range.end * 100) / 100,
    });
  }

  return chapters;
}

/**
 * Main entry point: detect chapters by combining scene detection and transcript analysis.
 *
 * @param videoPath - Local file path to the video
 * @param segments - Timestamped transcript segments (from transcriber service)
 * @param videoDuration - Total video duration in seconds
 * @param options - Configuration for detection
 * @returns Detected chapters with AI-generated titles
 */
export async function detectChapters(
  videoPath: string,
  segments: TranscriptSegment[],
  videoDuration: number,
  options?: ChapterDetectionOptions
): Promise<ChapterDetectionResult> {
  const sceneThreshold = options?.sceneThreshold ?? 0.3;
  const minChapterDurationSec = options?.minChapterDurationSec ?? 30;
  const maxChapters = options?.maxChapters ?? 20;
  const model = options?.model ?? "gpt-4o";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const openai = new OpenAI({ apiKey });

  // Step 1: Detect scene boundaries from video frames
  const sceneBoundaries = await detectSceneBoundaries(videoPath, sceneThreshold);

  // Step 2: Detect topic shifts from transcript
  const topicShifts = detectTopicShifts(segments);

  // Step 3: Merge boundaries, enforcing minimum chapter duration
  let boundaries = mergeBoundaries(
    sceneBoundaries,
    topicShifts,
    minChapterDurationSec
  );

  // Always start with t=0 if not already present
  if (boundaries.length === 0 || boundaries[0] > 1) {
    boundaries = [0, ...boundaries];
  }

  // Cap at maxChapters
  if (boundaries.length > maxChapters) {
    boundaries = boundaries.slice(0, maxChapters);
  }

  // Step 4: Generate chapter titles from transcript context
  const chapters = await generateChapterTitles(
    boundaries,
    segments,
    videoDuration,
    openai,
    model
  );

  return { chapters, sceneBoundaries, model };
}

/**
 * Convenience: detect chapters and store results in the metadata store.
 */
export async function detectChaptersAndStore(
  videoId: string,
  videoPath: string,
  segments: TranscriptSegment[],
  videoDuration: number,
  options?: ChapterDetectionOptions
): Promise<ChapterDetectionResult> {
  const { upsertMetadata } = await import("./metadata-store.js");

  upsertMetadata(videoId, { status: "processing" });

  try {
    const result = await detectChapters(videoPath, segments, videoDuration, options);
    upsertMetadata(videoId, { chapters: result.chapters, status: "ready" });
    return result;
  } catch (err) {
    upsertMetadata(videoId, { status: "failed" });
    throw err;
  }
}
