import { z } from "zod";

export const MonetizationActionSchema = z.enum(["apply_ad_pod", "set_access_tier", "set_license_type"]);

export const MonetizationRuleSchema = z.object({
  ruleId: z.string().min(1).optional(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  matchTags: z.array(z.string()).min(1),
  matchAll: z.boolean().default(false),
  action: MonetizationActionSchema,
  actionConfig: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateRuleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  matchTags: z.array(z.string()).min(1),
  matchAll: z.boolean().default(false),
  action: MonetizationActionSchema,
  actionConfig: z.record(z.unknown()).default({}),
});

export const UpdateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  matchTags: z.array(z.string()).min(1).optional(),
  matchAll: z.boolean().optional(),
  action: MonetizationActionSchema.optional(),
  actionConfig: z.record(z.unknown()).optional(),
});

export const RuleMatchResultSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  action: MonetizationActionSchema,
  actionConfig: z.record(z.unknown()),
  matchedTags: z.array(z.string()),
});

export type MonetizationAction = z.infer<typeof MonetizationActionSchema>;
export type MonetizationRule = z.infer<typeof MonetizationRuleSchema>;
export type CreateRule = z.input<typeof CreateRuleSchema>;
export type UpdateRule = z.input<typeof UpdateRuleSchema>;
export type RuleMatchResult = z.infer<typeof RuleMatchResultSchema>;
