import { z } from "zod";

export const TagSchema = z.object({
  label: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["ai", "manual"]).default("manual"),
});

export const TranscriptSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string(),
});

export const ChapterSchema = z.object({
  title: z.string().min(1),
  startTime: z.number().min(0),
  endTime: z.number().min(0).optional(),
});

export const ThumbnailSchema = z.object({
  url: z.string().url(),
  timestamp: z.number().min(0).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  selected: z.boolean().default(false),
});

export const MetadataStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const VideoMetadataSchema = z.object({
  videoId: z.string().min(1),
  tags: z.array(TagSchema).default([]),
  transcript: z.array(TranscriptSegmentSchema).default([]),
  chapters: z.array(ChapterSchema).default([]),
  thumbnails: z.array(ThumbnailSchema).default([]),
  language: z.string().nullable().default(null),
  duration: z.number().min(0).nullable().default(null),
  resolution: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable()
    .default(null),
  status: MetadataStatusSchema.default("pending"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const VideoMetadataPatchSchema = VideoMetadataSchema.omit({
  videoId: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type Tag = z.infer<typeof TagSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Thumbnail = z.infer<typeof ThumbnailSchema>;
export type MetadataStatus = z.infer<typeof MetadataStatusSchema>;
export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;
export type VideoMetadataPatch = z.infer<typeof VideoMetadataPatchSchema>;
