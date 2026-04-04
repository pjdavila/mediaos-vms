import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// Point to a temp DB before importing the store
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "channels-test-"));
process.env.CHANNELS_DB_PATH = path.join(tmpDir, "test-channels.db");

import {
  createChannel,
  getChannel,
  updateChannel,
  deleteChannel,
  listChannels,
  closeChannelsDb,
} from "./channel-store.js";

afterAll(() => {
  closeChannelsDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("channel-store", () => {
  beforeEach(() => {
    const all = listChannels({ limit: 1000 });
    for (const item of all.items) {
      deleteChannel(item.channelId);
    }
  });

  it("creates a youtube channel", () => {
    const channel = createChannel({
      name: "My YouTube",
      type: "youtube",
      credentials: {
        accessToken: "ya29.test-token",
        refreshToken: "1//test-refresh",
        expiresAt: "2026-12-31T23:59:59Z",
        scope: "https://www.googleapis.com/auth/youtube.upload",
      },
    });

    expect(channel.channelId).toBeDefined();
    expect(channel.name).toBe("My YouTube");
    expect(channel.type).toBe("youtube");
    expect(channel.status).toBe("active");
    expect(channel.credentials).toBeDefined();
    expect(channel.createdAt).toBeDefined();
    expect(channel.updatedAt).toBeDefined();
  });

  it("creates a twitter channel", () => {
    const channel = createChannel({
      name: "Brand Twitter",
      type: "twitter",
      credentials: {
        accessToken: "twitter-bearer-token",
      },
    });

    expect(channel.type).toBe("twitter");
    expect(channel.name).toBe("Brand Twitter");
  });

  it("creates a custom_webhook channel", () => {
    const channel = createChannel({
      name: "CMS Webhook",
      type: "custom_webhook",
      credentials: {
        url: "https://cms.example.com/webhook/publish",
        secret: "whsec_test123",
        headers: { "X-Custom": "value" },
      },
    });

    expect(channel.type).toBe("custom_webhook");
    expect(channel.credentials).toHaveProperty("url");
  });

  it("creates an embed channel with no credentials", () => {
    const channel = createChannel({
      name: "Web Embed",
      type: "embed",
    });

    expect(channel.type).toBe("embed");
    expect(channel.credentials).toBeNull();
  });

  it("retrieves a created channel", () => {
    const created = createChannel({ name: "Test", type: "youtube", credentials: { accessToken: "tok" } });
    const fetched = getChannel(created.channelId);

    expect(fetched).not.toBeNull();
    expect(fetched!.channelId).toBe(created.channelId);
    expect(fetched!.name).toBe("Test");
  });

  it("returns null for unknown channelId", () => {
    expect(getChannel("nonexistent")).toBeNull();
  });

  it("updates a channel name", () => {
    const created = createChannel({ name: "Old Name", type: "embed" });
    const updated = updateChannel(created.channelId, { name: "New Name" });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New Name");
    expect(updated!.type).toBe("embed");
  });

  it("updates channel status", () => {
    const created = createChannel({ name: "Test", type: "youtube", credentials: { accessToken: "tok" } });
    const updated = updateChannel(created.channelId, { status: "inactive" });

    expect(updated!.status).toBe("inactive");
  });

  it("updates channel credentials", () => {
    const created = createChannel({
      name: "YT",
      type: "youtube",
      credentials: { accessToken: "old-token" },
    });
    const updated = updateChannel(created.channelId, {
      credentials: { accessToken: "new-token", refreshToken: "new-refresh" },
    });

    expect(updated!.credentials).toHaveProperty("accessToken", "new-token");
  });

  it("updates format spec", () => {
    const created = createChannel({ name: "Twitter", type: "twitter", credentials: { accessToken: "tok" } });
    const updated = updateChannel(created.channelId, {
      formatSpec: {
        maxResolution: "1080p",
        maxDurationSec: 140,
        aspectRatio: "16:9",
      },
    });

    expect(updated!.formatSpec).toEqual({
      maxResolution: "1080p",
      maxDurationSec: 140,
      aspectRatio: "16:9",
    });
  });

  it("returns null when updating nonexistent channel", () => {
    expect(updateChannel("nonexistent", { name: "X" })).toBeNull();
  });

  it("deletes a channel", () => {
    const created = createChannel({ name: "Doomed", type: "embed" });
    expect(deleteChannel(created.channelId)).toBe(true);
    expect(getChannel(created.channelId)).toBeNull();
  });

  it("returns false when deleting nonexistent", () => {
    expect(deleteChannel("nonexistent")).toBe(false);
  });

  it("lists channels with pagination", () => {
    for (let i = 0; i < 5; i++) {
      createChannel({ name: `Ch-${i}`, type: "embed" });
    }

    const page1 = listChannels({ limit: 3, offset: 0 });
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(5);

    const page2 = listChannels({ limit: 3, offset: 3 });
    expect(page2.items).toHaveLength(2);
    expect(page2.total).toBe(5);
  });

  it("filters by type", () => {
    createChannel({ name: "YT", type: "youtube", credentials: { accessToken: "t" } });
    createChannel({ name: "TW", type: "twitter", credentials: { accessToken: "t" } });
    createChannel({ name: "Embed", type: "embed" });

    const youtube = listChannels({ type: "youtube" });
    expect(youtube.total).toBe(1);
    expect(youtube.items[0].type).toBe("youtube");
  });

  it("filters by status", () => {
    const ch = createChannel({ name: "Active", type: "embed" });
    createChannel({ name: "Also Active", type: "embed" });
    updateChannel(ch.channelId, { status: "inactive" });

    const active = listChannels({ status: "active" });
    expect(active.total).toBe(1);
    expect(active.items[0].name).toBe("Also Active");
  });

  it("validates channel type", () => {
    expect(() =>
      createChannel({ name: "Bad", type: "tiktok" as never })
    ).toThrow();
  });

  it("validates channel status on update", () => {
    const ch = createChannel({ name: "Test", type: "embed" });
    expect(() =>
      updateChannel(ch.channelId, { status: "broken" as never })
    ).toThrow();
  });
});
