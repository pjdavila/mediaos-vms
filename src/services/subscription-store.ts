import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { CreatePlanSchema, UpdatePlanSchema, CreateSubscriptionSchema, UpdateSubscriptionSchema, CreateAccessRuleSchema } from "../schemas/subscriptions.js";
import type { SubscriptionPlan, CreatePlan, UpdatePlan, Subscription, CreateSubscription, UpdateSubscription, ContentAccessRule, CreateAccessRule, SubscriptionTier } from "../schemas/subscriptions.js";

const DB_PATH = process.env.SUBSCRIPTIONS_DB_PATH ?? path.join(process.cwd(), "data", "subscriptions.db");

let _db: Database.Database | null = null;

const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, basic: 1, premium: 2 };

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        plan_id        TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        tier           TEXT NOT NULL CHECK(tier IN ('free','basic','premium')),
        price_monthly  REAL NOT NULL DEFAULT 0,
        price_yearly   REAL,
        stripe_price_id TEXT,
        features       TEXT NOT NULL DEFAULT '[]',
        max_streams    INTEGER NOT NULL DEFAULT 1,
        enabled        INTEGER NOT NULL DEFAULT 1,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    _db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        subscription_id       TEXT PRIMARY KEY,
        user_id               TEXT NOT NULL,
        plan_id               TEXT NOT NULL REFERENCES plans(plan_id),
        status                TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','expired','past_due')),
        stripe_subscription_id TEXT,
        stripe_customer_id    TEXT,
        current_period_start  TEXT NOT NULL DEFAULT (datetime('now')),
        current_period_end    TEXT,
        created_at            TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec("CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status)");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS access_rules (
        rule_id    TEXT PRIMARY KEY,
        video_id   TEXT,
        channel_id TEXT,
        required_tier TEXT NOT NULL DEFAULT 'premium' CHECK(required_tier IN ('free','basic','premium')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec("CREATE INDEX IF NOT EXISTS idx_access_video ON access_rules(video_id)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_access_channel ON access_rules(channel_id)");
  }
  return _db;
}

// ── Plans ──

export function createPlan(input: CreatePlan): SubscriptionPlan {
  const validated = CreatePlanSchema.parse(input);
  const db = getDb();
  const planId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO plans (plan_id, name, tier, price_monthly, price_yearly, stripe_price_id, features, max_streams, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    planId, validated.name, validated.tier, validated.priceMonthly,
    validated.priceYearly ?? null, validated.stripePriceId ?? null,
    JSON.stringify(validated.features), validated.maxStreams, validated.enabled ? 1 : 0
  );

  return getPlan(planId)!;
}

export function getPlan(planId: string): SubscriptionPlan | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM plans WHERE plan_id = ?").get(planId) as any;
  if (!row) return null;
  return mapPlanRow(row);
}

export function updatePlan(planId: string, patch: UpdatePlan): SubscriptionPlan | null {
  const validated = UpdatePlanSchema.parse(patch);
  const db = getDb();
  const existing = getPlan(planId);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (validated.name !== undefined) { sets.push("name = ?"); params.push(validated.name); }
  if (validated.tier !== undefined) { sets.push("tier = ?"); params.push(validated.tier); }
  if (validated.priceMonthly !== undefined) { sets.push("price_monthly = ?"); params.push(validated.priceMonthly); }
  if (validated.priceYearly !== undefined) { sets.push("price_yearly = ?"); params.push(validated.priceYearly); }
  if (validated.stripePriceId !== undefined) { sets.push("stripe_price_id = ?"); params.push(validated.stripePriceId); }
  if (validated.features !== undefined) { sets.push("features = ?"); params.push(JSON.stringify(validated.features)); }
  if (validated.maxStreams !== undefined) { sets.push("max_streams = ?"); params.push(validated.maxStreams); }
  if (validated.enabled !== undefined) { sets.push("enabled = ?"); params.push(validated.enabled ? 1 : 0); }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  params.push(planId);
  db.prepare(`UPDATE plans SET ${sets.join(", ")} WHERE plan_id = ?`).run(...params);

  return getPlan(planId)!;
}

export function deletePlan(planId: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM plans WHERE plan_id = ?").run(planId).changes > 0;
}

export function listPlans(options?: { tier?: SubscriptionTier; enabled?: boolean }): SubscriptionPlan[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.tier) { conditions.push("tier = ?"); params.push(options.tier); }
  if (options?.enabled !== undefined) { conditions.push("enabled = ?"); params.push(options.enabled ? 1 : 0); }

  let sql = "SELECT * FROM plans";
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY price_monthly ASC";

  return (db.prepare(sql).all(...params) as any[]).map(mapPlanRow);
}

function mapPlanRow(row: any): SubscriptionPlan {
  return {
    planId: row.plan_id,
    name: row.name,
    tier: row.tier,
    priceMonthly: row.price_monthly,
    priceYearly: row.price_yearly ?? undefined,
    stripePriceId: row.stripe_price_id ?? undefined,
    features: JSON.parse(row.features),
    maxStreams: row.max_streams,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Subscriptions ──

export function createSubscription(input: CreateSubscription): Subscription {
  const validated = CreateSubscriptionSchema.parse(input);
  const db = getDb();
  const subscriptionId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO subscriptions (subscription_id, user_id, plan_id, stripe_subscription_id, stripe_customer_id, current_period_end)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    subscriptionId, validated.userId, validated.planId,
    validated.stripeSubscriptionId ?? null,
    validated.stripeCustomerId ?? null,
    validated.currentPeriodEnd ?? null
  );

  return getSubscription(subscriptionId)!;
}

export function getSubscription(subscriptionId: string): Subscription | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM subscriptions WHERE subscription_id = ?").get(subscriptionId) as any;
  if (!row) return null;
  return mapSubRow(row);
}

