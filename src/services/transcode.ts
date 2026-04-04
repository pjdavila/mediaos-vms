import { FiveCentsCdnClient } from "../lib/5centscdn/index.js";
import type {
  TranscodingJob,
  CreateJobParams,
  CreateJobResponse,
} from "../types/5centscdn.js";

export interface TranscodeRequest {
  zoneId: number;
  profileId: number;
  filePath: string;
  priority?: number;
}

export interface TranscodeStatus {
  jobId: number;
  percent: number;
  done: boolean;
  error: string | null;
}

/**
 * Submit a transcoding job to 5CentsCDN.
 */
export async function submitTranscodeJob(
  client: FiveCentsCdnClient,
  req: TranscodeRequest
): Promise<CreateJobResponse> {
  const params: CreateJobParams = {
    file: req.filePath,
    priority: req.priority ?? 50,
  };
  return client.createJob(req.zoneId, req.profileId, params);
}

/**
 * Poll a transcoding job until it completes or fails.
 * Returns the final job status.
 */
export async function waitForTranscode(
  client: FiveCentsCdnClient,
  jobId: number,
  options?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
    onProgress?: (percent: number) => void;
  }
): Promise<TranscodeStatus> {
  const pollInterval = options?.pollIntervalMs ?? 3000;
  const timeout = options?.timeoutMs ?? 120_000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const jobs = await client.listJobs();
    const job = jobs.find((j) => j.jobid === jobId);

    if (!job) {
      // Job no longer in active queue — likely completed
      return { jobId, percent: 100, done: true, error: null };
    }

    if (job.errors) {
      return { jobId, percent: job.percent, done: false, error: job.errors };
    }

    options?.onProgress?.(job.percent);

    if (job.percent >= 100) {
      return { jobId, percent: 100, done: true, error: null };
    }

    await sleep(pollInterval);
  }

  return {
    jobId,
    percent: 0,
    done: false,
    error: `Timed out after ${timeout}ms`,
  };
}

/**
 * Get current status of all active transcoding jobs.
 */
export async function getActiveJobs(
  client: FiveCentsCdnClient
): Promise<TranscodeStatus[]> {
  const jobs = await client.listJobs();
  return jobs.map((j) => ({
    jobId: j.jobid,
    percent: j.percent,
    done: j.percent >= 100,
    error: j.errors || null,
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
