import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "subs-test-"));
process.env.SUBSCRIPTIONS_DB_PATH = path.join(tmpDir, "test-subs.db");

import {
  createPlan, getPlan, updatePlan, deletePlan, listPlans,
  createSubscription, getSubscription, getActiveSubscription, updateSubscription, deleteSubscription, listSubscriptions,
  createAccessRule, getAccessRule, deleteAccessRule, listAccessRules,
  checkContentAccess,
  closeSubscriptionsDb,
} from "./subscription-store.js";

afterAll(() => {
  closeSubscriptionsDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("subscription-store", () => {
  describe("plans", () => {
    beforeEach(() => {
      for (const s of listSubscriptions()) deleteSubscription(s.subscriptionId!);
      for (const p of listPlans()) deletePlan(p.planId!);
    });

    it("creates and retrieves a plan", () => {
      const plan = createPlan({
        name: "Basic Monthly",
        tier: "basic",
        priceMonthly: 9.99,
        features: ["720p", "1 stream"],
      });

      expect(plan.planId).toBeDefined();
      expect(plan.name).toBe("Basic Monthly");
      expect(plan.tier).toBe("basic");
      expect(plan.priceMonthly).toBe(9.99);
      expect(plan.features).toEqual(["720p", "1 stream"]);
      expect(plan.enabled).toBe(true);

      const fetched = getPlan(plan.planId!);
      expect(fetched).toEqual(plan);
    });

    it("updates a plan", () => {
      const plan = createPlan({ name: "Premium", tier: "premium", priceMonthly: 19.99 });
      const updated = updatePlan(plan.planId!, { priceMonthly: 14.99, features: ["4K", "5 streams"] });

      expect(updated!.priceMonthly).toBe(14.99);
      expect(updated!.features).toEqual(["4K", "5 streams"]);
    });

    it("deletes a plan", () => {
      const plan = createPlan({ name: "Temp", tier: "free", priceMonthly: 0 });
      expect(deletePlan(plan.planId!)).toBe(true);
      expect(getPlan(plan.planId!)).toBeNull();
    });

    it("lists plans filtered by tier", () => {
      createPlan({ name: "Free", tier: "free", priceMonthly: 0 });
      createPlan({ name: "Basic", tier: "basic", priceMonthly: 9.99 });
      createPlan({ name: "Premium", tier: "premium", priceMonthly: 19.99 });

      const basics = listPlans({ tier: "basic" });
      expect(basics).toHaveLength(1);
      expect(basics[0].name).toBe("Basic");
    });
  });

  describe("subscriptions", () => {
    let premiumPlanId: string;
    let basicPlanId: string;

    beforeEach(() => {
      for (const s of listSubscriptions()) deleteSubscription(s.subscriptionId!);
      for (const p of listPlans()) deletePlan(p.planId!);

      premiumPlanId = createPlan({ name: "Premium", tier: "premium", priceMonthly: 19.99 }).planId!;
      basicPlanId = createPlan({ name: "Basic", tier: "basic", priceMonthly: 9.99 }).planId!;
    });

    it("creates a subscription", () => {
      const sub = createSubscription({ userId: "user-1", planId: premiumPlanId });

      expect(sub.subscriptionId).toBeDefined();
      expect(sub.userId).toBe("user-1");
      expect(sub.planId).toBe(premiumPlanId);
      expect(sub.status).toBe("active");
    });

    it("gets active subscription for user", () => {
      createSubscription({ userId: "user-2", planId: basicPlanId });
      const active = getActiveSubscription("user-2");

      expect(active).not.toBeNull();
      expect(active!.planId).toBe(basicPlanId);
    });

    it("updates subscription status", () => {
      const sub = createSubscription({ userId: "user-3", planId: premiumPlanId });
      const updated = updateSubscription(sub.subscriptionId!, { status: "cancelled" });

      expect(updated!.status).toBe("cancelled");
      expect(getActiveSubscription("user-3")).toBeNull();
    });
  });

  describe("access rules + gating", () => {
    let premiumPlanId: string;
    let basicPlanId: string;

    beforeEach(() => {
      for (const r of listAccessRules()) deleteAccessRule(r.ruleId!);
      for (const s of listSubscriptions()) deleteSubscription(s.subscriptionId!);
      for (const p of listPlans()) deletePlan(p.planId!);

      premiumPlanId = createPlan({ name: "Premium", tier: "premium", priceMonthly: 19.99 }).planId!;
      basicPlanId = createPlan({ name: "Basic", tier: "basic", priceMonthly: 9.99 }).planId!;
    });

    it("creates and retrieves an access rule", () => {
      const rule = createAccessRule({ videoId: "vid-1", requiredTier: "premium" });

      expect(rule.ruleId).toBeDefined();
      expect(rule.videoId).toBe("vid-1");
      expect(rule.requiredTier).toBe("premium");
    });

    it("allows free content for unauthenticated users", () => {
      const result = checkContentAccess("vid-no-rules", null);
      expect(result.allowed).toBe(true);
      expect(result.requiredTier).toBeNull();
    });

    it("blocks unauthenticated users from premium content", () => {
      createAccessRule({ videoId: "vid-premium", requiredTier: "premium" });
      const result = checkContentAccess("vid-premium", null);

      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe("premium");
      expect(result.userTier).toBe("free");
    });

    it("allows premium subscriber to access premium content", () => {
      createAccessRule({ videoId: "vid-premium", requiredTier: "premium" });
      createSubscription({ userId: "user-premium", planId: premiumPlanId });

      const result = checkContentAccess("vid-premium", "user-premium");
      expect(result.allowed).toBe(true);
      expect(result.userTier).toBe("premium");
    });

    it("blocks basic subscriber from premium content", () => {
      createAccessRule({ videoId: "vid-premium", requiredTier: "premium" });
      createSubscription({ userId: "user-basic", planId: basicPlanId });

      const result = checkContentAccess("vid-premium", "user-basic");
      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe("premium");
      expect(result.userTier).toBe("basic");
    });

    it("allows basic subscriber to access basic content", () => {
      createAccessRule({ videoId: "vid-basic", requiredTier: "basic" });
      createSubscription({ userId: "user-basic", planId: basicPlanId });

      const result = checkContentAccess("vid-basic", "user-basic");
      expect(result.allowed).toBe(true);
    });

    it("deletes access rule", () => {
      const rule = createAccessRule({ videoId: "vid-temp", requiredTier: "basic" });
      expect(deleteAccessRule(rule.ruleId!)).toBe(true);
      expect(getAccessRule(rule.ruleId!)).toBeNull();
    });
  });
});
