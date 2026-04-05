"use client";

import { use, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Download,
  Send,
  Share2,
  Clock,
  Eye,
  HardDrive,
  Film,
  FileText,
  BookOpen,
  Image,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { api, type Video } from "@/lib/api";

const statusBadgeConfig: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" },
  processing: { label: "Processing", className: "border-blue-500/20 bg-blue-500/10 text-blue-400" },
  failed: { label: "Failed", className: "border-red-500/20 bg-red-500/10 text-red-400" },
  uploading: { label: "Uploading", className: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
};

function formatDuration(seconds?: number) {
  if (!seconds) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.videos.get(id).then(setVideo).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-sm font-medium text-red-400">{error || "Video not found"}</p>
        <Link href="/dashboard/videos" className="mt-4 text-xs text-zinc-500 hover:text-white">
          <ArrowLeft className="mr-1 inline h-3 w-3" /> Back to library
        </Link>
      </div>
    );
  }

  const badge = statusBadgeConfig[video.status] || statusBadgeConfig.processing;

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Back link */}
        <Link href="/dashboard/videos" className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white">
          <ArrowLeft className="h-3 w-3" /> Back to library
        </Link>

        {/* Player area */}
        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr,380px]">
          {/* Player */}
          <div className="space-y-6">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800">
              {video.url ? (
                <video
                  src={video.url}
                  controls
                  className="h-full w-full object-contain"
                  poster={video.thumbnailUrl}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20"
                  >
                    <Play className="ml-1 h-8 w-8 text-white" fill="white" />
                  </motion.button>
                </div>
              )}
              {/* Duration bar */}
              {!video.url && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-4">
                  <div className="h-1 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 to-violet-500" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                    <span>0:00</span>
                    <span>{formatDuration(video.duration)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Title and actions */}
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{video.title}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {video.description || "No description"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 ${badge.className}`}
                >
                  {badge.label}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-xs font-medium"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Distribute
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl border-white/[0.08] bg-white/[0.02] text-xs text-zinc-400 hover:text-white"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl border-white/[0.08] bg-white/[0.02] text-xs text-zinc-400 hover:text-white"
                >
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
                </Button>
              </div>
            </div>

            {/* AI Insights Tabs */}
            <Tabs defaultValue="transcript" className="mt-6">
              <TabsList className="h-9 rounded-xl bg-white/[0.04] p-1">
                <TabsTrigger
                  value="transcript"
                  className="rounded-lg text-xs data-[state=active]:bg-white/[0.08]"
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Transcript
                </TabsTrigger>
                <TabsTrigger
                  value="chapters"
                  className="rounded-lg text-xs data-[state=active]:bg-white/[0.08]"
                >
                  <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Chapters
                </TabsTrigger>
                <TabsTrigger
                  value="thumbnails"
                  className="rounded-lg text-xs data-[state=active]:bg-white/[0.08]"
                >
                  <Image className="mr-1.5 h-3.5 w-3.5" /> Thumbnails
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transcript" className="mt-4">
                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      AI-Generated Transcript
                    </p>
                  </div>
                  <p className="text-sm text-zinc-600 italic">
                    Transcript will appear here once AI processing completes.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="chapters" className="mt-4">
                <div className="glass rounded-2xl p-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    AI-Detected Chapters
                  </p>
                  <p className="text-sm text-zinc-600 italic">
                    Chapters will appear here once AI processing completes.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="thumbnails" className="mt-4">
                <div className="glass rounded-2xl p-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    AI-Generated Thumbnails
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="aspect-video rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900"
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Metadata sidebar */}
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6">
              <h3 className="mb-4 text-sm font-semibold">Video Details</h3>
              <div className="space-y-3">
                {[
                  { icon: Clock, label: "Duration", value: formatDuration(video.duration) },
                  { icon: Eye, label: "Views", value: (video.views ?? 0).toLocaleString() },
                  { icon: Film, label: "Resolution", value: video.resolution || "—" },
                  { icon: HardDrive, label: "Size", value: formatBytes(video.size) },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                    <span className="text-xs font-medium text-zinc-300">{item.value}</span>
                  </div>
                ))}
              </div>
              <Separator className="my-4 bg-white/[0.06]" />
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Format</p>
                <p className="font-mono text-xs text-zinc-300">{video.format || "—"}</p>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-zinc-500">Created</p>
                <p className="text-xs text-zinc-300">
                  {video.createdAt ? new Date(video.createdAt).toLocaleString() : "—"}
                </p>
              </div>
              {video.url && (
                <>
                  <Separator className="my-4 bg-white/[0.06]" />
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">HLS URL</p>
                    <p className="break-all font-mono text-[10px] text-zinc-400">{video.url}</p>
                  </div>
                </>
              )}
            </div>

            {/* Distribution Status */}
            <div className="glass rounded-2xl p-6">
              <h3 className="mb-4 text-sm font-semibold">Distribution</h3>
              {video.channels && video.channels.length > 0 ? (
                <div className="space-y-3">
                  {video.channels.map((ch) => (
                    <div
                      key={ch}
                      className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3"
                    >
                      <span className="text-xs font-medium text-zinc-300">{ch}</span>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span className="text-xs text-emerald-400">Published</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Not yet distributed</p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
