import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import type { VideoMetadata, VideoMetadataPatch } from "../schemas/metadata.js";
import { VideoMetadataSchema, VideoMetadataPatchSchema } from "../schemas/metadata.js";

const DB_PATH = process.env.METADATA_DB_PATH ?? path.join(process.cwd(), "data", "metadata.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS video_metadata (
        video_id TEXT PRIMARY KEY,
        data     TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return _db;
}

export function getMetadata(videoId: string): VideoMetadata | null {
  const db = getDb();
  const row = db
    .prepare("SELECT data, created_at, updated_at FROM video_metadata WHERE video_id = ?")
    .get(videoId) as { data: string; created_at: string; updated_at: string } | undefined;

  if (!row) return null;

  const parsed = JSON.parse(row.data);
  return {
    ...parsed,
    videoId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertMetadata(videoId: string, patch: VideoMetadataPatch): VideoMetadata {
  const validated = VideoMetadataPatchSchema.parse(patch);
  const db = getDb();

  const existing = getMetadata(videoId);

  if (existing) {
    const merged = { ...existing };
    for (const [key, value] of Object.entries(validated)) {
      if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    const { videoId: _vid, createdAt: _ca, updatedAt: _ua, ...dataToStore } = merged;
    db.prepare(
      "UPDATE video_metadata SET data = ?, updated_at = datetime('now') WHERE video_id = ?"
    ).run(JSON.stringify(dataToStore), videoId);

    return getMetadata(videoId)!;
  }

  const full = VideoMetadataSchema.parse({ videoId, ...validated });
  const { videoId: _vid, createdAt: _ca, updatedAt: _ua, ...dataToStore } = full;
  db.prepare(
    "INSERT INTO video_metadata (video_id, data) VALUES (?, ?)"
  ).run(videoId, JSON.stringify(dataToStore));

  return getMetadata(videoId)!;
}

export function deleteMetadata(videoId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM video_metadata WHERE video_id = ?").run(videoId);
  return result.changes > 0;
}

export function listMetadata(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): { items: VideoMetadata[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM video_metadata";
  let querySql = "SELECT video_id, data, created_at, updated_at FROM video_metadata";
  const params: unknown[] = [];

  if (options?.status) {
    const whereClause = " WHERE json_extract(data, '$.status') = ?";
    countSql += whereClause;
    querySql += whereClause;
    params.push(options.status);
  }

  querySql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...(params as [string?])) as { cnt: number };
  const rows = db.prepare(querySql).all(...(params as [string?]), limit, offset) as Array<{
    video_id: string;
    data: string;
    created_at: string;
    updated_at: string;
  }>;

  const items = rows.map((row) => {
    const parsed = JSON.parse(row.data);
    return { ...parsed, videoId: row.video_id, createdAt: row.created_at, updatedAt: row.updated_at };
  });

  return { items, total };
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
