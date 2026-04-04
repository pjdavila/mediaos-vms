import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vast-test-"));
process.env.ADS_DB_PATH = path.join(tmpDir, "test-vast.db");

import { createAdPod, deleteAdPod, listAdPods, closeAdsDb } from "./ad-store.js";
import { resolveAdBreaks, generateVastResponse, generateVastXml } from "./vast-service.js";

afterAll(() => {
  closeAdsDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("vast-service", () => {
  beforeEach(() => {
    const all = listAdPods({ limit: 1000 });
    for (const item of all.items) {
      deleteAdPod(item.adPodId!);
    }
  });

  it("resolves ad breaks for a video", () => {
    createAdPod({
      videoId: "v1",
      name: "Test pod",
      breaks: [
        { position: "pre-roll", maxDurationSec: 15, maxAds: 1 },
        { position: "mid-roll", offsetSec: 300, maxDurationSec: 30, maxAds: 2 },
      ],
    });

    const breaks = resolveAdBreaks({ videoId: "v1" });
    expect(breaks).toHaveLength(2);
    expect(breaks[0].position).toBe("pre-roll");
    expect(breaks[0].offsetSec).toBe(0);
    expect(breaks[1].position).toBe("mid-roll");
    expect(breaks[1].offsetSec).toBe(300);
  });

  it("filters by position", () => {
    createAdPod({
      videoId: "v2",
      name: "Multi-break",
      breaks: [
        { position: "pre-roll", maxDurationSec: 15, maxAds: 1 },
        { position: "mid-roll", offsetSec: 300, maxDurationSec: 30, maxAds: 2 },
        { position: "post-roll", maxDurationSec: 20, maxAds: 1 },
      ],
    });

    const midRolls = resolveAdBreaks({ videoId: "v2", position: "mid-roll" });
    expect(midRolls).toHaveLength(1);
    expect(midRolls[0].position).toBe("mid-roll");
  });

  it("falls back to channel pods when no video pods", () => {
    createAdPod({
      channelId: "ch1",
      name: "Channel default",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
    });

    const breaks = resolveAdBreaks({ videoId: "v-no-pods", channelId: "ch1" });
    expect(breaks).toHaveLength(1);
  });

  it("returns empty array when no pods match", () => {
    const breaks = resolveAdBreaks({ videoId: "nonexistent" });
    expect(breaks).toHaveLength(0);
  });

  it("generates empty VAST when no breaks", () => {
    const xml = generateVastResponse({ videoId: "nonexistent" }, "https://example.com");
    expect(xml).toContain('<VAST version="4.2"/>');
  });

  it("generates wrapper VAST when tagUrl is set", () => {
    createAdPod({
      videoId: "v-wrapper",
      name: "Wrapper pod",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
      vast: { tagUrl: "https://ads.example.com/tag.xml" },
    });

    const xml = generateVastResponse({ videoId: "v-wrapper" }, "https://example.com");
    expect(xml).toContain("<Wrapper>");
    expect(xml).toContain("https://ads.example.com/tag.xml");
    expect(xml).toContain("<VASTAdTagURI>");
  });

  it("generates inline VAST with tracking events", () => {
    createAdPod({
      videoId: "v-inline",
      name: "Inline pod",
      breaks: [{ position: "pre-roll", maxDurationSec: 30, maxAds: 1 }],
      vast: { skipAfterSec: 5 },
    });

    const xml = generateVastResponse({ videoId: "v-inline" }, "https://example.com");
    expect(xml).toContain("<InLine>");
    expect(xml).toContain("MediaOS Ad Server");
    expect(xml).toContain('skipoffset="00:00:05"');
    expect(xml).toContain("/api/ads/tracking/impression");
    expect(xml).toContain("/api/ads/tracking/start");
    expect(xml).toContain("/api/ads/tracking/complete");
    expect(xml).toContain("00:00:30");
  });

  it("generates inline VAST with click-through", () => {
    createAdPod({
      videoId: "v-click",
      name: "Click pod",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
      vast: { clickThroughUrl: "https://advertiser.example.com/landing" },
    });

    const xml = generateVastResponse({ videoId: "v-click" }, "https://example.com");
    expect(xml).toContain("https://advertiser.example.com/landing");
    expect(xml).toContain("<ClickThrough>");
  });

  it("generates valid VAST 4.2 XML structure", () => {
    createAdPod({
      videoId: "v-valid",
      name: "Valid pod",
      breaks: [{ position: "pre-roll", maxDurationSec: 15, maxAds: 1 }],
    });

    const xml = generateVastResponse({ videoId: "v-valid" }, "https://example.com");
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('VAST version="4.2"');
    expect(xml).toContain("</VAST>");
  });
});
