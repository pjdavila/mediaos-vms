import { Router, type Request } from "express";
import { ZodError } from "zod";
import { CreatePlanSchema, UpdatePlanSchema, CreateSubscriptionSchema, UpdateSubscriptionSchema, CreateAccessRuleSchema } from "../schemas/subscriptions.js";
import {
  createPlan, getPlan, updatePlan, deletePlan, listPlans,
  createSubscription, getSubscription, getActiveSubscription, updateSubscription, listSubscriptions,
  createAccessRule, getAccessRule, deleteAccessRule, listAccessRules,
  checkContentAccess,
} from "../services/subscription-store.js";

/** Plans CRUD: /api/subscriptions/plans */
export function createPlansRouter(): Router {
  const router = Router();

  router.post("/", (req, res) => {
    try {
      const input = CreatePlanSchema.parse(req.body);
      const plan = createPlan(input);
      res.status(201).json({ status: "ok", data: plan });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid plan data", detail: err.errors });
        return;
      }
      console.error("[subscriptions] Error creating plan:", err);
      res.status(500).json({ error: "Failed to create plan", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/", (req, res) => {
    try {
      const tier = req.query.tier as string | undefined;
      const enabled = req.query.enabled !== undefined ? req.query.enabled === "true" : undefined;
      const plans = listPlans({ tier: tier as any, enabled });
      res.json({ status: "ok", data: plans });
    } catch (err) {
      console.error("[subscriptions] Error listing plans:", err);
      res.status(500).json({ error: "Failed to list plans", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/:planId", (req: Request<{ planId: string }>, res) => {
    try {
      const plan = getPlan(req.params.planId);
      if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
      res.json({ status: "ok", data: plan });
    } catch (err) {
      console.error("[subscriptions] Error getting plan:", err);
      res.status(500).json({ error: "Failed to get plan", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.patch("/:planId", (req: Request<{ planId: string }>, res) => {
    try {
      const patch = UpdatePlanSchema.parse(req.body);
      const plan = updatePlan(req.params.planId, patch);
      if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
      res.json({ status: "ok", data: plan });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid plan data", detail: err.errors });
        return;
      }
      console.error("[subscriptions] Error updating plan:", err);
      res.status(500).json({ error: "Failed to update plan", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.delete("/:planId", (req: Request<{ planId: string }>, res) => {
    try {
      const deleted = deletePlan(req.params.planId);
      if (!deleted) { res.status(404).json({ error: "Plan not found" }); return; }
      res.json({ status: "ok", message: "Plan deleted" });
    } catch (err) {
      console.error("[subscriptions] Error deleting plan:", err);
      res.status(500).json({ error: "Failed to delete plan", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Subscriptions CRUD: /api/subscriptions */
export function createSubscriptionsRouter(): Router {
  const router = Router();

  router.post("/", (req, res) => {
    try {
      const input = CreateSubscriptionSchema.parse(req.body);
      const sub = createSubscription(input);
      res.status(201).json({ status: "ok", data: sub });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid subscription data", detail: err.errors });
        return;
      }
      console.error("[subscriptions] Error creating subscription:", err);
      res.status(500).json({ error: "Failed to create subscription", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/", (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const status = req.query.status as string | undefined;
      const subs = listSubscriptions({ userId, status });
      res.json({ status: "ok", data: subs });
    } catch (err) {
      console.error("[subscriptions] Error listing subscriptions:", err);
      res.status(500).json({ error: "Failed to list subscriptions", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/active/:userId", (req: Request<{ userId: string }>, res) => {
    try {
      const sub = getActiveSubscription(req.params.userId);
      if (!sub) { res.status(404).json({ error: "No active subscription found" }); return; }
      res.json({ status: "ok", data: sub });
    } catch (err) {
      console.error("[subscriptions] Error getting active subscription:", err);
      res.status(500).json({ error: "Failed to get subscription", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/:subscriptionId", (req: Request<{ subscriptionId: string }>, res) => {
    try {
      const sub = getSubscription(req.params.subscriptionId);
      if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }
      res.json({ status: "ok", data: sub });
    } catch (err) {
      console.error("[subscriptions] Error getting subscription:", err);
      res.status(500).json({ error: "Failed to get subscription", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.patch("/:subscriptionId", (req: Request<{ subscriptionId: string }>, res) => {
    try {
      const patch = UpdateSubscriptionSchema.parse(req.body);
      const sub = updateSubscription(req.params.subscriptionId, patch);
      if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }
      res.json({ status: "ok", data: sub });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid subscription data", detail: err.errors });
        return;
      }
      console.error("[subscriptions] Error updating subscription:", err);
      res.status(500).json({ error: "Failed to update subscription", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Access rules: /api/subscriptions/access-rules */
export function createAccessRulesRouter(): Router {
  const router = Router();

  router.post("/", (req, res) => {
    try {
      const input = CreateAccessRuleSchema.parse(req.body);
      const rule = createAccessRule(input);
      res.status(201).json({ status: "ok", data: rule });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid access rule data", detail: err.errors });
        return;
      }
      console.error("[subscriptions] Error creating access rule:", err);
      res.status(500).json({ error: "Failed to create access rule", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/", (req, res) => {
    try {
      const videoId = req.query.videoId as string | undefined;
      const channelId = req.query.channelId as string | undefined;
      const rules = listAccessRules({ videoId, channelId });
      res.json({ status: "ok", data: rules });
    } catch (err) {
      console.error("[subscriptions] Error listing access rules:", err);
      res.status(500).json({ error: "Failed to list access rules", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  router.delete("/:ruleId", (req: Request<{ ruleId: string }>, res) => {
    try {
      const deleted = deleteAccessRule(req.params.ruleId);
      if (!deleted) { res.status(404).json({ error: "Access rule not found" }); return; }
      res.json({ status: "ok", message: "Access rule deleted" });
    } catch (err) {
      console.error("[subscriptions] Error deleting access rule:", err);
      res.status(500).json({ error: "Failed to delete access rule", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Content access check: GET /api/subscriptions/access/check?videoId=...&userId=...&channelId=... */
export function createAccessCheckRouter(): Router {
  const router = Router();

  router.get("/check", (req, res) => {
    try {
      const videoId = req.query.videoId as string | undefined;
      const userId = req.query.userId as string | undefined;
      const channelId = req.query.channelId as string | undefined;

      if (!videoId) {
        res.status(400).json({ error: "videoId is required" });
        return;
      }

      const result = checkContentAccess(videoId, userId ?? null, channelId);
      res.json({ status: "ok", data: result });
    } catch (err) {
      console.error("[subscriptions] Error checking access:", err);
      res.status(500).json({ error: "Failed to check access", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Stripe webhook handler: POST /api/subscriptions/webhooks/stripe */
export function createStripeWebhookRouter(): Router {
  const router = Router();

  router.post("/stripe", (req, res) => {
    try {
      const event = req.body;
      const eventType = event?.type as string;

      console.log(`[subscriptions:stripe] Received webhook: ${eventType}`);

      switch (eventType) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data?.object;
          if (sub?.metadata?.mediaos_subscription_id) {
            updateSubscription(sub.metadata.mediaos_subscription_id, {
              status: sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "cancelled",
              stripeSubscriptionId: sub.id,
              stripeCustomerId: sub.customer,
              currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
            });
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data?.object;
          if (sub?.metadata?.mediaos_subscription_id) {
            updateSubscription(sub.metadata.mediaos_subscription_id, { status: "cancelled" });
          }
          break;
        }
        default:
          console.log(`[subscriptions:stripe] Unhandled event type: ${eventType}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error("[subscriptions] Stripe webhook error:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  return router;
}
