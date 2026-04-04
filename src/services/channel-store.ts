import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import type { DistributionChannel, CreateChannel, UpdateChannel } from "../schemas/channels.js";
import { CreateChannelSchema, UpdateChannelSchema } from "../schemas/channels.js";

const DB_PATH = process.env.CHANNELS_DB_PATH ?? path.join(process.cwd(), "data", "channels.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS distribution_channels (
        channel_id TEXT PRIMARY KEY,
        data       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return _db;
}

export function createChannel(input: CreateChannel): DistributionChannel {
  const validated = CreateChannelSchema.parse(input);
  const db = getDb();
  const channelId = crypto.randomUUID();

  const { ...dataToStore } = validated;
  db.prepare(
    "INSERT INTO distribution_channels (channel_id, data) VALUES (?, ?)"
  ).run(channelId, JSON.stringify(dataToStore));

  return getChannel(channelId)!;
}

export function getChannel(channelId: string): DistributionChannel | null {
  const db = getDb();
  const row = db
    .prepare("SELECT data, created_at, updated_at FROM distribution_channels WHERE channel_id = ?")
    .get(channelId) as { data: string; created_at: string; updated_at: string } | undefined;

  if (!row) return null;

  const parsed = JSON.parse(row.data);
  return {
    ...parsed,
    channelId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateChannel(channelId: string, patch: UpdateChannel): DistributionChannel | null {
  const validated = UpdateChannelSchema.parse(patch);
  const db = getDb();

  const existing = getChannel(channelId);
  if (!existing) return null;

  const { channelId: _cid, createdAt: _ca, updatedAt: _ua, ...existingData } = existing;
  const merged = { ...existingData };
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  db.prepare(
    "UPDATE distribution_channels SET data = ?, updated_at = datetime('now') WHERE channel_id = ?"
  ).run(JSON.stringify(merged), channelId);

  return getChannel(channelId)!;
}

export function deleteChannel(channelId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM distribution_channels WHERE channel_id = ?").run(channelId);
  return result.changes > 0;
}

export function listChannels(options?: {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): { items: DistributionChannel[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM distribution_channels";
  let querySql = "SELECT channel_id, data, created_at, updated_at FROM distribution_channels";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.type) {
    conditions.push("json_extract(data, '$.type') = ?");
    params.push(options.type);
  }
  if (options?.status) {
    conditions.push("json_extract(data, '$.status') = ?");
    params.push(options.status);
  }

  if (conditions.length > 0) {
    const whereClause = " WHERE " + conditions.join(" AND ");
    countSql += whereClause;
    querySql += whereClause;
  }

  querySql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as Array<{
    channel_id: string;
    data: string;
    created_at: string;
    updated_at: string;
  }>;

  const items = rows.map((row) => {
    const parsed = JSON.parse(row.data);
    return {
      ...parsed,
      channelId: row.channel_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return { items, total };
}

export function closeChannelsDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
