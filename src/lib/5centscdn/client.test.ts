import { describe, it, expect, vi, beforeEach } from "vitest";
import { FiveCentsCdnClient, FiveCentsCdnError } from "./client.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("FiveCentsCdnClient", () => {
  let client: FiveCentsCdnClient;

  beforeEach(() => {
    client = new FiveCentsCdnClient({
      apiKey: "test-key",
      baseUrl: "https://api.5centscdn.com/v2",
    });
    mockFetch.mockReset();
  });

  it("sends X-API-KEY header on all requests", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", zones: [] }),
    });

    await client.listZones();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.5centscdn.com/v2/zones",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-KEY": "test-key",
        }),
      })
    );
  });

  it("throws FiveCentsCdnError on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => '{"error":"invalid key"}',
    });

    await expect(client.listZones()).rejects.toThrow(FiveCentsCdnError);
    await expect(client.listZones()).rejects.toThrow("401");
  });

  it("creates transcoding job with correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", jobid: 12345 }),
    });

    const result = await client.createJob(100, 200, {
      file: "/raw/test.mp4",
      priority: 50,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.5centscdn.com/v2/transcoding/jobs/100/200",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.jobid).toBe(12345);
  });

  it("creates push stream", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        name: "test-stream",
        hls_url: "https://example.com/stream.m3u8",
      }),
    });

    const result = await client.createPushStream({
      name: "test-stream",
      codec: "h264",
      protocols: ["hls"],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.5centscdn.com/v2/streams/push/new",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.name).toBe("test-stream");
  });

  it("lists transcoding profiles", async () => {
    const profiles = { "1": { id: 1, name: "720p" }, "2": { id: 2, name: "1080p" } };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", profiles }),
    });

    const result = await client.listProfiles();
    expect(result).toEqual(profiles);
  });
});
