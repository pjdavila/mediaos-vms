import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lic-test-"));
process.env.LICENSING_DB_PATH = path.join(tmpDir, "test-licensing.db");

import {
  createLicense, getLicense, updateLicense, deleteLicense, listLicenses,
  recordUsage, listUsages, getUsageCount,
  validateLicenseAccess,
  closeLicensingDb,
} from "./license-store.js";

afterAll(() => {
  closeLicensingDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("license-store", () => {
  beforeEach(() => {
    const all = listLicenses({ limit: 1000 });
    for (const lic of all.items) deleteLicense(lic.licenseId!);
  });

  describe("license CRUD", () => {
    it("creates a license request", () => {
      const lic = createLicense({
        videoId: "vid-1",
        licenseeId: "company-b",
        licensorId: "company-a",
        type: "standard",
        territory: "US",
      });

      expect(lic.licenseId).toBeDefined();
      expect(lic.videoId).toBe("vid-1");
      expect(lic.status).toBe("pending");
      expect(lic.watermark).toBe(true);
      expect(lic.territory).toBe("US");
    });

    it("retrieves a license", () => {
      const lic = createLicense({ videoId: "vid-2", licenseeId: "b", licensorId: "a" });
      const fetched = getLicense(lic.licenseId!);
      expect(fetched).toEqual(lic);
    });

    it("updates license status to approved", () => {
      const lic = createLicense({ videoId: "vid-3", licenseeId: "b", licensorId: "a" });
      const updated = updateLicense(lic.licenseId!, { status: "approved" });

      expect(updated!.status).toBe("approved");
    });

    it("deletes a license and its usages", () => {
      const lic = createLicense({ videoId: "vid-4", licenseeId: "b", licensorId: "a" });
      updateLicense(lic.licenseId!, { status: "approved" });
      recordUsage({ licenseId: lic.licenseId!, action: "download" });

      expect(deleteLicense(lic.licenseId!)).toBe(true);
      expect(getLicense(lic.licenseId!)).toBeNull();
      expect(listUsages(lic.licenseId!)).toHaveLength(0);
    });

    it("lists licenses filtered by status", () => {
      const lic1 = createLicense({ videoId: "vid-5", licenseeId: "b", licensorId: "a" });
      createLicense({ videoId: "vid-6", licenseeId: "c", licensorId: "a" });
      updateLicense(lic1.licenseId!, { status: "approved" });

      const approved = listLicenses({ status: "approved" });
      expect(approved.items).toHaveLength(1);
      expect(approved.items[0].videoId).toBe("vid-5");

      const pending = listLicenses({ status: "pending" });
      expect(pending.items).toHaveLength(1);
    });

    it("lists licenses filtered by licensee", () => {
      createLicense({ videoId: "vid-7", licenseeId: "company-x", licensorId: "a" });
      createLicense({ videoId: "vid-8", licenseeId: "company-y", licensorId: "a" });

      const result = listLicenses({ licenseeId: "company-x" });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe("usage tracking", () => {
    it("records and lists usage events", () => {
      const lic = createLicense({ videoId: "vid-10", licenseeId: "b", licensorId: "a" });
      updateLicense(lic.licenseId!, { status: "approved" });

      recordUsage({ licenseId: lic.licenseId!, action: "stream", ipAddress: "1.2.3.4" });
      recordUsage({ licenseId: lic.licenseId!, action: "download", metadata: { format: "mp4" } });

      const usages = listUsages(lic.licenseId!);
      expect(usages).toHaveLength(2);
      expect(getUsageCount(lic.licenseId!)).toBe(2);
    });
  });

  describe("license validation", () => {
    it("validates an approved license", () => {
      const lic = createLicense({ videoId: "vid-20", licenseeId: "b", licensorId: "a" });
      updateLicense(lic.licenseId!, { status: "approved" });

      const result = validateLicenseAccess(lic.licenseId!);
      expect(result.valid).toBe(true);
    });

    it("rejects a pending license", () => {
      const lic = createLicense({ videoId: "vid-21", licenseeId: "b", licensorId: "a" });

      const result = validateLicenseAccess(lic.licenseId!);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("pending");
    });

    it("rejects when usage limit exceeded", () => {
      const lic = createLicense({ videoId: "vid-22", licenseeId: "b", licensorId: "a", maxUsages: 2 });
      updateLicense(lic.licenseId!, { status: "approved" });

      recordUsage({ licenseId: lic.licenseId!, action: "stream" });
      recordUsage({ licenseId: lic.licenseId!, action: "stream" });

      const result = validateLicenseAccess(lic.licenseId!);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Usage limit");
    });

    it("rejects expired license", () => {
      const lic = createLicense({
        videoId: "vid-23",
        licenseeId: "b",
        licensorId: "a",
        expiresAt: "2020-01-01T00:00:00.000Z",
      });
      updateLicense(lic.licenseId!, { status: "approved" });

      const result = validateLicenseAccess(lic.licenseId!);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("expired");

      // Also verify it updated the status in DB
      const updated = getLicense(lic.licenseId!);
      expect(updated!.status).toBe("expired");
    });

    it("returns not found for unknown license", () => {
      const result = validateLicenseAccess("nonexistent-id");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });
});
