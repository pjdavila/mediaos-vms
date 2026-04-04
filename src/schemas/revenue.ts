import { z } from "zod";

export const RevenueSourceSchema = z.enum(["ad", "subscription", "license"]);

export const RevenueEventSchema = z.object({
  eventId: z.string().min(1).optional(),
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  source: RevenueSourceSchema,
  amountCents: z.number().int(),
  currency: z.string().default("USD"),
  metadata: z.record(z.string()).optional(),
  occurredAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
});

export const CreateRevenueEventSchema = z.object({
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  source: RevenueSourceSchema,
  amountCents: z.number().int(),
  currency: z.string().default("USD"),
  metadata: z.record(z.string()).optional(),
  occurredAt: z.string().datetime().optional(),
}).refine(
  (data) => data.videoId || data.channelId,
  { message: "Either videoId or channelId must be provided" }
);

export const RevenueSummarySchema = z.object({
  totalCents: z.number().int(),
  adCents: z.number().int(),
  subscriptionCents: z.number().int(),
  licenseCents: z.number().int(),
  currency: z.string(),
  eventCount: z.number().int(),
});

export const DailyRevenueSchema = z.object({
  date: z.string(),
  totalCents: z.number().int(),
  adCents: z.number().int(),
  subscriptionCents: z.number().int(),
  licenseCents: z.number().int(),
});

export type RevenueSource = z.infer<typeof RevenueSourceSchema>;
export type RevenueEvent = z.infer<typeof RevenueEventSchema>;
export type CreateRevenueEvent = z.input<typeof CreateRevenueEventSchema>;
export type RevenueSummary = z.infer<typeof RevenueSummarySchema>;
export type DailyRevenue = z.infer<typeof DailyRevenueSchema>;
