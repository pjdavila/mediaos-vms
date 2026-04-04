import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { CreateRevenueEventSchema } from "../schemas/revenue.js";
import type { RevenueEvent, CreateRevenueEvent, RevenueSummary, DailyRevenue, RevenueSource } from "../schemas/revenue.js";

const DB_PATH = process.env.REVENUE_DB_PATH ?? path.join(process.cwd(), "data", "revenue.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS revenue_events (
        event_id     TEXT PRIMARY KEY,
        video_id     TEXT,
        channel_id   TEXT,
        source       TEXT NOT NULL CHECK(source IN ('ad','subscription','license')),
        amount_cents INTEGER NOT NULL,
        currency     TEXT NOT NULL DEFAULT 'USD',
        metadata     TEXT,
        occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec("CREATE INDEX IF NOT EXISTS idx_rev_video ON revenue_events(video_id)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_rev_channel ON revenue_events(channel_id)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_rev_source ON revenue_events(source)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_rev_occurred ON revenue_events(occurred_at)");
  }
  return _db;
}

// ── Events ──

export function recordRevenue(input: CreateRevenueEvent): RevenueEvent {
  const validated = CreateRevenueEventSchema.parse(input);
  const db = getDb();
  const eventId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO revenue_events (event_id, video_id, channel_id, source, amount_cents, currency, metadata, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId, validated.videoId ?? null, validated.channelId ?? null,
    validated.source, validated.amountCents, validated.currency,
    validated.metadata ? JSON.stringify(validated.metadata) : null,
    validated.occurredAt ?? new Date().toISOString()
  );

  return getRevenueEvent(eventId)!;
}

export function getRevenueEvent(eventId: string): RevenueEvent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM revenue_events WHERE event_id = ?").get(eventId) as any;
  if (!row) return null;
  return mapEventRow(row);
}

export function deleteRevenueEvent(eventId: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM revenue_events WHERE event_id = ?").run(eventId).changes > 0;
}

