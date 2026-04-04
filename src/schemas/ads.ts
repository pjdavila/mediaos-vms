import { z } from "zod";

export const AdPositionSchema = z.enum(["pre-roll", "mid-roll", "post-roll"]);

export const AdProviderSchema = z.enum(["vast", "vpaid", "custom"]);

export const SsaiModeSchema = z.enum(["5centscdn", "custom", "disabled"]);

export const AdBreakSchema = z.object({
  position: AdPositionSchema,
  offsetSec: z.number().nonnegative().optional(),
  maxDurationSec: z.number().positive().default(30),
  maxAds: z.number().int().positive().default(3),
});

export const VastConfigSchema = z.object({
  tagUrl: z.string().url().optional(),
  provider: AdProviderSchema.default("vast"),
  vastVersion: z.string().default("4.2"),
  skipAfterSec: z.number().nonnegative().optional(),
  clickThroughUrl: z.string().url().optional(),
});

export const SsaiConfigSchema = z.object({
  mode: SsaiModeSchema.default("disabled"),
  stitchingEndpoint: z.string().url().optional(),
  sessionTokenHeader: z.string().optional(),
});

export const AdPodConfigSchema = z.object({
  adPodId: z.string().min(1).optional(),
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  breaks: z.array(AdBreakSchema).min(1),
  vast: VastConfigSchema.default({}),
  ssai: SsaiConfigSchema.default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateAdPodSchema = z.object({
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  breaks: z.array(AdBreakSchema).min(1),
  vast: VastConfigSchema.default({}),
  ssai: SsaiConfigSchema.default({}),
}).refine(
  (data) => data.videoId || data.channelId,
  { message: "Either videoId or channelId must be provided" }
);

export const UpdateAdPodSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  breaks: z.array(AdBreakSchema).min(1).optional(),
  vast: VastConfigSchema.optional(),
  ssai: SsaiConfigSchema.optional(),
});

export type AdPosition = z.infer<typeof AdPositionSchema>;
export type AdProvider = z.infer<typeof AdProviderSchema>;
export type SsaiMode = z.infer<typeof SsaiModeSchema>;
export type AdBreak = z.infer<typeof AdBreakSchema>;
export type VastConfig = z.infer<typeof VastConfigSchema>;
export type SsaiConfig = z.infer<typeof SsaiConfigSchema>;
export type AdPodConfig = z.infer<typeof AdPodConfigSchema>;
export type CreateAdPod = z.input<typeof CreateAdPodSchema>;
export type UpdateAdPod = z.input<typeof UpdateAdPodSchema>;
