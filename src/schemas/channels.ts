import { z } from "zod";

export const ChannelTypeSchema = z.enum([
  "youtube",
  "twitter",
  "custom_webhook",
  "embed",
]);

export const OAuthCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scope: z.string().optional(),
});

export const WebhookCredentialsSchema = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export const ChannelCredentialsSchema = z.union([
  OAuthCredentialsSchema,
  WebhookCredentialsSchema,
]);

export const FormatSpecSchema = z.object({
  maxResolution: z.string().optional(),
  maxBitrate: z.number().positive().optional(),
  aspectRatio: z.string().optional(),
  maxDurationSec: z.number().positive().optional(),
  containerFormat: z.string().optional(),
});

export const ChannelStatusSchema = z.enum([
  "active",
  "inactive",
  "error",
]);

export const DistributionChannelSchema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1),
  type: ChannelTypeSchema,
  credentials: ChannelCredentialsSchema.nullable().default(null),
  formatSpec: FormatSpecSchema.nullable().default(null),
  status: ChannelStatusSchema.default("active"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateChannelSchema = z.object({
  name: z.string().min(1),
  type: ChannelTypeSchema,
  credentials: ChannelCredentialsSchema.nullable().default(null),
  formatSpec: FormatSpecSchema.nullable().default(null),
  status: ChannelStatusSchema.default("active"),
});

export const UpdateChannelSchema = CreateChannelSchema.partial();

export type ChannelType = z.infer<typeof ChannelTypeSchema>;
export type OAuthCredentials = z.infer<typeof OAuthCredentialsSchema>;
export type WebhookCredentials = z.infer<typeof WebhookCredentialsSchema>;
export type ChannelCredentials = z.infer<typeof ChannelCredentialsSchema>;
export type FormatSpec = z.infer<typeof FormatSpecSchema>;
export type ChannelStatus = z.infer<typeof ChannelStatusSchema>;
export type DistributionChannel = z.infer<typeof DistributionChannelSchema>;
export type CreateChannel = z.input<typeof CreateChannelSchema>;
export type UpdateChannel = z.input<typeof UpdateChannelSchema>;
