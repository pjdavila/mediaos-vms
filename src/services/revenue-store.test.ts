import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rev-test-"));
process.env.REVENUE_DB_PATH = path.join(tmpDir, "test-revenue.db");

import {
  recordRevenue, getRevenueEvent, deleteRevenueEvent, listRevenueEvents,
  getRevenueSummary, getDailyRevenue, getRevenueByAsset, getRevenueByChannel,
  closeRevenueDb,
} from "./revenue-store.js";

afterAll(() => {
  closeRevenueDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("revenue-store", () => {
  beforeEach(() => {
    const all = listRevenueEvents({ limit: 1000 });
    for (const ev of all.items) deleteRevenueEvent(ev.eventId!);
  });

  describe("event CRUD", () => {
    it("records a revenue event", () => {
      const ev = recordRevenue({
        videoId: "vid-1",
        source: "ad",
        amountCents: 150,
      });

      expect(ev.eventId).toBeDefined();
      expect(ev.videoId).toBe("vid-1");
      expect(ev.source).toBe("ad");
      expect(ev.amountCents).toBe(150);
      expect(ev.currency).toBe("USD");
    });

    it("retrieves an event", () => {
      const ev = recordRevenue({ videoId: "vid-2", source: "subscription", amountCents: 999 });
      const fetched = getRevenueEvent(ev.eventId!);
      expect(fetched).toEqual(ev);
    });

    it("deletes an event", () => {
      const ev = recordRevenue({ videoId: "vid-3", source: "license", amountCents: 5000 });
      expect(deleteRevenueEvent(ev.eventId!)).toBe(true);
      expect(getRevenueEvent(ev.eventId!)).toBeNull();
    });

    it("lists events filtered by source", () => {
      recordRevenue({ videoId: "vid-4", source: "ad", amountCents: 100 });
      recordRevenue({ videoId: "vid-4", source: "subscription", amountCents: 999 });

      const ads = listRevenueEvents({ source: "ad" });
      expect(ads.items).toHaveLength(1);
      expect(ads.items[0].source).toBe("ad");
    });

    it("lists events filtered by videoId", () => {
      recordRevenue({ videoId: "vid-5", source: "ad", amountCents: 100 });
      recordRevenue({ videoId: "vid-6", source: "ad", amountCents: 200 });

      const result = listRevenueEvents({ videoId: "vid-5" });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe("aggregation", () => {
    beforeEach(() => {
      // Seed data across different sources, videos, channels, and dates
      recordRevenue({ videoId: "vid-a", channelId: "ch-1", source: "ad", amountCents: 100, occurredAt: "2026-01-15T10:00:00.000Z" });
      recordRevenue({ videoId: "vid-a", channelId: "ch-1", source: "ad", amountCents: 200, occurredAt: "2026-01-15T14:00:00.000Z" });
      recordRevenue({ videoId: "vid-a", channelId: "ch-1", source: "subscription", amountCents: 999, occurredAt: "2026-01-16T10:00:00.000Z" });
      recordRevenue({ videoId: "vid-b", channelId: "ch-1", source: "license", amountCents: 5000, occurredAt: "2026-01-16T12:00:00.000Z" });
      recordRevenue({ videoId: "vid-c", channelId: "ch-2", source: "ad", amountCents: 50, occurredAt: "2026-01-17T10:00:00.000Z" });
    });

    it("returns overall revenue summary", () => {
      const summary = getRevenueSummary();

      expect(summary.totalCents).toBe(6349);
      expect(summary.adCents).toBe(350);
      expect(summary.subscriptionCents).toBe(999);
      expect(summary.licenseCents).toBe(5000);
      expect(summary.eventCount).toBe(5);
    });

    it("returns revenue summary filtered by videoId", () => {
      const summary = getRevenueSummary({ videoId: "vid-a" });

      expect(summary.totalCents).toBe(1299);
      expect(summary.adCents).toBe(300);
      expect(summary.subscriptionCents).toBe(999);
    });

    it("returns daily revenue breakdown", () => {
      const daily = getDailyRevenue();

      expect(daily).toHaveLength(3);
      expect(daily[0].date).toBe("2026-01-15");
      expect(daily[0].totalCents).toBe(300);
      expect(daily[0].adCents).toBe(300);
      expect(daily[1].date).toBe("2026-01-16");
      expect(daily[1].totalCents).toBe(5999);
      expect(daily[2].date).toBe("2026-01-17");
      expect(daily[2].totalCents).toBe(50);
    });

    it("returns daily revenue filtered by date range", () => {
      const daily = getDailyRevenue({ from: "2026-01-16T00:00:00.000Z", to: "2026-01-16T23:59:59.000Z" });

      expect(daily).toHaveLength(1);
      expect(daily[0].date).toBe("2026-01-16");
    });

    it("returns revenue ranked by asset", () => {
      const assets = getRevenueByAsset();

      expect(assets).toHaveLength(3);
      expect(assets[0].videoId).toBe("vid-b"); // 5000 cents
      expect(assets[0].totalCents).toBe(5000);
      expect(assets[1].videoId).toBe("vid-a"); // 1299 cents
      expect(assets[2].videoId).toBe("vid-c"); // 50 cents
    });

    it("returns revenue ranked by channel", () => {
      const channels = getRevenueByChannel();

      expect(channels).toHaveLength(2);
      expect(channels[0].channelId).toBe("ch-1"); // 6299 cents
      expect(channels[0].totalCents).toBe(6299);
      expect(channels[1].channelId).toBe("ch-2"); // 50 cents
    });
  });
});
