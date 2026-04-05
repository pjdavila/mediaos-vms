import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { CreateVideoSchema, UpdateVideoSchema } from "../schemas/videos.js";
import type { VideoRecord, CreateVideo, UpdateVideo, VideoStatus } from "../schemas/videos.js";

const DB_PATH = process.env.VIDEOS_DB_PATH ?? path.join(process.cwd(), "data", "videos.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        video_id      TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        description   TEXT,
        filename      TEXT NOT NULL,
        size_bytes    INTEGER NOT NULL DEFAULT 0,
        hls_url       TEXT,
        thumbnail_url TEXT,
        status        TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','processing','ready','failed')),
        duration      REAL,
        resolution    TEXT,
        format        TEXT,
        user_id       TEXT,
        views         INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec("CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id)");
  }
  return _db;
}

export function createVideoRecord(input: CreateVideo): VideoRecord {
  const validated = CreateVideoSchema.parse(input);
  const db = getDb();
  const videoId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO videos (video_id, title, description, filename, size_bytes, hls_url, thumbnail_url, status, duration, resolution, format, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    videoId, validated.title, validated.description ?? null,
    validated.filename, validated.sizeBytes,
    validated.hlsUrl ?? null, validated.thumbnailUrl ?? null,
    validated.status, validated.duration ?? null,
    validated.resolution ?? null, validated.format ?? null,
    validated.userId ?? null
  );

  return getVideoRecord(videoId)!;
}

export function getVideoRecord(videoId: string): VideoRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM videos WHERE video_id = ?").get(videoId) as any;
  if (!row) return null;
  return mapRow(row);
}

export function updateVideoRecord(videoId: string, patch: UpdateVideo): VideoRecord | null {
  const validated = UpdateVideoSchema.parse(patch);
  const db = getDb();
  const existing = getVideoRecord(videoId);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (validated.title !== undefined) { sets.push("title = ?"); params.push(validated.title); }
  if (validated.description !== undefined) { sets.push("description = ?"); params.push(validated.description); }
  if (validated.hlsUrl !== undefined) { sets.push("hls_url = ?"); params.push(validated.hlsUrl); }
  if (validated.thumbnailUrl !== undefined) { sets.push("thumbnail_url = ?"); params.push(validated.thumbnailUrl); }
  if (validated.status !== undefined) { sets.push("status = ?"); params.push(validated.status); }
  if (validated.duration !== undefined) { sets.push("duration = ?"); params.push(validated.duration); }
  if (validated.resolution !== undefined) { sets.push("resolution = ?"); params.push(validated.resolution); }
  if (validated.format !== undefined) { sets.push("format = ?"); params.push(validated.format); }
  if (validated.views !== undefined) { sets.push("views = ?"); params.push(validated.views); }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  params.push(videoId);
  db.prepare(`UPDATE videos SET ${sets.join(", ")} WHERE video_id = ?`).run(...params);

  return getVideoRecord(videoId)!;
}

export function deleteVideoRecord(videoId: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM videos WHERE video_id = ?").run(videoId).changes > 0;
}

export function listVideoRecords(options?: {
  status?: VideoStatus;
  userId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): { items: VideoRecord[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM videos";
  let querySql = "SELECT * FROM videos";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.status) { conditions.push("status = ?"); params.push(options.status); }
  if (options?.userId) { conditions.push("user_id = ?"); params.push(options.userId); }
  if (options?.search) { conditions.push("title LIKE ?"); params.push(`%${options.search}%`); }

  if (conditions.length > 0) {
    const where = " WHERE " + conditions.join(" AND ");
    countSql += where;
    querySql += where;
  }

  querySql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as any[];

  return { items: rows.map(mapRow), total };
}

function mapRow(row: any): VideoRecord {
  return {
    videoId: row.video_id,
    title: row.title,
    description: row.description ?? undefined,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    hlsUrl: row.hls_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    status: row.status,
    duration: row.duration ?? undefined,
    resolution: row.resolution ?? undefined,
    format: row.format ?? undefined,
    userId: row.user_id ?? undefined,
    views: row.views,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function closeVideosDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
