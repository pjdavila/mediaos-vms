import { FiveCentsCdnClient } from "../lib/5centscdn/index.js";
import type { CreateProfileParams } from "../types/5centscdn.js";
import type { ChannelType, FormatSpec, DistributionChannel } from "../schemas/channels.js";
import { getChannel } from "./channel-store.js";
import { submitTranscodeJob, waitForTranscode, type TranscodeStatus } from "./transcode.js";
import { getMetadata } from "./metadata-store.js";
import type { VideoMetadata, Tag } from "../schemas/metadata.js";

/**
 * Default format requirements per channel type.
 * Used when a channel has no custom formatSpec.
 */
export const CHANNEL_FORMAT_DEFAULTS: Record<ChannelType, FormatSpec> = {
  youtube: {
    maxResolution: "1920x1080",
    maxBitrate: 8_000, // kbps
    aspectRatio: "16:9",
    maxDurationSec: 43_200, // 12 hours
    containerFormat: "mp4",
  },
  twitter: {
    maxResolution: "1280x720",
    maxBitrate: 5_000,
    aspectRatio: "16:9",
    maxDurationSec: 140,
    containerFormat: "mp4",
  },
  custom_webhook: {
    maxResolution: "1920x1080",
    maxBitrate: 8_000,
    aspectRatio: "16:9",
    maxDurationSec: 86_400,
    containerFormat: "mp4",
  },
  embed: {
    maxResolution: "1280x720",
    maxBitrate: 4_000,
    aspectRatio: "16:9",
    maxDurationSec: 86_400,
    containerFormat: "mp4",
  },
};

export interface AdaptRequest {
  videoId: string;
  channelId: string;
  zoneId: number;
}

export interface AdaptResult {
  videoId: string;
  channelId: string;
  channelType: ChannelType;
  formatSpec: FormatSpec;
  profileParams: CreateProfileParams;
  transcode: TranscodeStatus | null;
  platformMetadata: PlatformMetadata;
}

export interface PlatformMetadata {
  title: string;
  description: string;
  tags: string[];
  thumbnailPath: string | null;
}

/**
 * Resolve the effective format spec for a channel:
 * channel-level override > channel-type defaults.
 */
export function resolveFormatSpec(channel: DistributionChannel): FormatSpec {
  const defaults = CHANNEL_FORMAT_DEFAULTS[channel.type as ChannelType];
  if (!channel.formatSpec) return { ...defaults };

  return {
    maxResolution: channel.formatSpec.maxResolution ?? defaults.maxResolution,
    maxBitrate: channel.formatSpec.maxBitrate ?? defaults.maxBitrate,
    aspectRatio: channel.formatSpec.aspectRatio ?? defaults.aspectRatio,
    maxDurationSec: channel.formatSpec.maxDurationSec ?? defaults.maxDurationSec,
    containerFormat: channel.formatSpec.containerFormat ?? defaults.containerFormat,
  };
}

/**
 * Convert a FormatSpec into 5CentsCDN transcoding profile params.
 */
export function buildProfileParams(
  channelType: ChannelType,
  spec: FormatSpec
): CreateProfileParams {
  const [width] = (spec.maxResolution ?? "1920x1080").split("x").map(Number);

  let preset = "medium";
  if (channelType === "twitter") preset = "fast";
  if (channelType === "embed") preset = "fast";

  return {
    name: `mediaos-${channelType}-${width}p`,
    format: spec.containerFormat ?? "mp4",
    cv: "libx264",
    ca: "aac",
    bv: 1,
    bvvalue: `${spec.maxBitrate ?? 8000}k`,
    ba: 1,
    bavalue: "128k",
    fps: 30,
    crf: channelType === "twitter" ? 28 : 23,
    preset,
    outputdir: `adapted/${channelType}`,
  };
}

/**
 * Build platform-specific metadata from stored video metadata.
 */
export function buildPlatformMetadata(
  videoId: string,
  channelType: ChannelType
): PlatformMetadata {
  const meta = getMetadata(videoId) as VideoMetadata | null;

  const base: PlatformMetadata = {
    title: "",
    description: "",
    tags: [],
    thumbnailPath: null,
  };

  if (!meta) return base;

  // Extract title from the first tag or use empty string (metadata schema doesn't have a title field)
  base.description = meta.language ? `Language: ${meta.language}` : "";

  // Extract tag labels as string array
  if (Array.isArray(meta.tags)) {
    base.tags = meta.tags.map((t: Tag) => t.label);
  }

  // Use the selected thumbnail path if available
  const selected = meta.thumbnails?.find((t) => t.selected);
  base.thumbnailPath = selected?.url ?? meta.thumbnails?.[0]?.url ?? null;

  // Platform-specific adjustments
  if (channelType === "twitter") {
    if (base.description.length > 250) {
      base.description = base.description.slice(0, 247) + "...";
    }
    base.tags = base.tags.slice(0, 5);
  }

  if (channelType === "youtube") {
    if (base.description.length > 5000) {
      base.description = base.description.slice(0, 4997) + "...";
    }
    base.tags = base.tags.slice(0, 30);
  }

  return base;
}

/**
 * Adapt a video for a specific distribution channel.
 *
 * 1. Looks up the channel and resolves its format spec
 * 2. Builds a 5CentsCDN transcoding profile
 * 3. Creates or reuses a profile and submits a transcode job
 * 4. Generates platform-specific metadata
 */
export async function adaptVideoForChannel(
  client: FiveCentsCdnClient,
  req: AdaptRequest
): Promise<AdaptResult> {
  const channel = getChannel(req.channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${req.channelId}`);
  }

  if (channel.status !== "active") {
    throw new Error(`Channel ${req.channelId} is not active (status: ${channel.status})`);
  }

  const channelType = channel.type as ChannelType;
  const formatSpec = resolveFormatSpec(channel);
  const profileParams = buildProfileParams(channelType, formatSpec);
  const platformMetadata = buildPlatformMetadata(req.videoId, channelType);

  // Find or create a matching transcoding profile
  let profileId: number | null = null;
  const existingProfiles = await client.listProfiles();
  for (const [, profile] of Object.entries(existingProfiles)) {
    if (profile.name === profileParams.name) {
      profileId = profile.id;
      break;
    }
  }

  if (profileId === null) {
    const created = await client.createProfile(profileParams);
    profileId = created.profileid;
  }

  // Submit transcoding job
  const jobResponse = await submitTranscodeJob(client, {
    zoneId: req.zoneId,
    profileId,
    filePath: req.videoId, // file path in the CDN zone
  });

  // Wait for transcode to complete
  const transcodeResult = await waitForTranscode(client, jobResponse.jobid, {
    timeoutMs: 300_000, // 5 min timeout for adaptation
  });

  return {
    videoId: req.videoId,
    channelId: req.channelId,
    channelType,
    formatSpec,
    profileParams,
    transcode: transcodeResult,
    platformMetadata,
  };
}

/**
 * Preview what format adaptation would produce for a channel,
 * without actually triggering transcoding.
 */
export function previewAdaptation(
  videoId: string,
  channelId: string
): { channelType: ChannelType; formatSpec: FormatSpec; profileParams: CreateProfileParams; platformMetadata: PlatformMetadata } {
  const channel = getChannel(channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const channelType = channel.type as ChannelType;
  const formatSpec = resolveFormatSpec(channel);
  const profileParams = buildProfileParams(channelType, formatSpec);
  const platformMetadata = buildPlatformMetadata(videoId, channelType);

  return { channelType, formatSpec, profileParams, platformMetadata };
}
