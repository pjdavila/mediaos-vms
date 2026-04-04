import { Router, type Request } from "express";
import { ZodError } from "zod";
import { CreateLicenseSchema, UpdateLicenseSchema, CreateUsageSchema } from "../schemas/licensing.js";
import {
  createLicense, getLicense, updateLicense, deleteLicense, listLicenses,
  recordUsage, listUsages, getUsageCount,
  validateLicenseAccess,
} from "../services/license-store.js";

/** License CRUD: /api/licenses */
export function createLicensesRouter(): Router {
  const router = Router();

  // POST /api/licenses — Request a new license (licensee submits request)
  router.post("/", (req, res) => {
    try {
      const input = CreateLicenseSchema.parse(req.body);
      const license = createLicense(input);
      res.status(201).json({ status: "ok", data: license });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid license data", detail: err.errors });
        return;
      }
      console.error("[licensing] Error creating license:", err);
      res.status(500).json({ error: "Failed to create license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/licenses — List licenses (filters: videoId, licenseeId, licensorId, status)
  router.get("/", (req, res) => {
    try {
      const videoId = req.query.videoId as string | undefined;
      const licenseeId = req.query.licenseeId as string | undefined;
      const licensorId = req.query.licensorId as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const result = listLicenses({ videoId, licenseeId, licensorId, status: status as any, limit, offset });
      res.json({ status: "ok", data: result.items, total: result.total });
    } catch (err) {
      console.error("[licensing] Error listing licenses:", err);
      res.status(500).json({ error: "Failed to list licenses", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/licenses/:licenseId — Get license details
  router.get("/:licenseId", (req: Request<{ licenseId: string }>, res) => {
    try {
      const license = getLicense(req.params.licenseId);
      if (!license) { res.status(404).json({ error: "License not found" }); return; }
      res.json({ status: "ok", data: license });
    } catch (err) {
      console.error("[licensing] Error getting license:", err);
      res.status(500).json({ error: "Failed to get license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // PATCH /api/licenses/:licenseId — Update license (approve/reject/revoke)
  router.patch("/:licenseId", (req: Request<{ licenseId: string }>, res) => {
    try {
      const patch = UpdateLicenseSchema.parse(req.body);
      const license = updateLicense(req.params.licenseId, patch);
      if (!license) { res.status(404).json({ error: "License not found" }); return; }
      res.json({ status: "ok", data: license });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid license data", detail: err.errors });
        return;
      }
      console.error("[licensing] Error updating license:", err);
      res.status(500).json({ error: "Failed to update license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/licenses/:licenseId/approve — Shortcut to approve
  router.post("/:licenseId/approve", (req: Request<{ licenseId: string }>, res) => {
    try {
      const license = updateLicense(req.params.licenseId, { status: "approved" });
      if (!license) { res.status(404).json({ error: "License not found" }); return; }
      res.json({ status: "ok", data: license });
    } catch (err) {
      console.error("[licensing] Error approving license:", err);
      res.status(500).json({ error: "Failed to approve license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/licenses/:licenseId/reject — Shortcut to reject
  router.post("/:licenseId/reject", (req: Request<{ licenseId: string }>, res) => {
    try {
      const license = updateLicense(req.params.licenseId, { status: "rejected" });
      if (!license) { res.status(404).json({ error: "License not found" }); return; }
      res.json({ status: "ok", data: license });
    } catch (err) {
      console.error("[licensing] Error rejecting license:", err);
      res.status(500).json({ error: "Failed to reject license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/licenses/:licenseId/revoke — Revoke an approved license
  router.post("/:licenseId/revoke", (req: Request<{ licenseId: string }>, res) => {
    try {
      const license = updateLicense(req.params.licenseId, { status: "revoked" });
      if (!license) { res.status(404).json({ error: "License not found" }); return; }
      res.json({ status: "ok", data: license });
    } catch (err) {
      console.error("[licensing] Error revoking license:", err);
      res.status(500).json({ error: "Failed to revoke license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/licenses/:licenseId/validate — Check if license is valid for access
  router.get("/:licenseId/validate", (req: Request<{ licenseId: string }>, res) => {
    try {
      const result = validateLicenseAccess(req.params.licenseId);
      const statusCode = result.valid ? 200 : 403;
      res.status(statusCode).json({ status: "ok", data: result });
    } catch (err) {
      console.error("[licensing] Error validating license:", err);
      res.status(500).json({ error: "Failed to validate license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // DELETE /api/licenses/:licenseId — Delete a license
  router.delete("/:licenseId", (req: Request<{ licenseId: string }>, res) => {
    try {
      const deleted = deleteLicense(req.params.licenseId);
      if (!deleted) { res.status(404).json({ error: "License not found" }); return; }
      res.json({ status: "ok", message: "License deleted" });
    } catch (err) {
      console.error("[licensing] Error deleting license:", err);
      res.status(500).json({ error: "Failed to delete license", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

/** Usage tracking: /api/licenses/:licenseId/usages */
export function createLicenseUsageRouter(): Router {
  const router = Router({ mergeParams: true });

  // POST /api/licenses/:licenseId/usages — Record a usage event
  router.post("/", (req: Request<{ licenseId: string }>, res) => {
    try {
      // Validate license before recording usage
      const validation = validateLicenseAccess(req.params.licenseId);
      if (!validation.valid) {
        res.status(403).json({ error: "License not valid", reason: validation.reason });
        return;
      }

      const input = CreateUsageSchema.parse({
        ...req.body,
        licenseId: req.params.licenseId,
      });
      const usage = recordUsage(input);
      res.status(201).json({ status: "ok", data: usage });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Invalid usage data", detail: err.errors });
        return;
      }
      console.error("[licensing] Error recording usage:", err);
      res.status(500).json({ error: "Failed to record usage", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/licenses/:licenseId/usages — List usage events
  router.get("/", (req: Request<{ licenseId: string }>, res) => {
    try {
      const usages = listUsages(req.params.licenseId);
      const count = getUsageCount(req.params.licenseId);
      res.json({ status: "ok", data: usages, total: count });
    } catch (err) {
      console.error("[licensing] Error listing usages:", err);
      res.status(500).json({ error: "Failed to list usages", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
