import type { Request, Response, NextFunction } from "express";
import { checkContentAccess } from "../services/subscription-store.js";

/**
 * Extract userId from Authorization header.
 * Expects "Bearer <userId>" for simple token auth, or a JWT that decodes to { sub: userId }.
 * In production, replace with real JWT verification (e.g. Stripe customer portal token).
 */
function extractUserId(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  // JWT support: if the token has 3 dot-separated parts, decode the payload
  const parts = token.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      return payload.sub ?? payload.userId ?? null;
    } catch {
      // Not a valid JWT — treat as opaque token / userId
    }
  }

  return token;
}

/**
 * Middleware that gates video content based on subscription tier.
 * Attach to routes that serve HLS streams or video playback.
 *
 * Reads videoId from req.params.videoId or req.query.videoId.
 * Reads channelId from req.query.channelId (optional).
 *
 * If content has no access rules, it passes through (free content).
 * If content requires a tier the user doesn't have, returns 403 with paywall info.
 */
export function paywallGate(req: Request, res: Response, next: NextFunction): void {
  const videoId = (req.params as any).videoId ?? req.query.videoId as string | undefined;

  if (!videoId) {
    next();
    return;
  }

  const userId = extractUserId(req);
  const channelId = req.query.channelId as string | undefined;
  const result = checkContentAccess(videoId, userId, channelId);

  if (result.allowed) {
    // Attach access info to request for downstream use
    (req as any).accessInfo = result;
    next();
    return;
  }

  res.status(403).json({
    error: "paywall",
    message: "This content requires a subscription",
    requiredTier: result.requiredTier,
    userTier: result.userTier,
    upgradeUrl: "/api/subscriptions/plans",
  });
}
