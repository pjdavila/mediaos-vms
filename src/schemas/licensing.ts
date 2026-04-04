import { z } from "zod";

export const LicenseStatusSchema = z.enum(["pending", "approved", "rejected", "revoked", "expired"]);

export const LicenseTypeSchema = z.enum(["standard", "exclusive", "editorial", "creative_commons"]);

export const LicenseSchema = z.object({
  licenseId: z.string().min(1).optional(),
  videoId: z.string().min(1),
  licenseeId: z.string().min(1),
  licensorId: z.string().min(1),
  type: LicenseTypeSchema.default("standard"),
  status: LicenseStatusSchema.default("pending"),
  territory: z.string().default("worldwide"),
  maxUsages: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  watermark: z.boolean().default(true),
  notes: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateLicenseSchema = z.object({
  videoId: z.string().min(1),
  licenseeId: z.string().min(1),
  licensorId: z.string().min(1),
  type: LicenseTypeSchema.default("standard"),
  territory: z.string().default("worldwide"),
  maxUsages: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  watermark: z.boolean().default(true),
  notes: z.string().optional(),
});

export const UpdateLicenseSchema = z.object({
  status: LicenseStatusSchema.optional(),
  type: LicenseTypeSchema.optional(),
  territory: z.string().optional(),
  maxUsages: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  watermark: z.boolean().optional(),
  notes: z.string().optional(),
});

export const LicenseUsageSchema = z.object({
  usageId: z.string().min(1).optional(),
  licenseId: z.string().min(1),
  action: z.string().min(1),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  createdAt: z.string().datetime().optional(),
});

export const CreateUsageSchema = z.object({
  licenseId: z.string().min(1),
  action: z.string().min(1),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;
export type LicenseType = z.infer<typeof LicenseTypeSchema>;
export type License = z.infer<typeof LicenseSchema>;
export type CreateLicense = z.input<typeof CreateLicenseSchema>;
export type UpdateLicense = z.input<typeof UpdateLicenseSchema>;
export type LicenseUsage = z.infer<typeof LicenseUsageSchema>;
export type CreateUsage = z.input<typeof CreateUsageSchema>;
