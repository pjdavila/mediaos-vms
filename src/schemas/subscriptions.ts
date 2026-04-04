import { z } from "zod";

export const SubscriptionTierSchema = z.enum(["free", "basic", "premium"]);

export const SubscriptionStatusSchema = z.enum(["active", "cancelled", "expired", "past_due"]);

export const SubscriptionPlanSchema = z.object({
  planId: z.string().min(1).optional(),
  name: z.string().min(1),
  tier: SubscriptionTierSchema,
  priceMonthly: z.number().nonnegative(),
  priceYearly: z.number().nonnegative().optional(),
  stripePriceId: z.string().optional(),
  features: z.array(z.string()).default([]),
  maxStreams: z.number().int().positive().default(1),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreatePlanSchema = z.object({
  name: z.string().min(1),
  tier: SubscriptionTierSchema,
  priceMonthly: z.number().nonnegative(),
  priceYearly: z.number().nonnegative().optional(),
  stripePriceId: z.string().optional(),
  features: z.array(z.string()).default([]),
  maxStreams: z.number().int().positive().default(1),
  enabled: z.boolean().default(true),
});

export const UpdatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  tier: SubscriptionTierSchema.optional(),
  priceMonthly: z.number().nonnegative().optional(),
  priceYearly: z.number().nonnegative().optional(),
  stripePriceId: z.string().optional(),
  features: z.array(z.string()).optional(),
  maxStreams: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});

export const SubscriptionSchema = z.object({
  subscriptionId: z.string().min(1).optional(),
  userId: z.string().min(1),
  planId: z.string().min(1),
  status: SubscriptionStatusSchema.default("active"),
  stripeSubscriptionId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  currentPeriodStart: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateSubscriptionSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  stripeSubscriptionId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
});

export const UpdateSubscriptionSchema = z.object({
  status: SubscriptionStatusSchema.optional(),
  planId: z.string().min(1).optional(),
  stripeSubscriptionId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
});

export const ContentAccessRuleSchema = z.object({
  ruleId: z.string().min(1).optional(),
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  requiredTier: SubscriptionTierSchema.default("premium"),
  createdAt: z.string().datetime().optional(),
});

export const CreateAccessRuleSchema = z.object({
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  requiredTier: SubscriptionTierSchema.default("premium"),
}).refine(
  (data) => data.videoId || data.channelId,
  { message: "Either videoId or channelId must be provided" }
);

export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;
export type CreatePlan = z.input<typeof CreatePlanSchema>;
export type UpdatePlan = z.input<typeof UpdatePlanSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type CreateSubscription = z.input<typeof CreateSubscriptionSchema>;
export type UpdateSubscription = z.input<typeof UpdateSubscriptionSchema>;
export type ContentAccessRule = z.infer<typeof ContentAccessRuleSchema>;
export type CreateAccessRule = z.input<typeof CreateAccessRuleSchema>;
