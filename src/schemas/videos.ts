import { z } from "zod";

export const VideoStatusSchema = z.enum(["uploading", "processing", "ready", "failed"]);

export const VideoRecordSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  filename: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  hlsUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  status: VideoStatusSchema.default("uploading"),
  duration: z.number().nonnegative().optional(),
  resolution: z.string().optional(),
  format: z.string().optional(),
  userId: z.string().optional(),
  views: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateVideoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  filename: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  hlsUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  status: VideoStatusSchema.default("uploading"),
  duration: z.number().nonnegative().optional(),
  resolution: z.string().optional(),
  format: z.string().optional(),
  userId: z.string().optional(),
});

export const UpdateVideoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  hlsUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  status: VideoStatusSchema.optional(),
  duration: z.number().nonnegative().optional(),
  resolution: z.string().optional(),
  format: z.string().optional(),
  views: z.number().int().nonnegative().optional(),
});

export type VideoStatus = z.infer<typeof VideoStatusSchema>;
export type VideoRecord = z.infer<typeof VideoRecordSchema>;
export type CreateVideo = z.input<typeof CreateVideoSchema>;
export type UpdateVideo = z.input<typeof UpdateVideoSchema>;
