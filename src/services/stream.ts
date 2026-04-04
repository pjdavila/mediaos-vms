import { FiveCentsCdnClient } from "../lib/5centscdn/index.js";
import type {
  PushStream,
  StreamStatistics,
  CreateStreamParams,
} from "../types/5centscdn.js";

export interface StreamInfo {
  id: number;
  name: string;
  rtmpIngestUrl: string;
  hlsPlaybackUrl: string;
  dashPlaybackUrl: string;
  disabled: boolean;
  platforms: { name: string; rtmpUrl: string }[];
}

export interface StreamWithStats extends StreamInfo {
  stats: StreamStatistics | null;
}

/**
 * Create a new live push stream.
 * Returns RTMP ingest URL and HLS/DASH playback URLs.
 */
export async function createLiveStream(
  client: FiveCentsCdnClient,
  params: CreateStreamParams
): Promise<StreamInfo> {
  const stream = await client.createPushStream(params);
  return mapStream(stream);
}

/**
 * List all live streams.
 */
export async function listLiveStreams(
  client: FiveCentsCdnClient
): Promise<StreamInfo[]> {
  const streams = await client.listStreams();
  return streams.map(mapStream);
}

/**
 * Get a single stream with optional live statistics.
 */
export async function getLiveStream(
  client: FiveCentsCdnClient,
  streamId: number,
  includeStats = false
): Promise<StreamWithStats> {
  const stream = await client.getPushStream(streamId);
  let stats: StreamStatistics | null = null;

  if (includeStats) {
    try {
      stats = await client.getStreamStatistics(streamId);
    } catch {
      // Stats unavailable if stream is not currently live
      stats = null;
    }
  }

  return { ...mapStream(stream), stats };
}

/**
 * Enable or disable a live stream.
 */
export async function setStreamEnabled(
  client: FiveCentsCdnClient,
  streamId: number,
  enabled: boolean
): Promise<StreamInfo> {
  const stream = await client.updatePushStreamStatus(streamId, !enabled);
  return mapStream(stream);
}

/**
 * Delete a live stream.
 */
export async function deleteLiveStream(
  client: FiveCentsCdnClient,
  streamId: number
): Promise<void> {
  await client.deletePushStream(streamId);
}

function mapStream(stream: PushStream): StreamInfo {
  return {
    id: stream.id,
    name: stream.name,
    rtmpIngestUrl: stream.rtmp_url,
    hlsPlaybackUrl: stream.hls_url,
    dashPlaybackUrl: stream.dash_url,
    disabled: stream.disabled === 1,
    platforms: stream.platforms.map((p) => ({
      name: p.name,
      rtmpUrl: p.rtmp_url,
    })),
  };
}
