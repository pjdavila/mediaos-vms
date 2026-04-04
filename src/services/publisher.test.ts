import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// Point to temp DBs
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publisher-test-"));
process.env.CHANNELS_DB_PATH = path.join(tmpDir, "test-channels.db");
process.env.METADATA_DB_PATH = path.join(tmpDir, "test-metadata.db");
process.env.EMBED_BASE_URL = "https://embed.test.mediaos.dev";

import {
  createChannel,
  deleteChannel,
  listChannels,
  closeChannelsDb,
} from "./channel-store.js";
import { closeDb as closeMetadataDb } from "./metadata-store.js";
import { publishToChannel, publishToMultipleChannels } from "./publisher.js";

// Create a temp video file for tests
const tmpVideoPath = path.join(tmpDir, "test-video.mp4");
fs.writeFileSync(tmpVideoPath, Buffer.alloc(1024, 0));

afterAll(() => {
  closeChannelsDb();
  closeMetadataDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("publisher", () => {
  beforeEach(() => {
    const all = listChannels({ limit: 1000 });
    for (const item of all.items) {
      deleteChannel(item.channelId);
    }
    vi.restoreAllMocks();
  });

  it("throws for nonexistent channel", async () => {
    await expect(
      publishToChannel({ videoId: "v1", channelId: "nonexistent", filePath: tmpVideoPath })
    ).rejects.toThrow("Channel not found");
  });

  it("throws for inactive channel", async () => {
    const ch = createChannel({ name: "Inactive", type: "embed", status: "inactive" });
    await expect(
      publishToChannel({ videoId: "v1", channelId: ch.channelId, filePath: tmpVideoPath })
    ).rejects.toThrow("not active");
  });

  describe("embed publisher", () => {
    it("returns embed URL without external API calls", async () => {
      const ch = createChannel({ name: "Web Embed", type: "embed" });

      const result = await publishToChannel({
        videoId: "vid-123",
        channelId: ch.channelId,
        filePath: tmpVideoPath,
      });

      expect(result.status).toBe("published");
      expect(result.channelType).toBe("embed");
      expect(result.platformId).toBe("vid-123");
      expect(result.platformUrl).toBe("https://embed.test.mediaos.dev/v/vid-123");
      expect(result.error).toBeNull();
      expect(result.publishedAt).toBeDefined();
    });
  });

  describe("webhook publisher", () => {
    it("publishes to webhook endpoint", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      const ch = createChannel({
        name: "CMS Hook",
        type: "custom_webhook",
        credentials: {
          url: "https://cms.example.com/webhook",
          secret: "test-secret",
        },
      });

      const result = await publishToChannel({
        videoId: "vid-wh",
        channelId: ch.channelId,
        filePath: tmpVideoPath,
      });

      expect(result.status).toBe("published");
      expect(result.channelType).toBe("custom_webhook");
      expect(result.platformUrl).toBe("https://cms.example.com/webhook");

      // Verify fetch was called with the webhook URL
      const webhookCall = fetchSpy.mock.calls.find(
        (c) => c[0] === "https://cms.example.com/webhook"
      );
      expect(webhookCall).toBeDefined();
      const callInit = webhookCall![1] as RequestInit;
      expect(callInit.method).toBe("POST");
      // Should include HMAC signature
      expect((callInit.headers as Record<string, string>)["X-Webhook-Signature"]).toBeDefined();
    });

    it("returns failure when webhook delivery fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Service Unavailable", { status: 503 })
      );

      const ch = createChannel({
        name: "Bad Hook",
        type: "custom_webhook",
        credentials: { url: "https://bad.example.com/webhook" },
      });

      const result = await publishToChannel({
        videoId: "vid-fail",
        channelId: ch.channelId,
        filePath: tmpVideoPath,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("503");
    });

    it("returns failure when webhook channel missing URL", async () => {
      const ch = createChannel({
        name: "No URL Hook",
        type: "custom_webhook",
        credentials: { accessToken: "wrong-type" },
      });

      const result = await publishToChannel({
        videoId: "vid-nourl",
        channelId: ch.channelId,
        filePath: tmpVideoPath,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("missing URL");
    });
  });

  describe("youtube publisher", () => {
    it("returns failure when missing credentials", async () => {
      const ch = createChannel({ name: "YT No Creds", type: "youtube" });
      const result = await publishToChannel({
        videoId: "vid-yt",
        channelId: ch.channelId,
        filePath: tmpVideoPath,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("OAuth credentials");
    });

    it("returns failure when YouTube API rejects upload init", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Unauthorized", { status: 401 })
      );

      const ch = createChannel({
        name: "YT Bad Token",
        type: "youtube",
        credentials: { accessToken: "expired-token" },
      });

      const result = await publishToChannel({
        videoId: "vid-yt-fail",
        channelId: ch.channelId,
        filePath: tmpVideoPath,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("401");
    });
  });

  describe("twitter publisher", () => {
    it("returns failure when missing credentials", async () => {
      const ch = createChannel({ name: "TW No Creds", type: "twitter" });
      const result = await publishToChannel({
        videoId: "vid-tw",
        channelId: ch.channelId,
        filePath: tmpVideoPath,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("OAuth credentials");
    });
  });

  describe("batch publish", () => {
    it("publishes to multiple channels in parallel", async () => {
      const embed1 = createChannel({ name: "Embed 1", type: "embed" });
      const embed2 = createChannel({ name: "Embed 2", type: "embed" });

      const results = await publishToMultipleChannels(
        "vid-batch",
        [embed1.channelId, embed2.channelId],
        tmpVideoPath
      );

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("published");
      expect(results[1].status).toBe("published");
    });

    it("handles mixed success and failure", async () => {
      const embed = createChannel({ name: "Good Embed", type: "embed" });

      const results = await publishToMultipleChannels(
        "vid-mixed",
        [embed.channelId, "nonexistent-channel"],
        tmpVideoPath
      );

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("published");
      expect(results[1].status).toBe("failed");
      expect(results[1].error).toContain("Channel not found");
    });
  });
});