export function getActiveSubscription(userId: string): Subscription | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).get(userId) as any;
  if (!row) return null;
  return mapSubRow(row);
}

export function updateSubscription(subscriptionId: string, patch: UpdateSubscription): Subscription | null {
  const validated = UpdateSubscriptionSchema.parse(patch);
  const db = getDb();
  const existing = getSubscription(subscriptionId);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (validated.status !== undefined) { sets.push("status = ?"); params.push(validated.status); }
  if (validated.planId !== undefined) { sets.push("plan_id = ?"); params.push(validated.planId); }
  if (validated.stripeSubscriptionId !== undefined) { sets.push("stripe_subscription_id = ?"); params.push(validated.stripeSubscriptionId); }
  if (validated.stripeCustomerId !== undefined) { sets.push("stripe_customer_id = ?"); params.push(validated.stripeCustomerId); }
  if (validated.currentPeriodEnd !== undefined) { sets.push("current_period_end = ?"); params.push(validated.currentPeriodEnd); }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  params.push(subscriptionId);
  db.prepare(`UPDATE subscriptions SET ${sets.join(", ")} WHERE subscription_id = ?`).run(...params);

  return getSubscription(subscriptionId)!;
}

export function listSubscriptions(options?: { userId?: string; status?: string }): Subscription[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.userId) { conditions.push("user_id = ?"); params.push(options.userId); }
  if (options?.status) { conditions.push("status = ?"); params.push(options.status); }

  let sql = "SELECT * FROM subscriptions";
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC";

  return (db.prepare(sql).all(...params) as any[]).map(mapSubRow);
}

export function deleteSubscription(subscriptionId: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM subscriptions WHERE subscription_id = ?").run(subscriptionId).changes > 0;
}

function mapSubRow(row: any): Subscription {
  return {
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
    stripeCustomerId: row.stripe_customer_id ?? undefined,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Access Rules ──

export function createAccessRule(input: CreateAccessRule): ContentAccessRule {
  const validated = CreateAccessRuleSchema.parse(input);
  const db = getDb();
  const ruleId = crypto.randomUUID();

  db.prepare(
    "INSERT INTO access_rules (rule_id, video_id, channel_id, required_tier) VALUES (?, ?, ?, ?)"
  ).run(ruleId, validated.videoId ?? null, validated.channelId ?? null, validated.requiredTier);

  return getAccessRule(ruleId)!;
}

export function getAccessRule(ruleId: string): ContentAccessRule | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM access_rules WHERE rule_id = ?").get(ruleId) as any;
  if (!row) return null;
  return mapRuleRow(row);
}

export function deleteAccessRule(ruleId: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM access_rules WHERE rule_id = ?").run(ruleId).changes > 0;
}

export function listAccessRules(options?: { videoId?: string; channelId?: string }): ContentAccessRule[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.videoId) { conditions.push("video_id = ?"); params.push(options.videoId); }
  if (options?.channelId) { conditions.push("channel_id = ?"); params.push(options.channelId); }

  let sql = "SELECT * FROM access_rules";
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");

  return (db.prepare(sql).all(...params) as any[]).map(mapRuleRow);
}

function mapRuleRow(row: any): ContentAccessRule {
  return {
    ruleId: row.rule_id,
    videoId: row.video_id ?? undefined,
    channelId: row.channel_id ?? undefined,
    requiredTier: row.required_tier,
    createdAt: row.created_at,
  };
}

// ── Access Check (core gating logic) ──

export function checkContentAccess(
  videoId: string,
  userId: string | null,
  channelId?: string
): { allowed: boolean; requiredTier: SubscriptionTier | null; userTier: SubscriptionTier } {
  const db = getDb();

  // Find rules that apply to this content
  const conditions: string[] = [];
  const params: unknown[] = [];
  conditions.push("video_id = ?");
  params.push(videoId);
  if (channelId) {
    conditions.push("channel_id = ?");
    params.push(channelId);
  }

  const rules = db.prepare(
    `SELECT required_tier FROM access_rules WHERE ${conditions.join(" OR ")}`
  ).all(...params) as Array<{ required_tier: SubscriptionTier }>;

  // No rules = free content
  if (rules.length === 0) {
    return { allowed: true, requiredTier: null, userTier: "free" };
  }

  // Find the highest required tier
  const requiredTier = rules.reduce<SubscriptionTier>(
    (max, r) => TIER_RANK[r.required_tier] > TIER_RANK[max] ? r.required_tier : max,
    "free"
  );

  // No user = free tier only
  if (!userId) {
    return { allowed: requiredTier === "free", requiredTier, userTier: "free" };
  }

  // Check user's active subscription
  const sub = getActiveSubscription(userId);
  if (!sub) {
    return { allowed: requiredTier === "free", requiredTier, userTier: "free" };
  }

  const plan = getPlan(sub.planId);
  const userTier: SubscriptionTier = plan?.tier ?? "free";

  return {
    allowed: TIER_RANK[userTier] >= TIER_RANK[requiredTier],
    requiredTier,
    userTier,
  };
}

export function closeSubscriptionsDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
