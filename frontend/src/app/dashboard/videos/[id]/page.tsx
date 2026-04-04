"use client";

import { use } from "react";
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
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

// Mock video detail
const videoData = {
  id: "1",
  title: "Product Launch Keynote 2026",
  description:
    "Annual product launch keynote presentation featuring new VideoOS features, platform updates, and roadmap for 2026.",
  status: "ready" as const,
  duration: 3420,
  createdAt: "2026-04-03T10:00:00Z",
  views: 12400,
  resolution: "3840x2160",
  format: "MP4 / H.264",
  size: "2.4 GB",
  fps: 60,
  bitrate: "12 Mbps",
  url: "#",
  thumbnailUrl: undefined,
  channels: ["YouTube", "Twitter/X"],
  transcript:
    "Welcome everyone to the 2026 Product Launch Keynote. Today we're excited to share with you the future of video management...\n\nFirst, let me walk you through our new streaming architecture that enables sub-second latency globally...\n\nNext, our AI-powered transcription engine now supports 40+ languages with 99.2% accuracy...\n\nFinally, our new distribution pipeline allows one-click publishing to all major platforms...",
  chapters: [
    { time: "0:00", title: "Introduction" },
    { time: "5:30", title: "New Streaming Architecture" },
    { time: "18:45", title: "AI Transcription Engine" },
    { time: "32:00", title: "Distribution Pipeline" },
    { time: "45:00", title: "Q&A" },
  ],
};

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Player area */}
        <div className="grid gap-8 lg:grid-cols-[1fr,380px]">
          {/* Player */}
          <div className="space-y-6">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800">
              <div className="flex h-full items-center justify-center">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <Play className="ml-1 h-8 w-8 text-white" fill="white" />
                </motion.button>
              </div>
              {/* Duration bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-4">
                <div className="h-1 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 to-violet-500" />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                  <span>19:00</span>
                  <span>{formatDuration(videoData.duration)}</span>
                </div>
              </div>
            </div>

            {/* Title and actions */}
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{videoData.title}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {videoData.description}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                >
                  Ready
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
                    <button className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white">
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-400">
                    {videoData.transcript}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="chapters" className="mt-4">
                <div className="glass rounded-2xl p-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    AI-Detected Chapters
                  </p>
                  <div className="space-y-2">
                    {videoData.chapters.map((chapter, i) => (
                      <button
                        key={i}
                        className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <span className="font-mono text-xs text-blue-400">
                          {chapter.time}
                        </span>
                        <span className="text-sm text-zinc-300">{chapter.title}</span>
                      </button>
                    ))}
                  </div>
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
                        className="aspect-video cursor-pointer rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 transition-all hover:ring-2 hover:ring-blue-500/50"
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
                  { icon: Clock, label: "Duration", value: formatDuration(videoData.duration) },
                  { icon: Eye, label: "Views", value: videoData.views.toLocaleString() },
                  { icon: Film, label: "Resolution", value: videoData.resolution },
                  { icon: HardDrive, label: "Size", value: videoData.size },
                  { icon: BarChart3, label: "Bitrate", value: videoData.bitrate },
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
                <p className="font-mono text-xs text-zinc-300">{videoData.format}</p>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-zinc-500">Created</p>
                <p className="text-xs text-zinc-300">
                  {new Date(videoData.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Distribution Status */}
            <div className="glass rounded-2xl p-6">
              <h3 className="mb-4 text-sm font-semibold">Distribution</h3>
              {videoData.channels.length > 0 ? (
                <div className="space-y-3">
                  {videoData.channels.map((ch) => (
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
