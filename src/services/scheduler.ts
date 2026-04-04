import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { publishToChannel } from "./publisher.js";
import { createDistributionRecord, updateDistributionStatus } from "./distribution-status.js";
import { getChannel } from "./channel-store.js";

const DB_PATH = process.env.SCHEDULER_DB_PATH ?? path.join(process.cwd(), "data", "scheduler.db");

export type ScheduleStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface ScheduledPublish {
  id: string;
  videoId: string;
  channelId: string;
  filePath: string;
  scheduledAt: string;
  timezone: string;
  status: ScheduleStatus;
  distributionId: string | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
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
      CREATE TABLE IF NOT EXISTS scheduled_publishes (
        id              TEXT PRIMARY KEY,
        video_id        TEXT NOT NULL,
        channel_id      TEXT NOT NULL,
        file_path       TEXT NOT NULL,
        scheduled_at    TEXT NOT NULL,
        timezone        TEXT NOT NULL DEFAULT 'UTC',
        status          TEXT NOT NULL DEFAULT 'pending',
        distribution_id TEXT,
        error           TEXT,
        retry_count     INTEGER NOT NULL DEFAULT 0,
        max_retries     INTEGER NOT NULL DEFAULT 3,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sched_status ON scheduled_publishes(status);
      CREATE INDEX IF NOT EXISTS idx_sched_scheduled_at ON scheduled_publishes(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_sched_video ON scheduled_publishes(video_id);
    `);
  }
  return _db;
}

function rowToSchedule(row: Record<string, unknown>): ScheduledPublish {
  return {
    id: row.id as string,
    videoId: row.video_id as string,
    channelId: row.channel_id as string,
    filePath: row.file_path as string,
    scheduledAt: row.scheduled_at as string,
    timezone: row.timezone as string,
    status: row.status as ScheduleStatus,
    distributionId: (row.distribution_id as string) || null,
    error: (row.error as string) || null,
    retryCount: row.retry_count as number,
    maxRetries: row.max_retries as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export interface CreateScheduleInput {
  videoId: string;
  channelId: string;
  filePath: string;
  scheduledAt: string;
  timezone?: string;
  maxRetries?: number;
}

export function createScheduledPublish(input: CreateScheduleInput): ScheduledPublish {
  const db = getDb();
  const id = crypto.randomUUID();
  const timezone = input.timezone ?? "UTC";
  const maxRetries = input.maxRetries ?? 3;

  // Validate scheduledAt is a valid ISO datetime
  const parsed = new Date(input.scheduledAt);
  if (isNaN(parsed.getTime())) {
    throw new Error("scheduledAt must be a valid ISO 8601 datetime");
  }

  // Store as UTC
  const scheduledAtUtc = parsed.toISOString();

  db.prepare(
    `INSERT INTO scheduled_publishes (id, video_id, channel_id, file_path, scheduled_at, timezone, max_retries)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.videoId, input.channelId, input.filePath, scheduledAtUtc, timezone, maxRetries);

  return getScheduledPublish(id)!;
}

export function getScheduledPublish(id: string): ScheduledPublish | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM scheduled_publishes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSchedule(row) : null;
}

export function cancelScheduledPublish(id: string): ScheduledPublish | null {
  const db = getDb();
  const existing = getScheduledPublish(id);
  if (!existing) return null;
  if (existing.status !== "pending") {
    throw new Error(`Cannot cancel schedule in status: ${existing.status}`);
  }

  db.prepare(
    "UPDATE scheduled_publishes SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).run(id);

  return getScheduledPublish(id)!;
}

export function listScheduledPublishes(options?: {
  videoId?: string;
  channelId?: string;
  status?: ScheduleStatus;
  limit?: number;
  offset?: number;
}): { items: ScheduledPublish[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM scheduled_publishes";
  let querySql = "SELECT * FROM scheduled_publishes";
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
  if (options?.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }

  if (conditions.length > 0) {
    const whereClause = " WHERE " + conditions.join(" AND ");
    countSql += whereClause;
    querySql += whereClause;
  }

  querySql += " ORDER BY scheduled_at ASC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as Record<string, unknown>[];

  return { items: rows.map(rowToSchedule), total };
}

/**
 * Get all pending schedules that are due (scheduled_at <= now).
 */
export function getDueSchedules(): ScheduledPublish[] {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db
    .prepare("SELECT * FROM scheduled_publishes WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at ASC")
    .all(now) as Record<string, unknown>[];
  return rows.map(rowToSchedule);
}

/**
 * Process a single scheduled publish.
 * Transitions: pending -> processing -> completed/failed
 */
export async function processScheduledPublish(schedule: ScheduledPublish): Promise<ScheduledPublish> {
  const db = getDb();

  // Mark as processing
  db.prepare(
    "UPDATE scheduled_publishes SET status = 'processing', updated_at = datetime('now') WHERE id = ?"
  ).run(schedule.id);

  const channel = getChannel(schedule.channelId);
  const channelType = channel?.type ?? "unknown";

  // Create distribution record
  const distRecord = createDistributionRecord(schedule.videoId, schedule.channelId, channelType);
  db.prepare(
    "UPDATE scheduled_publishes SET distribution_id = ? WHERE id = ?"
  ).run(distRecord.id, schedule.id);

  updateDistributionStatus(distRecord.id, "processing");

  try {
    const result = await publishToChannel({
      videoId: schedule.videoId,
      channelId: schedule.channelId,
      filePath: schedule.filePath,
    });

    if (result.status === "published") {
      updateDistributionStatus(distRecord.id, "live", {
        platformId: result.platformId ?? undefined,
        platformUrl: result.platformUrl ?? undefined,
      });
      db.prepare(
        "UPDATE scheduled_publishes SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
      ).run(schedule.id);
    } else {
      throw new Error(result.error ?? "Publish returned failed status");
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const newRetryCount = schedule.retryCount + 1;

    if (newRetryCount < schedule.maxRetries) {
      // Allow retry -- return to pending
      db.prepare(
        "UPDATE scheduled_publishes SET status = 'pending', retry_count = ?, error = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetryCount, errorMsg, schedule.id);
      updateDistributionStatus(distRecord.id, "queued", { error: errorMsg });
    } else {
      // Max retries exceeded
      db.prepare(
        "UPDATE scheduled_publishes SET status = 'failed', retry_count = ?, error = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetryCount, errorMsg, schedule.id);
      updateDistributionStatus(distRecord.id, "failed", { error: errorMsg });
    }
  }

  return getScheduledPublish(schedule.id)!;
}

/**
 * Process all due schedules. Called by a polling mechanism.
 */
export async function processDueSchedules(): Promise<ScheduledPublish[]> {
  const due = getDueSchedules();
  const results: ScheduledPublish[] = [];

  for (const schedule of due) {
    const result = await processScheduledPublish(schedule);
    results.push(result);
  }

  return results;
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;

export function startSchedulerPoll(intervalMs: number = 30_000): void {
  if (_pollTimer) return;
  _pollTimer = setInterval(() => {
    processDueSchedules().catch((err) => {
      console.error("[scheduler] Poll error:", err);
    });
  }, intervalMs);
  console.log(`[scheduler] Polling every ${intervalMs}ms`);
}

export function stopSchedulerPoll(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

export function closeSchedulerDb(): void {
  stopSchedulerPoll();
  if (_db) {
    _db.close();
    _db = null;
  }
}
