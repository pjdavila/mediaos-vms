import { FiveCentsCdnClient } from "../lib/5centscdn/index.js";
import type { CdnConfig } from "../lib/5centscdn/index.js";
import { uploadToVodZone } from "./upload.js";
import { submitTranscodeJob, waitForTranscode } from "./transcode.js";
import type { TranscodeStatus } from "./transcode.js";

export interface VideoPipelineResult {
  filename: string;
  remotePath: string;
  sizeBytes: number;
  transcode: TranscodeStatus | null;
  hlsUrl: string | null;
}

export interface VideoPipelineOptions {
  profileId?: number;
  autoTranscode?: boolean;
  priority?: number;
  onProgress?: (stage: string, detail: string) => void;
}

/**
 * Full video pipeline: upload → transcode → return HLS URL.
 *
 * Two modes:
 * 1. Auto-transcode: upload to /raw, zone's auto-profile handles transcoding
 * 2. Explicit: upload to /mp4, then submit a transcoding job manually
 */
export async function processVideo(
  localFilePath: string,
  config: CdnConfig,
  client: FiveCentsCdnClient,
  options?: VideoPipelineOptions
): Promise<VideoPipelineResult> {
  const autoTranscode = options?.autoTranscode ?? true;
  const progress = options?.onProgress ?? (() => {});

  // Step 1: Upload
  progress("upload", "Starting FTP upload...");
  const uploadResult = await uploadToVodZone(localFilePath, config, {
    remoteDir: autoTranscode ? "/raw" : "/mp4",
  });
  progress("upload", `Uploaded ${uploadResult.filename} (${uploadResult.sizeBytes} bytes)`);

  // Step 2: Transcode
  let transcodeStatus: TranscodeStatus | null = null;

  if (!autoTranscode && options?.profileId) {
    progress("transcode", "Submitting transcoding job...");
    const job = await submitTranscodeJob(client, {
      zoneId: config.vodZoneId,
      profileId: options.profileId,
      filePath: uploadResult.remotePath,
      priority: options.priority,
    });
    progress("transcode", `Job ${job.jobid} submitted, polling...`);

    transcodeStatus = await waitForTranscode(client, job.jobid, {
      onProgress: (pct) => progress("transcode", `${pct}% complete`),
    });
  } else if (autoTranscode) {
    progress("transcode", "Auto-transcode triggered by /raw upload");
  }

  // Step 3: Construct HLS URL
  // The HLS URL is available from the zone's playback_url_hls + filename
  const zone = await client.getVodPushZone(config.vodZoneId);
  const hlsBase = zone.playback_url_hls;
  const hlsUrl = hlsBase
    ? `${hlsBase}/${stripExtension(uploadResult.filename)}/playlist.m3u8`
    : null;

  progress("done", `Pipeline complete. HLS: ${hlsUrl ?? "pending"}`);

  return {
    filename: uploadResult.filename,
    remotePath: uploadResult.remotePath,
    sizeBytes: uploadResult.sizeBytes,
    transcode: transcodeStatus,
    hlsUrl,
  };
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.substring(0, dot) : filename;
}