export function listRevenueEvents(options?: {
  videoId?: string;
  channelId?: string;
  source?: RevenueSource;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): { items: RevenueEvent[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM revenue_events";
  let querySql = "SELECT * FROM revenue_events";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.videoId) { conditions.push("video_id = ?"); params.push(options.videoId); }
  if (options?.channelId) { conditions.push("channel_id = ?"); params.push(options.channelId); }
  if (options?.source) { conditions.push("source = ?"); params.push(options.source); }
  if (options?.from) { conditions.push("occurred_at >= ?"); params.push(options.from); }
  if (options?.to) { conditions.push("occurred_at <= ?"); params.push(options.to); }

  if (conditions.length > 0) {
    const where = " WHERE " + conditions.join(" AND ");
    countSql += where;
    querySql += where;
  }

  querySql += " ORDER BY occurred_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as any[];

  return { items: rows.map(mapEventRow), total };
}

function mapEventRow(row: any): RevenueEvent {
  return {
    eventId: row.event_id,
    videoId: row.video_id ?? undefined,
    channelId: row.channel_id ?? undefined,
    source: row.source,
    amountCents: row.amount_cents,
    currency: row.currency,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

// ── Aggregation ──

export function getRevenueSummary(options?: {
  videoId?: string;
  channelId?: string;
  from?: string;
  to?: string;
}): RevenueSummary {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.videoId) { conditions.push("video_id = ?"); params.push(options.videoId); }
  if (options?.channelId) { conditions.push("channel_id = ?"); params.push(options.channelId); }
  if (options?.from) { conditions.push("occurred_at >= ?"); params.push(options.from); }
  if (options?.to) { conditions.push("occurred_at <= ?"); params.push(options.to); }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(amount_cents), 0) as total_cents,
      COALESCE(SUM(CASE WHEN source = 'ad' THEN amount_cents ELSE 0 END), 0) as ad_cents,
      COALESCE(SUM(CASE WHEN source = 'subscription' THEN amount_cents ELSE 0 END), 0) as subscription_cents,
      COALESCE(SUM(CASE WHEN source = 'license' THEN amount_cents ELSE 0 END), 0) as license_cents,
      COUNT(*) as event_count
    FROM revenue_events${where}
  `).get(...params) as any;

  return {
    totalCents: row.total_cents,
    adCents: row.ad_cents,
    subscriptionCents: row.subscription_cents,
    licenseCents: row.license_cents,
    currency: "USD",
    eventCount: row.event_count,
  };
}

export function getDailyRevenue(options?: {
  videoId?: string;
  channelId?: string;
  from?: string;
  to?: string;
}): DailyRevenue[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.videoId) { conditions.push("video_id = ?"); params.push(options.videoId); }
  if (options?.channelId) { conditions.push("channel_id = ?"); params.push(options.channelId); }
  if (options?.from) { conditions.push("occurred_at >= ?"); params.push(options.from); }
  if (options?.to) { conditions.push("occurred_at <= ?"); params.push(options.to); }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

  const rows = db.prepare(`
    SELECT
      date(occurred_at) as date,
      COALESCE(SUM(amount_cents), 0) as total_cents,
      COALESCE(SUM(CASE WHEN source = 'ad' THEN amount_cents ELSE 0 END), 0) as ad_cents,
      COALESCE(SUM(CASE WHEN source = 'subscription' THEN amount_cents ELSE 0 END), 0) as subscription_cents,
      COALESCE(SUM(CASE WHEN source = 'license' THEN amount_cents ELSE 0 END), 0) as license_cents
    FROM revenue_events${where}
    GROUP BY date(occurred_at)
    ORDER BY date ASC
  `).all(...params) as any[];

  return rows.map((r) => ({
    date: r.date,
    totalCents: r.total_cents,
    adCents: r.ad_cents,
    subscriptionCents: r.subscription_cents,
    licenseCents: r.license_cents,
  }));
}

export function getRevenueByAsset(options?: {
  from?: string;
  to?: string;
  limit?: number;
}): Array<{ videoId: string; totalCents: number; adCents: number; subscriptionCents: number; licenseCents: number }> {
  const db = getDb();
  const conditions = ["video_id IS NOT NULL"];
  const params: unknown[] = [];

  if (options?.from) { conditions.push("occurred_at >= ?"); params.push(options.from); }
  if (options?.to) { conditions.push("occurred_at <= ?"); params.push(options.to); }

  const where = " WHERE " + conditions.join(" AND ");
  const limit = options?.limit ?? 50;

  const rows = db.prepare(`
    SELECT
      video_id,
      COALESCE(SUM(amount_cents), 0) as total_cents,
      COALESCE(SUM(CASE WHEN source = 'ad' THEN amount_cents ELSE 0 END), 0) as ad_cents,
      COALESCE(SUM(CASE WHEN source = 'subscription' THEN amount_cents ELSE 0 END), 0) as subscription_cents,
      COALESCE(SUM(CASE WHEN source = 'license' THEN amount_cents ELSE 0 END), 0) as license_cents
    FROM revenue_events${where}
    GROUP BY video_id
    ORDER BY total_cents DESC
    LIMIT ?
  `).all(...params, limit) as any[];

  return rows.map((r) => ({
    videoId: r.video_id,
    totalCents: r.total_cents,
    adCents: r.ad_cents,
    subscriptionCents: r.subscription_cents,
    licenseCents: r.license_cents,
  }));
}

export function getRevenueByChannel(options?: {
  from?: string;
  to?: string;
  limit?: number;
}): Array<{ channelId: string; totalCents: number; adCents: number; subscriptionCents: number; licenseCents: number }> {
  const db = getDb();
  const conditions = ["channel_id IS NOT NULL"];
  const params: unknown[] = [];

  if (options?.from) { conditions.push("occurred_at >= ?"); params.push(options.from); }
  if (options?.to) { conditions.push("occurred_at <= ?"); params.push(options.to); }

  const where = " WHERE " + conditions.join(" AND ");
  const limit = options?.limit ?? 50;

  const rows = db.prepare(`
    SELECT
      channel_id,
      COALESCE(SUM(amount_cents), 0) as total_cents,
      COALESCE(SUM(CASE WHEN source = 'ad' THEN amount_cents ELSE 0 END), 0) as ad_cents,
      COALESCE(SUM(CASE WHEN source = 'subscription' THEN amount_cents ELSE 0 END), 0) as subscription_cents,
      COALESCE(SUM(CASE WHEN source = 'license' THEN amount_cents ELSE 0 END), 0) as license_cents
    FROM revenue_events${where}
    GROUP BY channel_id
    ORDER BY total_cents DESC
    LIMIT ?
  `).all(...params, limit) as any[];

  return rows.map((r) => ({
    channelId: r.channel_id,
    totalCents: r.total_cents,
    adCents: r.ad_cents,
    subscriptionCents: r.subscription_cents,
    licenseCents: r.license_cents,
  }));
}

export function closeRevenueDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
