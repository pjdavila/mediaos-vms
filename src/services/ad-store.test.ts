import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-test-"));
process.env.ADS_DB_PATH = path.join(tmpDir, "test-ads.db");

import {
  createAdPod,
  getAdPod,
  updateAdPod,
  deleteAdPod,
  listAdPods,
  listAdPodsForVideo,
  listAdPodsForChannel,
  closeAdsDb,
} from "./ad-store.js";

afterAll(() => {
  closeAdsDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ad-store", () => {
  beforeEach(() => {
    const all = listAdPods({ limit: 1000 });
    for (const item of all.items) {
      deleteAdPod(item.adPodId!);
    }
  });

  it("creates an ad pod for a video", () => {
    const pod = createAdPod({
      videoId: "video-1",
      name: "Pre-roll test",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
    });

    expect(pod.adPodId).toBeDefined();
    expect(pod.videoId).toBe("video-1");
    expect(pod.name).toBe("Pre-roll test");
    expect(pod.enabled).toBe(true);
    expect(pod.breaks).toHaveLength(1);
    expect(pod.breaks[0].position).toBe("pre-roll");
    expect(pod.createdAt).toBeDefined();
  });

  it("creates an ad pod for a channel", () => {
    const pod = createAdPod({
      channelId: "channel-1",
      name: "Channel ads",
      breaks: [
        { position: "pre-roll", maxDurationSec: 30, maxAds: 2 },
        { position: "mid-roll", offsetSec: 300, maxDurationSec: 60, maxAds: 3 },
      ],
    });

    expect(pod.channelId).toBe("channel-1");
    expect(pod.breaks).toHaveLength(2);
  });

  it("rejects ad pod without videoId or channelId", () => {
    expect(() =>
      createAdPod({
        name: "Orphan",
        breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
      })
    ).toThrow();
  });

  it("retrieves a created ad pod", () => {
    const created = createAdPod({
      videoId: "video-2",
      name: "Test pod",
      breaks: [{ position: "post-roll", maxDurationSec: 20, maxAds: 1 }],
    });
    const fetched = getAdPod(created.adPodId!);

    expect(fetched).not.toBeNull();
    expect(fetched!.adPodId).toBe(created.adPodId);
    expect(fetched!.name).toBe("Test pod");
  });

  it("returns null for unknown adPodId", () => {
    expect(getAdPod("nonexistent")).toBeNull();
  });

  it("updates an ad pod name", () => {
    const created = createAdPod({
      videoId: "video-3",
      name: "Old Name",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
    });
    const updated = updateAdPod(created.adPodId!, { name: "New Name" });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New Name");
    expect(updated!.breaks).toHaveLength(1);
  });

  it("updates ad pod breaks", () => {
    const created = createAdPod({
      videoId: "video-4",
      name: "Update breaks",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
    });
    const updated = updateAdPod(created.adPodId!, {
      breaks: [
        { position: "pre-roll", maxDurationSec: 30, maxAds: 2 },
        { position: "mid-roll", offsetSec: 600, maxDurationSec: 60, maxAds: 3 },
      ],
    });

    expect(updated!.breaks).toHaveLength(2);
    expect(updated!.breaks[1].offsetSec).toBe(600);
  });

  it("disables an ad pod", () => {
    const created = createAdPod({
      videoId: "video-5",
      name: "Disable me",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
    });
    const updated = updateAdPod(created.adPodId!, { enabled: false });

    expect(updated!.enabled).toBe(false);
  });

  it("returns null when updating nonexistent", () => {
    expect(updateAdPod("nonexistent", { name: "X" })).toBeNull();
  });

  it("deletes an ad pod", () => {
    const created = createAdPod({
      videoId: "video-6",
      name: "Doomed",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
    });
    expect(deleteAdPod(created.adPodId!)).toBe(true);
    expect(getAdPod(created.adPodId!)).toBeNull();
  });

  it("returns false when deleting nonexistent", () => {
    expect(deleteAdPod("nonexistent")).toBe(false);
  });

  it("lists ad pods with pagination", () => {
    for (let i = 0; i < 5; i++) {
      createAdPod({
        videoId: "video-page",
        name: `Pod-${i}`,
        breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
      });
    }

    const page1 = listAdPods({ limit: 3, offset: 0 });
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(5);

    const page2 = listAdPods({ limit: 3, offset: 3 });
    expect(page2.items).toHaveLength(2);
  });

  it("filters by videoId", () => {
    createAdPod({ videoId: "v-a", name: "A", breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }] });
    createAdPod({ videoId: "v-b", name: "B", breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }] });

    const result = listAdPods({ videoId: "v-a" });
    expect(result.total).toBe(1);
    expect(result.items[0].videoId).toBe("v-a");
  });

  it("filters by channelId", () => {
    createAdPod({ channelId: "ch-x", name: "X", breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }] });
    createAdPod({ videoId: "v-y", name: "Y", breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }] });

    const result = listAdPods({ channelId: "ch-x" });
    expect(result.total).toBe(1);
  });

  it("filters by enabled", () => {
    const pod = createAdPod({ videoId: "v-e", name: "Enabled", breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }] });
    createAdPod({ videoId: "v-e", name: "Also enabled", breaks: [{ position: "mid-roll", offsetSec: 300, maxDurationSec: 30, maxAds: 2 }] });
    updateAdPod(pod.adPodId!, { enabled: false });

    const enabled = listAdPods({ videoId: "v-e", enabled: true });
    expect(enabled.total).toBe(1);
    expect(enabled.items[0].name).toBe("Also enabled");
  });

  it("listAdPodsForVideo returns only enabled pods", () => {
    const pod = createAdPod({ videoId: "v-lv", name: "Active", breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }] });
    createAdPod({ videoId: "v-lv", name: "Also active", breaks: [{ position: "post-roll", maxDurationSec: 20, maxAds: 1 }] });
    updateAdPod(pod.adPodId!, { enabled: false });

    const pods = listAdPodsForVideo("v-lv");
    expect(pods).toHaveLength(1);
    expect(pods[0].name).toBe("Also active");
  });

  it("listAdPodsForChannel returns only enabled pods", () => {
    createAdPod({ channelId: "ch-lc", name: "Active", breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }] });
    const pods = listAdPodsForChannel("ch-lc");
    expect(pods).toHaveLength(1);
  });

  it("stores VAST config", () => {
    const pod = createAdPod({
      videoId: "v-vast",
      name: "VAST pod",
      breaks: [{ position: "pre-roll", maxDurationSec: 30, maxAds: 2 }],
      vast: {
        tagUrl: "https://ads.example.com/vast.xml",
        provider: "vast",
        vastVersion: "4.2",
        skipAfterSec: 5,
      },
    });

    expect(pod.vast.tagUrl).toBe("https://ads.example.com/vast.xml");
    expect(pod.vast.skipAfterSec).toBe(5);
  });

  it("stores SSAI config", () => {
    const pod = createAdPod({
      videoId: "v-ssai",
      name: "SSAI pod",
      breaks: [{ position: "mid-roll", offsetSec: 600, maxDurationSec: 60, maxAds: 3 }],
      ssai: {
        mode: "5centscdn",
        stitchingEndpoint: "https://ssai.5centscdn.com/stitch",
      },
    });

    expect(pod.ssai.mode).toBe("5centscdn");
    expect(pod.ssai.stitchingEndpoint).toBe("https://ssai.5centscdn.com/stitch");
  });
});
