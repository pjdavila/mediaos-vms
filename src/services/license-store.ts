import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { CreateLicenseSchema, UpdateLicenseSchema, CreateUsageSchema } from "../schemas/licensing.js";
import type { License, CreateLicense, UpdateLicense, LicenseUsage, CreateUsage, LicenseStatus } from "../schemas/licensing.js";

const DB_PATH = process.env.LICENSING_DB_PATH ?? path.join(process.cwd(), "data", "licensing.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS licenses (
        license_id  TEXT PRIMARY KEY,
        video_id    TEXT NOT NULL,
        licensee_id TEXT NOT NULL,
        licensor_id TEXT NOT NULL,
        type        TEXT NOT NULL DEFAULT 'standard' CHECK(type IN ('standard','exclusive','editorial','creative_commons')),
        status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked','expired')),
        territory   TEXT NOT NULL DEFAULT 'worldwide',
        max_usages  INTEGER,
        expires_at  TEXT,
        watermark   INTEGER NOT NULL DEFAULT 1,
        notes       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec("CREATE INDEX IF NOT EXISTS idx_lic_video ON licenses(video_id)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_lic_licensee ON licenses(licensee_id)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_lic_licensor ON licenses(licensor_id)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_lic_status ON licenses(status)");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS license_usages (
        usage_id   TEXT PRIMARY KEY,
        license_id TEXT NOT NULL REFERENCES licenses(license_id),
        action     TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        metadata   TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec("CREATE INDEX IF NOT EXISTS idx_usage_license ON license_usages(license_id)");
  }
  return _db;
}

// ── Licenses ──

export function createLicense(input: CreateLicense): License {
  const validated = CreateLicenseSchema.parse(input);
  const db = getDb();
  const licenseId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO licenses (license_id, video_id, licensee_id, licensor_id, type, territory, max_usages, expires_at, watermark, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    licenseId, validated.videoId, validated.licenseeId, validated.licensorId,
    validated.type, validated.territory,
    validated.maxUsages ?? null, validated.expiresAt ?? null,
    validated.watermark ? 1 : 0, validated.notes ?? null
  );

  return getLicense(licenseId)!;
}

export function getLicense(licenseId: string): License | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM licenses WHERE license_id = ?").get(licenseId) as any;
  if (!row) return null;
  return mapLicenseRow(row);
}

export function updateLicense(licenseId: string, patch: UpdateLicense): License | null {
  const validated = UpdateLicenseSchema.parse(patch);
  const db = getDb();
  const existing = getLicense(licenseId);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (validated.status !== undefined) { sets.push("status = ?"); params.push(validated.status); }
  if (validated.type !== undefined) { sets.push("type = ?"); params.push(validated.type); }
  if (validated.territory !== undefined) { sets.push("territory = ?"); params.push(validated.territory); }
  if (validated.maxUsages !== undefined) { sets.push("max_usages = ?"); params.push(validated.maxUsages); }
  if (validated.expiresAt !== undefined) { sets.push("expires_at = ?"); params.push(validated.expiresAt); }
  if (validated.watermark !== undefined) { sets.push("watermark = ?"); params.push(validated.watermark ? 1 : 0); }
  if (validated.notes !== undefined) { sets.push("notes = ?"); params.push(validated.notes); }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  params.push(licenseId);
  db.prepare(`UPDATE licenses SET ${sets.join(", ")} WHERE license_id = ?`).run(...params);

  return getLicense(licenseId)!;
}

export function deleteLicense(licenseId: string): boolean {
  const db = getDb();
  db.prepare("DELETE FROM license_usages WHERE license_id = ?").run(licenseId);
  return db.prepare("DELETE FROM licenses WHERE license_id = ?").run(licenseId).changes > 0;
}

export function listLicenses(options?: {
  videoId?: string;
  licenseeId?: string;
  licensorId?: string;
  status?: LicenseStatus;
  limit?: number;
  offset?: number;
}): { items: License[]; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let countSql = "SELECT COUNT(*) as cnt FROM licenses";
  let querySql = "SELECT * FROM licenses";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.videoId) { conditions.push("video_id = ?"); params.push(options.videoId); }
  if (options?.licenseeId) { conditions.push("licensee_id = ?"); params.push(options.licenseeId); }
  if (options?.licensorId) { conditions.push("licensor_id = ?"); params.push(options.licensorId); }
  if (options?.status) { conditions.push("status = ?"); params.push(options.status); }

  if (conditions.length > 0) {
    const where = " WHERE " + conditions.join(" AND ");
    countSql += where;
    querySql += where;
  }

  querySql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";

  const { cnt: total } = db.prepare(countSql).get(...params) as { cnt: number };
  const rows = db.prepare(querySql).all(...params, limit, offset) as any[];

  return { items: rows.map(mapLicenseRow), total };
}

function mapLicenseRow(row: any): License {
  return {
    licenseId: row.license_id,
    videoId: row.video_id,
    licenseeId: row.licensee_id,
    licensorId: row.licensor_id,
    type: row.type,
    status: row.status,
    territory: row.territory,
    maxUsages: row.max_usages ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    watermark: !!row.watermark,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Usage tracking ──

export function recordUsage(input: CreateUsage): LicenseUsage {
  const validated = CreateUsageSchema.parse(input);
  const db = getDb();
  const usageId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO license_usages (usage_id, license_id, action, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    usageId, validated.licenseId, validated.action,
    validated.ipAddress ?? null, validated.userAgent ?? null,
    validated.metadata ? JSON.stringify(validated.metadata) : null
  );

  return getUsage(usageId)!;
}

export function getUsage(usageId: string): LicenseUsage | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM license_usages WHERE usage_id = ?").get(usageId) as any;
  if (!row) return null;
  return mapUsageRow(row);
}

export function listUsages(licenseId: string): LicenseUsage[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM license_usages WHERE license_id = ? ORDER BY created_at DESC"
  ).all(licenseId) as any[];
  return rows.map(mapUsageRow);
}

export function getUsageCount(licenseId: string): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as cnt FROM license_usages WHERE license_id = ?").get(licenseId) as { cnt: number };
  return row.cnt;
}

function mapUsageRow(row: any): LicenseUsage {
  return {
    usageId: row.usage_id,
    licenseId: row.license_id,
    action: row.action,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
  };
}

// ── License validation ──

export function validateLicenseAccess(licenseId: string): { valid: boolean; reason?: string } {
  const license = getLicense(licenseId);
  if (!license) return { valid: false, reason: "License not found" };
  if (license.status !== "approved") return { valid: false, reason: `License status is ${license.status}` };

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    updateLicense(licenseId, { status: "expired" });
    return { valid: false, reason: "License has expired" };
  }

  if (license.maxUsages) {
    const count = getUsageCount(licenseId);
    if (count >= license.maxUsages) return { valid: false, reason: "Usage limit exceeded" };
  }

  return { valid: true };
}

export function closeLicensingDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
