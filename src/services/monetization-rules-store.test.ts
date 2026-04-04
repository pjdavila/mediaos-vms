import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-test-"));
process.env.MONETIZATION_RULES_DB_PATH = path.join(tmpDir, "test-rules.db");

import {
  createRule, getRule, updateRule, deleteRule, listRules,
  matchRules,
  closeMonetizationRulesDb,
} from "./monetization-rules-store.js";

afterAll(() => {
  closeMonetizationRulesDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("monetization-rules-store", () => {
  beforeEach(() => {
    for (const r of listRules()) deleteRule(r.ruleId!);
  });

  describe("CRUD", () => {
    it("creates a rule", () => {
      const rule = createRule({
        name: "Sports mid-roll",
        matchTags: ["sports", "live"],
        action: "apply_ad_pod",
        actionConfig: { position: "mid-roll", intervalMin: 10 },
        priority: 10,
      });

      expect(rule.ruleId).toBeDefined();
      expect(rule.name).toBe("Sports mid-roll");
      expect(rule.matchTags).toEqual(["sports", "live"]);
      expect(rule.action).toBe("apply_ad_pod");
      expect(rule.actionConfig).toEqual({ position: "mid-roll", intervalMin: 10 });
      expect(rule.enabled).toBe(true);
    });

    it("retrieves a rule", () => {
      const rule = createRule({ name: "Test", matchTags: ["news"], action: "apply_ad_pod" });
      expect(getRule(rule.ruleId!)).toEqual(rule);
    });

    it("updates a rule", () => {
      const rule = createRule({ name: "Old", matchTags: ["news"], action: "apply_ad_pod" });
      const updated = updateRule(rule.ruleId!, { name: "News pre-roll", enabled: false });

      expect(updated!.name).toBe("News pre-roll");
      expect(updated!.enabled).toBe(false);
    });

    it("deletes a rule", () => {
      const rule = createRule({ name: "Temp", matchTags: ["temp"], action: "apply_ad_pod" });
      expect(deleteRule(rule.ruleId!)).toBe(true);
      expect(getRule(rule.ruleId!)).toBeNull();
    });

    it("lists rules sorted by priority", () => {
      createRule({ name: "Low", matchTags: ["a"], action: "apply_ad_pod", priority: 1 });
      createRule({ name: "High", matchTags: ["b"], action: "apply_ad_pod", priority: 10 });
      createRule({ name: "Mid", matchTags: ["c"], action: "apply_ad_pod", priority: 5 });

      const rules = listRules();
      expect(rules.map((r) => r.name)).toEqual(["High", "Mid", "Low"]);
    });

    it("filters by enabled status", () => {
      createRule({ name: "Active", matchTags: ["a"], action: "apply_ad_pod", enabled: true });
      createRule({ name: "Disabled", matchTags: ["b"], action: "apply_ad_pod", enabled: false });

      expect(listRules({ enabled: true })).toHaveLength(1);
      expect(listRules({ enabled: false })).toHaveLength(1);
    });
  });

  describe("rule matching", () => {
    beforeEach(() => {
      createRule({
        name: "Sports mid-roll",
        matchTags: ["sports"],
        action: "apply_ad_pod",
        actionConfig: { position: "mid-roll", intervalMin: 10 },
        priority: 10,
      });
      createRule({
        name: "News pre-roll only",
        matchTags: ["news", "breaking"],
        matchAll: false,
        action: "apply_ad_pod",
        actionConfig: { position: "pre-roll" },
        priority: 5,
      });
      createRule({
        name: "Premium sports + exclusive",
        matchTags: ["sports", "exclusive"],
        matchAll: true,
        action: "set_access_tier",
        actionConfig: { tier: "premium" },
        priority: 8,
      });
      createRule({
        name: "Disabled rule",
        matchTags: ["sports"],
        action: "apply_ad_pod",
        enabled: false,
      });
    });

    it("matches single tag (any-match)", () => {
      const matches = matchRules(["sports"]);

      expect(matches).toHaveLength(1);
      expect(matches[0].ruleName).toBe("Sports mid-roll");
      expect(matches[0].matchedTags).toEqual(["sports"]);
    });

    it("matches partial tags when matchAll=false", () => {
      const matches = matchRules(["news"]);

      expect(matches).toHaveLength(1);
      expect(matches[0].ruleName).toBe("News pre-roll only");
    });

    it("requires all tags when matchAll=true", () => {
      // Only "sports" — should NOT match the matchAll rule
      const partial = matchRules(["sports"]);
      expect(partial.find((m) => m.ruleName === "Premium sports + exclusive")).toBeUndefined();

      // Both tags — should match
      const full = matchRules(["sports", "exclusive"]);
      const premiumMatch = full.find((m) => m.ruleName === "Premium sports + exclusive");
      expect(premiumMatch).toBeDefined();
      expect(premiumMatch!.action).toBe("set_access_tier");
    });

    it("skips disabled rules", () => {
      const matches = matchRules(["sports", "exclusive"]);
      const disabled = matches.find((m) => m.ruleName === "Disabled rule");
      expect(disabled).toBeUndefined();
    });

    it("returns multiple matching rules", () => {
      const matches = matchRules(["sports", "exclusive", "news"]);

      expect(matches.length).toBeGreaterThanOrEqual(3);
      const names = matches.map((m) => m.ruleName);
      expect(names).toContain("Sports mid-roll");
      expect(names).toContain("News pre-roll only");
      expect(names).toContain("Premium sports + exclusive");
    });

    it("returns empty for unmatched tags", () => {
      const matches = matchRules(["comedy", "documentary"]);
      expect(matches).toHaveLength(0);
    });

    it("is case-insensitive", () => {
      const matches = matchRules(["SPORTS", "News"]);

      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });
});
