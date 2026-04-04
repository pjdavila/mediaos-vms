import type { ChannelType, DistributionChannel } from "../schemas/channels.js";
import type { PlatformMetadata } from "./format-adapter.js";
import { getChannel } from "./channel-store.js";
import { buildPlatformMetadata } from "./format-adapter.js";
import { emitWebhook } from "./webhook-emitter.js";

export interface PublishRequest {
  videoId: string;
  channelId: string;
  filePath: string;
  metadata?: Partial<PlatformMetadata>;
}

export interface PublishResult {
  videoId: string;
  channelId: string;
  channelType: ChannelType;
  status: "published" | "failed";
  platformId: string | null;
  platformUrl: string | null;
  error: string | null;
  publishedAt: string | null;
}

/**
 * Publish a video to a distribution channel.
 * Dispatches to the appropriate platform publisher based on channel type.
 */
export async function publishToChannel(req: PublishRequest): Promise<PublishResult> {
  const channel = getChannel(req.channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${req.channelId}`);
  }
  if (channel.status !== "active") {
    throw new Error(`Channel ${req.channelId} is not active (status: ${channel.status})`);
  }

  const channelType = channel.type as ChannelType;
  const metadata = {
    ...buildPlatformMetadata(req.videoId, channelType),
    ...req.metadata,
  };

  let result: PublishResult;

  switch (channelType) {
    case "youtube":
      result = await publishToYouTube(channel, req, metadata);
      break;
    case "twitter":
      result = await publishToTwitter(channel, req, metadata);
      break;
    case "custom_webhook":
      result = await publishToWebhook(channel, req, metadata);
      break;
    case "embed":
      result = publishToEmbed(channel, req, metadata);
      break;
    default:
      throw new Error(`Unsupported channel type: ${channelType}`);
  }

  // Emit distribution webhook (fire-and-forget)
  emitWebhook({
    event: result.status === "published" ? "metadata.ready" : "metadata.failed",
    videoId: req.videoId,
    timestamp: new Date().toISOString(),
    metadata: {
      channelId: req.channelId,
      channelType,
      platformId: result.platformId,
      platformUrl: result.platformUrl,
    },
    ...(result.error ? { error: result.error } : {}),
  });

  return result;
}

/**
 * Publish to multiple channels in parallel.
 */
export async function publishToMultipleChannels(
  videoId: string,
  channelIds: string[],
  filePath: string,
  metadata?: Partial<PlatformMetadata>
): Promise<PublishResult[]> {
  const results = await Promise.allSettled(
    channelIds.map((channelId) =>
      publishToChannel({ videoId, channelId, filePath, metadata })
    )
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      videoId,
      channelId: channelIds[i],
      channelType: "custom_webhook" as ChannelType,
      status: "failed" as const,
      platformId: null,
      platformUrl: null,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      publishedAt: null,
    };
  });
}

// --- Platform Publishers ---

async function publishToYouTube(
  channel: DistributionChannel,
  req: PublishRequest,
  metadata: PlatformMetadata
): Promise<PublishResult> {
  const creds = channel.credentials;
  if (!creds || !("accessToken" in creds)) {
    return makeFailure(req, "youtube", "YouTube channel missing OAuth credentials");
  }

  const accessToken = creds.accessToken;

  // Step 1: Initiate resumable upload
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title: metadata.title || `Video ${req.videoId}`,
          description: metadata.description || "",
          tags: metadata.tags,
        },
        status: {
          privacyStatus: "public",
        },
      }),
    }
  );

  if (!initRes.ok) {
    const text = await initRes.text();
    return makeFailure(req, "youtube", `YouTube upload init failed: ${initRes.status} ${text}`);
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    return makeFailure(req, "youtube", "YouTube did not return upload URL");
  }

  // Step 2: Upload the video file
  const fs = await import("node:fs");
  const fileBuffer = fs.readFileSync(req.filePath);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileBuffer.length),
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    return makeFailure(req, "youtube", `YouTube upload failed: ${uploadRes.status} ${text}`);
  }

  const uploadData = (await uploadRes.json()) as { id: string };

  // Step 3: Set thumbnail if available
  if (metadata.thumbnailPath) {
    try {
      const thumbBuffer = fs.readFileSync(metadata.thumbnailPath);
      await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${uploadData.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "image/jpeg",
          },
          body: thumbBuffer,
        }
      );
    } catch {
      // Thumbnail upload is non-critical
      console.warn(`[publisher] Failed to set YouTube thumbnail for ${uploadData.id}`);
    }
  }

  return {
    videoId: req.videoId,
    channelId: req.channelId,
    channelType: "youtube",
    status: "published",
    platformId: uploadData.id,
    platformUrl: `https://www.youtube.com/watch?v=${uploadData.id}`,
    error: null,
    publishedAt: new Date().toISOString(),
  };
}

