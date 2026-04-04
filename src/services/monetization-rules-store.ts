import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { CreateRuleSchema, UpdateRuleSchema } from "../schemas/monetization-rules.js";
import type { MonetizationRule, CreateRule, UpdateRule, RuleMatchResult } from "../schemas/monetization-rules.js";

const DB_PATH = process.env.MONETIZATION_RULES_DB_PATH ?? path.join(process.cwd(), "data", "monetization-rules.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS monetization_rules (
        rule_id       TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        enabled       INTEGER NOT NULL DEFAULT 1,
        priority      INTEGER NOT NULL DEFAULT 0,
        match_tags    TEXT NOT NULL,
        match_all     INTEGER NOT NULL DEFAULT 0,
        action        TEXT NOT NULL CHECK(action IN ('apply_ad_pod','set_access_tier','set_license_type')),
        action_config TEXT NOT NULL DEFAULT '{}',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return _db;
}

// ── CRUD ──

export function createRule(input: CreateRule): MonetizationRule {
  const validated = CreateRuleSchema.parse(input);
  const db = getDb();
  const ruleId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO monetization_rules (rule_id, name, enabled, priority, match_tags, match_all, action, action_config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ruleId, validated.name, validated.enabled ? 1 : 0, validated.priority,
    JSON.stringify(validated.matchTags), validated.matchAll ? 1 : 0,
    validated.action, JSON.stringify(validated.actionConfig)
  );

  return getRule(ruleId)!;
}

export function getRule(ruleId: string): MonetizationRule | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM monetization_rules WHERE rule_id = ?").get(ruleId) as any;
  if (!row) return null;
  return mapRuleRow(row);
}

export function updateRule(ruleId: string, patch: UpdateRule): MonetizationRule | null {
  const validated = UpdateRuleSchema.parse(patch);
  const db = getDb();
  const existing = getRule(ruleId);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (validated.name !== undefined) { sets.push("name = ?"); params.push(validated.name); }
  if (validated.enabled !== undefined) { sets.push("enabled = ?"); params.push(validated.enabled ? 1 : 0); }
  if (validated.priority !== undefined) { sets.push("priority = ?"); params.push(validated.priority); }
  if (validated.matchTags !== undefined) { sets.push("match_tags = ?"); params.push(JSON.stringify(validated.matchTags)); }
  if (validated.matchAll !== undefined) { sets.push("match_all = ?"); params.push(validated.matchAll ? 1 : 0); }
  if (validated.action !== undefined) { sets.push("action = ?"); params.push(validated.action); }
  if (validated.actionConfig !== undefined) { sets.push("action_config = ?"); params.push(JSON.stringify(validated.actionConfig)); }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  params.push(ruleId);
  db.prepare(`UPDATE monetization_rules SET ${sets.join(", ")} WHERE rule_id = ?`).run(...params);

  return getRule(ruleId)!;
}

export function deleteRule(ruleId: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM monetization_rules WHERE rule_id = ?").run(ruleId).changes > 0;
}

export function listRules(options?: { enabled?: boolean }): MonetizationRule[] {
  const db = getDb();
  let sql = "SELECT * FROM monetization_rules";
  const params: unknown[] = [];

  if (options?.enabled !== undefined) {
    sql += " WHERE enabled = ?";
    params.push(options.enabled ? 1 : 0);
  }

  sql += " ORDER BY priority DESC, created_at ASC";

  return (db.prepare(sql).all(...params) as any[]).map(mapRuleRow);
}

function mapRuleRow(row: any): MonetizationRule {
  return {
    ruleId: row.rule_id,
    name: row.name,
    enabled: !!row.enabled,
    priority: row.priority,
    matchTags: JSON.parse(row.match_tags),
    matchAll: !!row.match_all,
    action: row.action,
    actionConfig: JSON.parse(row.action_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Rule Matching Engine ──

export function matchRules(contentTags: string[]): RuleMatchResult[] {
  const rules = listRules({ enabled: true });
  const tagSet = new Set(contentTags.map((t) => t.toLowerCase()));
  const results: RuleMatchResult[] = [];

  for (const rule of rules) {
    const ruleTags = rule.matchTags.map((t) => t.toLowerCase());
    const matched = ruleTags.filter((t) => tagSet.has(t));

    const isMatch = rule.matchAll
      ? matched.length === ruleTags.length
      : matched.length > 0;

    if (isMatch) {
      results.push({
        ruleId: rule.ruleId!,
        ruleName: rule.name,
        action: rule.action,
        actionConfig: rule.actionConfig,
        matchedTags: matched,
      });
    }
  }

  return results;
}

export function closeMonetizationRulesDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
