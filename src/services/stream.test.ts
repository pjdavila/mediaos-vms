import { describe, it, expect, vi, beforeEach } from "vitest";
import { FiveCentsCdnClient } from "../lib/5centscdn/client.js";
import {
  createLiveStream,
  listLiveStreams,
  getLiveStream,
  setStreamEnabled,
  deleteLiveStream,
} from "./stream.js";
import type { PushStream, StreamStatistics } from "../types/5centscdn.js";

function makeMockStream(overrides?: Partial<PushStream>): PushStream {
  return {
    id: 1,
    name: "test-stream",
    server: "us-east",
    codec: "h264",
    protocols: ["hls", "dash"],
    rtmp_url: "rtmp://ingest.5centscdn.com/live/abc123",
    hls_url: "https://hls-live.5centscdn.com/user/abc123.sdp/playlist.m3u8",
    dash_url: "https://dash-live.5centscdn.com/user/abc123.sdp/manifest.mpd",
    disabled: 0,
    platforms: [
      { id: 1, name: "YouTube", rtmp_url: "rtmp://a.rtmp.youtube.com/live2", auth_key: "key123" },
    ],
    ...overrides,
  };
}

describe("stream service", () => {
  let client: FiveCentsCdnClient;

  beforeEach(() => {
    client = new FiveCentsCdnClient({ apiKey: "test-key" });
  });

  it("createLiveStream returns mapped stream info", async () => {
    const raw = makeMockStream();
    vi.spyOn(client, "createPushStream").mockResolvedValue(raw);

    const result = await createLiveStream(client, { name: "test-stream" });

    expect(result.id).toBe(1);
    expect(result.name).toBe("test-stream");
    expect(result.rtmpIngestUrl).toBe(raw.rtmp_url);
    expect(result.hlsPlaybackUrl).toBe(raw.hls_url);
    expect(result.disabled).toBe(false);
    expect(result.platforms).toHaveLength(1);
    expect(result.platforms[0].name).toBe("YouTube");
  });

  it("listLiveStreams maps all streams", async () => {
    const streams = [makeMockStream({ id: 1, name: "s1" }), makeMockStream({ id: 2, name: "s2" })];
    vi.spyOn(client, "listStreams").mockResolvedValue(streams);

    const result = await listLiveStreams(client);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("s1");
    expect(result[1].name).toBe("s2");
  });

  it("getLiveStream without stats", async () => {
    vi.spyOn(client, "getPushStream").mockResolvedValue(makeMockStream());

    const result = await getLiveStream(client, 1, false);

    expect(result.id).toBe(1);
    expect(result.stats).toBeNull();
  });

  it("getLiveStream with stats", async () => {
    const stats: StreamStatistics = {
      transcode_status: "running",
      bitrate: 4500,
      fps: 30,
      cpu_usage: 45,
      memory_usage: 1200,
    };
    vi.spyOn(client, "getPushStream").mockResolvedValue(makeMockStream());
    vi.spyOn(client, "getStreamStatistics").mockResolvedValue(stats);

    const result = await getLiveStream(client, 1, true);

    expect(result.stats).toEqual(stats);
    expect(result.stats!.bitrate).toBe(4500);
  });

  it("getLiveStream handles stats error gracefully", async () => {
    vi.spyOn(client, "getPushStream").mockResolvedValue(makeMockStream());
    vi.spyOn(client, "getStreamStatistics").mockRejectedValue(new Error("stream offline"));

    const result = await getLiveStream(client, 1, true);

    expect(result.stats).toBeNull();
  });

  it("setStreamEnabled calls updatePushStreamStatus correctly", async () => {
    const spy = vi.spyOn(client, "updatePushStreamStatus").mockResolvedValue(makeMockStream({ disabled: 0 }));

    const result = await setStreamEnabled(client, 1, true);

    expect(spy).toHaveBeenCalledWith(1, false); // enabled=true means disabled=false
    expect(result.disabled).toBe(false);
  });

  it("deleteLiveStream calls deletePushStream", async () => {
    const spy = vi.spyOn(client, "deletePushStream").mockResolvedValue({ result: "ok" });

    await deleteLiveStream(client, 1);

    expect(spy).toHaveBeenCalledWith(1);
  });
});
