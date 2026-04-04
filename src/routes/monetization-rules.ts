import { Router, type Request } from "express";
import { ZodError } from "zod";
import { CreateRuleSchema, UpdateRuleSchema } from "../schemas/monetization-rules.js";
import {
  createRule, getRule, updateRule, deleteRule, listRules,
  matchRules,
} from "../services/monetization-rules-store.js";

/** Monetization rules CRUD: /api/monetization/rules */
export function createMonetizationRulesRouter(): Router {
  const router = Router();

  router.post("/", (req, res) => {
    try {
      const input = CreateRuleSchema.parse(req.body);
      const rule = createRule(input);
      res.status(201).json({ status: "ok", data: rule });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid rule data", detail: err.errors });
        return;
      }
      console.error("[monetization-rules] Error creating rule:", err);
      res.status(500).json({ error: "Failed to create rule", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/", (req, res) => {
    try {
      const enabled = req.query.enabled !== undefined ? req.query.enabled === "true" : undefined;
      const rules = listRules({ enabled });
      res.json({ status: "ok", data: rules });
    } catch (err) {
      console.error("[monetization-rules] Error listing rules:", err);
      res.status(500).json({ error: "Failed to list rules", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/:ruleId", (req: Request<{ ruleId: string }>, res) => {
    try {
      const rule = getRule(req.params.ruleId);
      if (!rule) { res.status(404).json({ error: "Rule not found" }); return; }
      res.json({ status: "ok", data: rule });
    } catch (err) {
      console.error("[monetization-rules] Error getting rule:", err);
      res.status(500).json({ error: "Failed to get rule", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.patch("/:ruleId", (req: Request<{ ruleId: string }>, res) => {
    try {
      const patch = UpdateRuleSchema.parse(req.body);
      const rule = updateRule(req.params.ruleId, patch);
      if (!rule) { res.status(404).json({ error: "Rule not found" }); return; }
      res.json({ status: "ok", data: rule });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid rule data", detail: err.errors });
        return;
      }
      console.error("[monetization-rules] Error updating rule:", err);
      res.status(500).json({ error: "Failed to update rule", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.delete("/:ruleId", (req: Request<{ ruleId: string }>, res) => {
    try {
      const deleted = deleteRule(req.params.ruleId);
      if (!deleted) { res.status(404).json({ error: "Rule not found" }); return; }
      res.json({ status: "ok", message: "Rule deleted" });
    } catch (err) {
      console.error("[monetization-rules] Error deleting rule:", err);
      res.status(500).json({ error: "Failed to delete rule", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Rule matching: POST /api/monetization/match */
export function createMonetizationMatchRouter(): Router {
  const router = Router();

  // POST /api/monetization/match — Given content tags, return matching monetization rules
  router.post("/", (req, res) => {
    try {
      const { tags } = req.body;

      if (!Array.isArray(tags) || tags.length === 0) {
        res.status(400).json({ error: "tags array is required" });
        return;
      }

      const matches = matchRules(tags);
      res.json({ status: "ok", data: matches, matchCount: matches.length });
    } catch (err) {
      console.error("[monetization-rules] Error matching rules:", err);
      res.status(500).json({ error: "Failed to match rules", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
