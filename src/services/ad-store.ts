import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import type { AdPodConfig, CreateAdPod, UpdateAdPod } from "../schemas/ads.js";
import { CreateAdPodSchema, UpdateAdPodSchema } from "../schemas/ads.js";

const DB_PATH = process.env.ADS_DB_PATH ?? path.join(process.cwd(), "data", "ads.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS ad_pods (
        ad_pod_id  TEXT PRIMARY KEY,
        video_id   TEXT,
        channel_id TEXT,
        data       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ad_pods_video ON ad_pods(video_id)
    `);
    _db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ad_pods_channel ON ad_pods(channel_id)
    `);
  }
  return _db;
}

export function createAdPod(input: CreateAdPod): AdPodConfig {
  const validated = CreateAdPodSchema.parse(input);
  const db = getDb();
  const adPodId = crypto.randomUUID();

  const { videoId, channelId, ...rest } = validated;
  db.prepare(
    "INSERT INTO ad_pods (ad_pod_id, video_id, channel_id, data) VALUES (?, ?, ?, ?)"
  ).run(adPodId, videoId ?? null, channelId ?? null, JSON.stringify(rest));

  return getAdPod(adPodId)!;
}

export function getAdPod(adPodId: string): AdPodConfig | null {
  const db = getDb();
  const row = db
    .prepare("SELECT video_id, channel_id, data, created_at, updated_at FROM ad_pods WHERE ad_pod_id = ?")
    .get(adPodId) as {
      video_id: string | null;
      channel_id: string | null;
      data: string;
      created_at: string;
      updated_at: string;
    } | undefined;

  if (!row) return null;

  const parsed = JSON.parse(row.data);
  return {
    ...parsed,
    adPodId,
    videoId: row.video_id ?? undefined,
    channelId: row.channel_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateAdPod(adPodId: string, patch: UpdateAdPod): AdPodConfig | null {
  const validated = UpdateAdPodSchema.parse(patch);
  const db = getDb();

  const existing = getAdPod(adPodId);
  if (!existing) return null;

  const { adPodId: _id, videoId: _vid, channelId: _cid, createdAt: _ca, updatedAt: _ua, ...existingData } = existing;
  const merged = { ...existingData };
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  db.prepare(
    "UPDATE ad_pods SET data = ?, updated_at = datetime('now') WHERE ad_pod_id = ?"
  ).run(JSON.stringify(merged), adPodId);

  return getAdPod(adPodId)!;
}

export function deleteAdPod(adPodId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM ad_pods WHERE ad_pod_id = ?").run(adPodId);
  return result.changes > 0;
}

export function listAdPods(options?: {
  videoId?: string;
  channelId?: string;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}): { items: AdPodConfig[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM ad_pods";
  let querySql = "SELECT ad_pod_id, video_id, channel_id, data, created_at, updated_at FROM ad_pods";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.videoId) {
    conditions.push("video_id = ?");
    params.push(options.videoId);
  }
  if (options?.channelId) {
    conditions.push("channel_id = ?");
    params.push(options.channelId);
  }
  if (options?.enabled !== undefined) {
    conditions.push("json_extract(data, '$.enabled') = ?");
    params.push(options.enabled ? 1 : 0);
  }

  if (conditions.length > 0) {
    const whereClause = " WHERE " + conditions.join(" AND ");
    countSql += whereClause;
    querySql += whereClause;
  }

  querySql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as Array<{
    ad_pod_id: string;
    video_id: string | null;
    channel_id: string | null;
    data: string;
    created_at: string;
    updated_at: string;
  }>;

  const items = rows.map((row) => {
    const parsed = JSON.parse(row.data);
    return {
      ...parsed,
      adPodId: row.ad_pod_id,
      videoId: row.video_id ?? undefined,
      channelId: row.channel_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return { items, total };
}

export function listAdPodsForVideo(videoId: string): AdPodConfig[] {
  return listAdPods({ videoId, enabled: true }).items;
}

export function listAdPodsForChannel(channelId: string): AdPodConfig[] {
  return listAdPods({ channelId, enabled: true }).items;
}

export function closeAdsDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
