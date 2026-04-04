import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// Point to temp DBs before importing stores
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "format-adapter-test-"));
process.env.CHANNELS_DB_PATH = path.join(tmpDir, "test-channels.db");
process.env.METADATA_DB_PATH = path.join(tmpDir, "test-metadata.db");

import {
  createChannel,
  deleteChannel,
  listChannels,
  closeChannelsDb,
} from "./channel-store.js";
import { upsertMetadata, closeDb as closeMetadataDb } from "./metadata-store.js";
import {
  CHANNEL_FORMAT_DEFAULTS,
  resolveFormatSpec,
  buildProfileParams,
  buildPlatformMetadata,
  previewAdaptation,
} from "./format-adapter.js";

afterAll(() => {
  closeChannelsDb();
  closeMetadataDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("format-adapter", () => {
  beforeEach(() => {
    const all = listChannels({ limit: 1000 });
    for (const item of all.items) {
      deleteChannel(item.channelId);
    }
  });

  describe("CHANNEL_FORMAT_DEFAULTS", () => {
    it("has defaults for all channel types", () => {
      expect(CHANNEL_FORMAT_DEFAULTS.youtube).toBeDefined();
      expect(CHANNEL_FORMAT_DEFAULTS.twitter).toBeDefined();
      expect(CHANNEL_FORMAT_DEFAULTS.custom_webhook).toBeDefined();
      expect(CHANNEL_FORMAT_DEFAULTS.embed).toBeDefined();
    });

    it("twitter has 140s max duration", () => {
      expect(CHANNEL_FORMAT_DEFAULTS.twitter.maxDurationSec).toBe(140);
    });

    it("youtube allows up to 12h", () => {
      expect(CHANNEL_FORMAT_DEFAULTS.youtube.maxDurationSec).toBe(43_200);
    });
  });

  describe("resolveFormatSpec", () => {
    it("returns defaults when channel has no formatSpec", () => {
      const channel = createChannel({ name: "YT", type: "youtube", credentials: { accessToken: "t" } });
      const spec = resolveFormatSpec(channel);

      expect(spec).toEqual(CHANNEL_FORMAT_DEFAULTS.youtube);
    });

    it("merges channel formatSpec over defaults", () => {
      const channel = createChannel({
        name: "Custom YT",
        type: "youtube",
        credentials: { accessToken: "t" },
        formatSpec: { maxResolution: "3840x2160", maxBitrate: 20_000 },
      });
      const spec = resolveFormatSpec(channel);

      expect(spec.maxResolution).toBe("3840x2160");
      expect(spec.maxBitrate).toBe(20_000);
      // Defaults preserved for unset fields
      expect(spec.aspectRatio).toBe("16:9");
      expect(spec.maxDurationSec).toBe(43_200);
      expect(spec.containerFormat).toBe("mp4");
    });

    it("uses full channel override when all fields set", () => {
      const channel = createChannel({
        name: "Full Override",
        type: "embed",
        formatSpec: {
          maxResolution: "640x360",
          maxBitrate: 1000,
          aspectRatio: "4:3",
          maxDurationSec: 600,
          containerFormat: "webm",
        },
      });
      const spec = resolveFormatSpec(channel);

      expect(spec.maxResolution).toBe("640x360");
      expect(spec.maxBitrate).toBe(1000);
      expect(spec.aspectRatio).toBe("4:3");
      expect(spec.maxDurationSec).toBe(600);
      expect(spec.containerFormat).toBe("webm");
    });
  });

  describe("buildProfileParams", () => {
    it("builds youtube profile with correct params", () => {
      const spec = CHANNEL_FORMAT_DEFAULTS.youtube;
      const params = buildProfileParams("youtube", spec);

      expect(params.name).toBe("mediaos-youtube-1920p");
      expect(params.format).toBe("mp4");
      expect(params.cv).toBe("libx264");
      expect(params.ca).toBe("aac");
      expect(params.bvvalue).toBe("8000k");
      expect(params.crf).toBe(23);
      expect(params.preset).toBe("medium");
      expect(params.outputdir).toBe("adapted/youtube");
    });

    it("builds twitter profile with fast preset and higher CRF", () => {
      const spec = CHANNEL_FORMAT_DEFAULTS.twitter;
      const params = buildProfileParams("twitter", spec);

      expect(params.name).toBe("mediaos-twitter-1280p");
      expect(params.preset).toBe("fast");
      expect(params.crf).toBe(28);
      expect(params.bvvalue).toBe("5000k");
    });

    it("builds embed profile with fast preset", () => {
      const spec = CHANNEL_FORMAT_DEFAULTS.embed;
      const params = buildProfileParams("embed", spec);

      expect(params.preset).toBe("fast");
      expect(params.crf).toBe(23);
    });
  });

  describe("buildPlatformMetadata", () => {
    it("returns empty metadata when no video metadata exists", () => {
      const meta = buildPlatformMetadata("nonexistent-video", "youtube");

      expect(meta.title).toBe("");
      expect(meta.description).toBe("");
      expect(meta.tags).toEqual([]);
      expect(meta.thumbnailPath).toBeNull();
    });

    it("pulls metadata from store", () => {
      upsertMetadata("vid-1", {
        tags: [
          { label: "tag1", source: "ai" },
          { label: "tag2", source: "manual" },
        ],
        thumbnails: [
          { url: "https://cdn.example.com/thumbs/vid-1.jpg", selected: true },
        ],
      });

      const meta = buildPlatformMetadata("vid-1", "youtube");

      expect(meta.tags).toEqual(["tag1", "tag2"]);
      expect(meta.thumbnailPath).toBe("https://cdn.example.com/thumbs/vid-1.jpg");
    });

    it("truncates twitter descriptions and limits tags to 5", () => {
      upsertMetadata("vid-tw", {
        tags: Array.from({ length: 7 }, (_, i) => ({ label: `t${i}`, source: "ai" as const })),
      });

      const meta = buildPlatformMetadata("vid-tw", "twitter");

      expect(meta.tags).toHaveLength(5);
    });

    it("limits youtube tags to 30", () => {
      const manyTags = Array.from({ length: 50 }, (_, i) => ({ label: `tag-${i}`, source: "ai" as const }));
      upsertMetadata("vid-yt-tags", {
        tags: manyTags,
      });

      const meta = buildPlatformMetadata("vid-yt-tags", "youtube");
      expect(meta.tags).toHaveLength(30);
    });
  });

  describe("previewAdaptation", () => {
    it("returns preview without triggering transcoding", () => {
      const channel = createChannel({
        name: "Preview YT",
        type: "youtube",
        credentials: { accessToken: "t" },
      });

      const preview = previewAdaptation("vid-preview", channel.channelId);

      expect(preview.channelType).toBe("youtube");
      expect(preview.formatSpec).toEqual(CHANNEL_FORMAT_DEFAULTS.youtube);
      expect(preview.profileParams.name).toBe("mediaos-youtube-1920p");
      expect(preview.platformMetadata).toBeDefined();
    });

    it("throws for nonexistent channel", () => {
      expect(() => previewAdaptation("vid", "nonexistent")).toThrow("Channel not found");
    });

    it("applies channel-level format overrides in preview", () => {
      const channel = createChannel({
        name: "4K Channel",
        type: "youtube",
        credentials: { accessToken: "t" },
        formatSpec: { maxResolution: "3840x2160", maxBitrate: 20_000 },
      });

      const preview = previewAdaptation("vid", channel.channelId);

      expect(preview.formatSpec.maxResolution).toBe("3840x2160");
      expect(preview.profileParams.name).toBe("mediaos-youtube-3840p");
      expect(preview.profileParams.bvvalue).toBe("20000k");
    });
  });
});
