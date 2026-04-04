import { upsertMetadata, getMetadata } from "./metadata-store.js";
import { tagVideo } from "./ai-tagger.js";
import { transcribeVideo } from "./transcriber.js";
import { selectThumbnails } from "./thumbnail-selector.js";
import { detectChapters } from "./chapter-detector.js";
import { emitWebhook } from "./webhook-emitter.js";
import type { AiTaggingOptions } from "./ai-tagger.js";
import type { TranscriptionOptions } from "./transcriber.js";
import type { ThumbnailExtractionOptions } from "./thumbnail-selector.js";
import type { ChapterDetectionOptions } from "./chapter-detector.js";
import type { VideoMetadata } from "../schemas/metadata.js";

export interface AiMetadataPipelineOptions {
  tagging?: AiTaggingOptions;
  transcription?: TranscriptionOptions;
  thumbnails?: ThumbnailExtractionOptions & { cdnBaseUrl?: string };
  chapters?: ChapterDetectionOptions;
  /** Skip specific stages */
  skip?: {
    tags?: boolean;
    transcript?: boolean;
    thumbnails?: boolean;
    chapters?: boolean;
  };
}

export interface AiMetadataPipelineResult {
  videoId: string;
  status: "ready" | "failed";
  stages: {
    tags: StageResult;
    transcript: StageResult;
    thumbnails: StageResult;
    chapters: StageResult;
  };
  durationMs: number;
}

interface StageResult {
  status: "ok" | "failed" | "skipped";
  error?: string;
}

/**
 * Run the full AI metadata pipeline for a video.
 * Orchestrates tagging, transcription, thumbnail selection, and chapter detection.
 * Updates metadata status throughout and emits a webhook on completion.
 *
 * This function never throws — it always returns a result with per-stage status.
 */
export async function runAiMetadataPipeline(
  videoId: string,
  videoPath: string,
  options?: AiMetadataPipelineOptions
): Promise<AiMetadataPipelineResult> {
  const start = Date.now();
  const skip = options?.skip ?? {};

  const stages: AiMetadataPipelineResult["stages"] = {
    tags: { status: "skipped" },
    transcript: { status: "skipped" },
    thumbnails: { status: "skipped" },
    chapters: { status: "skipped" },
  };

  // Mark as processing
  upsertMetadata(videoId, { status: "processing" });

  // Phase 1: Run tagging + transcription in parallel (chapters depend on transcript)
  const [tagResult, transcriptResult] = await Promise.allSettled([
    skip.tags
      ? Promise.resolve(null)
      : tagVideo(videoPath, options?.tagging),
    skip.transcript
      ? Promise.resolve(null)
      : transcribeVideo(videoPath, options?.transcription),
  ]);

  // Process tag results
  if (!skip.tags) {
    if (tagResult.status === "fulfilled" && tagResult.value) {
      upsertMetadata(videoId, { tags: tagResult.value.tags });
      stages.tags = { status: "ok" };
    } else if (tagResult.status === "rejected") {
      stages.tags = { status: "failed", error: extractError(tagResult.reason) };
    }
  }

  // Process transcript results
  let transcriptDuration = 0;
  if (!skip.transcript) {
    if (transcriptResult.status === "fulfilled" && transcriptResult.value) {
      const tr = transcriptResult.value;
      upsertMetadata(videoId, {
        transcript: tr.segments,
        language: tr.language,
        duration: tr.duration,
      });
      stages.transcript = { status: "ok" };
      transcriptDuration = tr.duration;
    } else if (transcriptResult.status === "rejected") {
      stages.transcript = { status: "failed", error: extractError(transcriptResult.reason) };
    }
  }

  // Phase 2: Run thumbnails + chapters in parallel (chapters use transcript data)
  const transcriptSegments =
    transcriptResult.status === "fulfilled" && transcriptResult.value
      ? transcriptResult.value.segments
      : [];

  const [thumbResult, chapterResult] = await Promise.allSettled([
    skip.thumbnails
      ? Promise.resolve(null)
      : selectThumbnails(videoPath, options?.thumbnails),
    skip.chapters || transcriptSegments.length === 0
      ? Promise.resolve(null)
      : detectChapters(videoPath, transcriptSegments, transcriptDuration, options?.chapters),
  ]);

  // Process thumbnail results
  if (!skip.thumbnails) {
    if (thumbResult.status === "fulfilled" && thumbResult.value) {
      const cdnBase = options?.thumbnails?.cdnBaseUrl ?? "";
      const thumbnails = thumbResult.value.thumbnails.map((thumb, i) => ({
        ...thumb,
        url: cdnBase
          ? `${cdnBase}/thumbnails/${videoId}/thumb-${i + 1}.jpg`
          : thumb.url,
      }));
      upsertMetadata(videoId, { thumbnails });
      stages.thumbnails = { status: "ok" };
    } else if (thumbResult.status === "rejected") {
      stages.thumbnails = { status: "failed", error: extractError(thumbResult.reason) };
    }
  }

  // Process chapter results
  if (!skip.chapters) {
    if (transcriptSegments.length === 0) {
      stages.chapters = { status: "skipped" };
    } else if (chapterResult.status === "fulfilled" && chapterResult.value) {
      upsertMetadata(videoId, { chapters: chapterResult.value.chapters });
      stages.chapters = { status: "ok" };
    } else if (chapterResult.status === "rejected") {
      stages.chapters = { status: "failed", error: extractError(chapterResult.reason) };
    }
  }

  // Determine overall status: ready if at least one stage succeeded, failed if all non-skipped failed
  const nonSkipped = Object.values(stages).filter((s) => s.status !== "skipped");
  const anyOk = nonSkipped.some((s) => s.status === "ok");
  const overallStatus = anyOk ? "ready" : "failed";

  upsertMetadata(videoId, { status: overallStatus });

  const durationMs = Date.now() - start;

  // Emit webhook
  const meta = getMetadata(videoId);
  await emitWebhook({
    event: overallStatus === "ready" ? "metadata.ready" : "metadata.failed",
    videoId,
    timestamp: new Date().toISOString(),
    metadata: meta ? toPlainObject(meta) : undefined,
    error: overallStatus === "failed" ? summarizeErrors(stages) : undefined,
  });

  console.log(
    `[ai-pipeline] ${videoId} completed in ${durationMs}ms — status: ${overallStatus}`,
    stages
  );

  return { videoId, status: overallStatus, stages, durationMs };
}

/**
 * Fire-and-forget wrapper: triggers the pipeline without awaiting it.
 * Logs errors but never throws.
 */
export function triggerAiMetadataPipeline(
  videoId: string,
  videoPath: string,
  options?: AiMetadataPipelineOptions
): void {
  // Initialize metadata record as pending
  upsertMetadata(videoId, { status: "pending" });

  runAiMetadataPipeline(videoId, videoPath, options).catch((err) => {
    console.error(`[ai-pipeline] Unexpected error for ${videoId}:`, err);
    try {
      upsertMetadata(videoId, { status: "failed" });
    } catch {
      // best-effort
    }
  });
}

function extractError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function summarizeErrors(stages: AiMetadataPipelineResult["stages"]): string {
  return Object.entries(stages)
    .filter(([, s]) => s.status === "failed")
    .map(([name, s]) => `${name}: ${s.error}`)
    .join("; ");
}

function toPlainObject(meta: VideoMetadata): Record<string, unknown> {
  return JSON.parse(JSON.stringify(meta));
}