async function publishToTwitter(
  channel: DistributionChannel,
  req: PublishRequest,
  metadata: PlatformMetadata
): Promise<PublishResult> {
  const creds = channel.credentials;
  if (!creds || !("accessToken" in creds)) {
    return makeFailure(req, "twitter", "Twitter channel missing OAuth credentials");
  }

  const accessToken = creds.accessToken;
  const fs = await import("node:fs");

  // Step 1: Initialize media upload
  const fileBuffer = fs.readFileSync(req.filePath);
  const fileSizeBytes = fileBuffer.length;

  const initRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      command: "INIT",
      total_bytes: String(fileSizeBytes),
      media_type: "video/mp4",
      media_category: "tweet_video",
    }),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    return makeFailure(req, "twitter", `Twitter media init failed: ${initRes.status} ${text}`);
  }

  const initData = (await initRes.json()) as { media_id_string: string };
  const mediaId = initData.media_id_string;

  // Step 2: Upload chunks (5MB each)
  const chunkSize = 5 * 1024 * 1024;
  for (let i = 0; i * chunkSize < fileSizeBytes; i++) {
    const chunk = fileBuffer.subarray(i * chunkSize, (i + 1) * chunkSize);

    const form = new FormData();
    form.append("command", "APPEND");
    form.append("media_id", mediaId);
    form.append("segment_index", String(i));
    form.append("media_data", Buffer.from(chunk).toString("base64"));

    const appendRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    if (!appendRes.ok) {
      return makeFailure(req, "twitter", `Twitter media append failed at chunk ${i}`);
    }
  }

  // Step 3: Finalize upload
  const finalizeRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      command: "FINALIZE",
      media_id: mediaId,
    }),
  });

  if (!finalizeRes.ok) {
    return makeFailure(req, "twitter", "Twitter media finalize failed");
  }

  // Step 4: Create tweet with video
  const hashtags = metadata.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
  const tweetText = [metadata.title, metadata.description, hashtags]
    .filter(Boolean)
    .join("\n")
    .slice(0, 280);

  const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: tweetText,
      media: { media_ids: [mediaId] },
    }),
  });

  if (!tweetRes.ok) {
    const text = await tweetRes.text();
    return makeFailure(req, "twitter", `Twitter tweet creation failed: ${tweetRes.status} ${text}`);
  }

  const tweetData = (await tweetRes.json()) as { data: { id: string } };

  return {
    videoId: req.videoId,
    channelId: req.channelId,
    channelType: "twitter",
    status: "published",
    platformId: tweetData.data.id,
    platformUrl: `https://twitter.com/i/status/${tweetData.data.id}`,
    error: null,
    publishedAt: new Date().toISOString(),
  };
}

async function publishToWebhook(
  channel: DistributionChannel,
  req: PublishRequest,
  metadata: PlatformMetadata
): Promise<PublishResult> {
  const creds = channel.credentials;
  if (!creds || !("url" in creds)) {
    return makeFailure(req, "custom_webhook", "Webhook channel missing URL");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...("headers" in creds && creds.headers ? creds.headers : {}),
  };

  if ("secret" in creds && creds.secret) {
    const crypto = await import("node:crypto");
    const payload = JSON.stringify({
      event: "video.publish",
      videoId: req.videoId,
      channelId: req.channelId,
      filePath: req.filePath,
      metadata,
    });
    const signature = crypto
      .createHmac("sha256", creds.secret)
      .update(payload)
      .digest("hex");
    headers["X-Webhook-Signature"] = signature;
  }

  const res = await fetch(creds.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event: "video.publish",
      videoId: req.videoId,
      channelId: req.channelId,
      filePath: req.filePath,
      metadata,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return makeFailure(req, "custom_webhook", `Webhook delivery failed: ${res.status} ${text}`);
  }

  return {
    videoId: req.videoId,
    channelId: req.channelId,
    channelType: "custom_webhook",
    status: "published",
    platformId: null,
    platformUrl: creds.url,
    error: null,
    publishedAt: new Date().toISOString(),
  };
}

function publishToEmbed(
  channel: DistributionChannel,
  req: PublishRequest,
  _metadata: PlatformMetadata
): PublishResult {
  const baseUrl = process.env.EMBED_BASE_URL ?? "https://embed.mediaos.dev";
  const embedUrl = `${baseUrl}/v/${req.videoId}`;

  return {
    videoId: req.videoId,
    channelId: req.channelId,
    channelType: "embed",
    status: "published",
    platformId: req.videoId,
    platformUrl: embedUrl,
    error: null,
    publishedAt: new Date().toISOString(),
  };
}

function makeFailure(
  req: PublishRequest,
  channelType: ChannelType,
  error: string
): PublishResult {
  return {
    videoId: req.videoId,
    channelId: req.channelId,
    channelType,
    status: "failed",
    platformId: null,
    platformUrl: null,
    error,
    publishedAt: null,
  };
}
