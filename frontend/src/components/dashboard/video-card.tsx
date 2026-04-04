"use client";

import { motion } from "framer-motion";
import { Play, Clock, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Video } from "@/lib/api";

const statusConfig = {
  ready: { label: "Ready", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  processing: { label: "Processing", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  uploading: { label: "Uploading", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

function formatDuration(seconds?: number) {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoCard({ video, index = 0 }: { video: Video; index?: number }) {
  const status = statusConfig[video.status] || statusConfig.processing;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link href={`/dashboard/videos/${video.id}`}>
        <div className="glass group cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.05]">
          {/* Thumbnail */}
          <div className="relative aspect-video bg-gradient-to-br from-zinc-900 to-zinc-800">
            {video.thumbnailUrl ? (
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Play className="h-10 w-10 text-zinc-700" />
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <Play className="h-5 w-5 text-white" fill="white" />
              </div>
            </div>
            {/* Duration badge */}
            {video.duration && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                <Clock className="h-3 w-3" />
                {formatDuration(video.duration)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 text-sm font-semibold text-white">
                {video.title}
              </h3>
              <Badge variant="outline" className={cn("shrink-0 text-[10px]", status.className)}>
                {status.label}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
              {video.views !== undefined && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {video.views.toLocaleString()}
                </span>
              )}
              <span>{new Date(video.createdAt).toLocaleDateString()}</span>
              {video.resolution && <span>{video.resolution}</span>}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
