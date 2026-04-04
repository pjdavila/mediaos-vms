"use client";

import { motion } from "framer-motion";
import {
  Video,
  Eye,
  HardDrive,
  TrendingUp,
  Upload,
  Radio,
  Send,
  Play,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { VideoCard } from "@/components/dashboard/video-card";
import Link from "next/link";
import type { Video as VideoType } from "@/lib/api";

// Mock data — will be replaced with real API calls
const stats = [
  { title: "Total Videos", value: 247, icon: Video, change: 12, gradient: "bg-blue-500" },
  { title: "Total Views", value: 184200, icon: Eye, change: 23, suffix: "", gradient: "bg-violet-500" },
  { title: "Storage Used", value: 48, suffix: " GB", icon: HardDrive, change: -5, gradient: "bg-cyan-500" },
  { title: "Engagement", value: 94, suffix: "%", icon: TrendingUp, change: 8, gradient: "bg-emerald-500" },
];

const recentVideos: VideoType[] = [
  {
    id: "1",
    title: "Product Launch Keynote 2026",
    status: "ready",
    duration: 3420,
    createdAt: "2026-04-03T10:00:00Z",
    views: 12400,
    resolution: "4K",
  },
  {
    id: "2",
    title: "Engineering Deep Dive: Streaming Architecture",
    status: "processing",
    duration: 2160,
    createdAt: "2026-04-03T14:30:00Z",
    views: 0,
    resolution: "1080p",
  },
  {
    id: "3",
    title: "Customer Testimonials Compilation",
    status: "ready",
    duration: 960,
    createdAt: "2026-04-02T09:00:00Z",
    views: 5600,
    resolution: "1080p",
  },
  {
    id: "4",
    title: "Q1 All Hands Recording",
    status: "ready",
    duration: 5400,
    createdAt: "2026-04-01T16:00:00Z",
    views: 890,
    resolution: "1080p",
  },
];

const quickActions = [
  { icon: Upload, label: "Upload Video", href: "/dashboard/upload", color: "from-blue-600 to-blue-500" },
  { icon: Radio, label: "Start Stream", href: "/dashboard/streams", color: "from-violet-600 to-violet-500" },
  { icon: Send, label: "Distribute", href: "/dashboard/distribute", color: "from-cyan-600 to-cyan-500" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Welcome back. Here&apos;s your video platform overview.
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {quickActions.map((action, i) => (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
            >
              <Link href={action.href}>
                <div className="glass group flex cursor-pointer items-center gap-4 rounded-2xl p-5 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.05]">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${action.color}`}>
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{action.label}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-all duration-200 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Videos */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Recent Videos
          </h2>
          <Link
            href="/dashboard/videos"
            className="text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recentVideos.map((video, i) => (
            <VideoCard key={video.id} video={video} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
