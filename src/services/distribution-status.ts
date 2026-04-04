import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { emitWebhook } from "./webhook-emitter.js";

const DB_PATH = process.env.DIST_STATUS_DB_PATH ?? path.join(process.cwd(), "data", "distribution-status.db");

export type DistributionStatus = "queued" | "processing" | "live" | "failed" | "cancelled";

export interface DistributionRecord {
  id: string;
  videoId: string;
  channelId: string;
  channelType: string;
  status: DistributionStatus;
  platformId: string | null;
  platformUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS distribution_status (
        id           TEXT PRIMARY KEY,
        video_id     TEXT NOT NULL,
        channel_id   TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'queued',
        platform_id  TEXT,
        platform_url TEXT,
        error        TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_dist_status_video ON distribution_status(video_id);
      CREATE INDEX IF NOT EXISTS idx_dist_status_channel ON distribution_status(channel_id);
      CREATE INDEX IF NOT EXISTS idx_dist_status_status ON distribution_status(status);
    `);
  }
  return _db;
}

function rowToRecord(row: Record<string, unknown>): DistributionRecord {
  return {
    id: row.id as string,
    videoId: row.video_id as string,
    channelId: row.channel_id as string,
    channelType: row.channel_type as string,
    status: row.status as DistributionStatus,
    platformId: (row.platform_id as string) || null,
    platformUrl: (row.platform_url as string) || null,
    error: (row.error as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createDistributionRecord(
  videoId: string,
  channelId: string,
  channelType: string
): DistributionRecord {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO distribution_status (id, video_id, channel_id, channel_type, status)
     VALUES (?, ?, ?, ?, 'queued')`
  ).run(id, videoId, channelId, channelType);

  return getDistributionRecord(id)!;
}

export function getDistributionRecord(id: string): DistributionRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM distribution_status WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : null;
}

export function updateDistributionStatus(
  id: string,
  status: DistributionStatus,
  details?: { platformId?: string; platformUrl?: string; error?: string }
): DistributionRecord | null {
  const db = getDb();
  const existing = getDistributionRecord(id);
  if (!existing) return null;

  const previousStatus = existing.status;

  db.prepare(
    `UPDATE distribution_status
     SET status = ?, platform_id = COALESCE(?, platform_id), platform_url = COALESCE(?, platform_url),
         error = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    status,
    details?.platformId ?? null,
    details?.platformUrl ?? null,
    details?.error ?? null,
    id
  );

  const updated = getDistributionRecord(id)!;

  // Fire webhook on status transition
  if (previousStatus !== status) {
    emitWebhook({
      event: status === "failed" ? "metadata.failed" : "metadata.ready",
      videoId: updated.videoId,
      timestamp: new Date().toISOString(),
      metadata: {
        distributionId: id,
        channelId: updated.channelId,
        channelType: updated.channelType,
        previousStatus,
        newStatus: status,
        platformId: updated.platformId,
        platformUrl: updated.platformUrl,
      },
      ...(updated.error ? { error: updated.error } : {}),
    });
  }

  return updated;
}

export function getVideoDistributionStatus(videoId: string): DistributionRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM distribution_status WHERE video_id = ? ORDER BY updated_at DESC")
    .all(videoId) as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getChannelDistributionStatus(
  channelId: string,
  options?: { status?: DistributionStatus; limit?: number; offset?: number }
): { items: DistributionRecord[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM distribution_status WHERE channel_id = ?";
  let querySql = "SELECT * FROM distribution_status WHERE channel_id = ?";
  const params: unknown[] = [channelId];

  if (options?.status) {
    countSql += " AND status = ?";
    querySql += " AND status = ?";
    params.push(options.status);
  }

  querySql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as Record<string, unknown>[];

  return { items: rows.map(rowToRecord), total };
}

export function listDistributionStatus(options?: {
  status?: DistributionStatus;
  limit?: number;
  offset?: number;
}): { items: DistributionRecord[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM distribution_status";
  let querySql = "SELECT * FROM distribution_status";
  const params: unknown[] = [];

  if (options?.status) {
    countSql += " WHERE status = ?";
    querySql += " WHERE status = ?";
    params.push(options.status);
  }

  querySql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as Record<string, unknown>[];

  return { items: rows.map(rowToRecord), total };
}

export function closeDistStatusDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
