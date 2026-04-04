"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Send,
  Tv,
  MessageCircle,
  Globe,
  Link2,
  Check,
  Plus,
  Calendar,
  BarChart3,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const channels = [
  {
    id: "youtube",
    name: "YouTube",
    icon: Tv,
    connected: true,
    stats: { published: 42, views: 145000, subscribers: 12400 },
    color: "text-red-400",
    bgColor: "bg-red-500/10",
  },
  {
    id: "twitter",
    name: "Twitter / X",
    icon: MessageCircle,
    connected: true,
    stats: { published: 89, views: 234000, subscribers: 8900 },
    color: "text-sky-400",
    bgColor: "bg-sky-500/10",
  },
  {
    id: "webhook",
    name: "Webhook",
    icon: Globe,
    connected: true,
    stats: { published: 156, views: 0, subscribers: 0 },
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  {
    id: "embed",
    name: "Embed",
    icon: Link2,
    connected: false,
    stats: { published: 0, views: 0, subscribers: 0 },
    color: "text-zinc-400",
    bgColor: "bg-white/[0.04]",
  },
];

const scheduledPosts = [
  { id: "1", title: "Product Launch Keynote 2026", channel: "YouTube", scheduledFor: "2026-04-05T10:00:00Z", status: "scheduled" },
  { id: "2", title: "Engineering Deep Dive", channel: "Twitter / X", scheduledFor: "2026-04-05T14:00:00Z", status: "scheduled" },
  { id: "3", title: "Customer Testimonials", channel: "YouTube", scheduledFor: "2026-04-06T09:00:00Z", status: "scheduled" },
  { id: "4", title: "Brand Intro Animation", channel: "Webhook", scheduledFor: "2026-04-04T16:00:00Z", status: "publishing" },
];

export default function DistributePage() {
  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold tracking-tight">Distribution</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your connected channels and publishing schedule.
        </p>
      </motion.div>

      {/* Connected Channels */}
      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Channels
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {channels.map((channel, i) => (
            <motion.div
              key={channel.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass group rounded-2xl p-5 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", channel.bgColor)}>
                  <channel.icon className={cn("h-5 w-5", channel.color)} />
                </div>
                {channel.connected ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-400"
                  >
                    <Check className="mr-1 h-2.5 w-2.5" /> Connected
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg border-white/[0.08] bg-white/[0.02] text-[10px] text-zinc-500"
                  >
                    <Plus className="mr-1 h-3 w-3" /> Connect
                  </Button>
                )}
              </div>
              <h3 className="mt-3 text-sm font-semibold">{channel.name}</h3>
              {channel.connected && (
                <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                  <span>{channel.stats.published} published</span>
                  {channel.stats.views > 0 && (
                    <span>{(channel.stats.views / 1000).toFixed(0)}K views</span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Publishing Schedule */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Publishing Schedule
          </h2>
          <Button
            size="sm"
            className="h-8 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-xs"
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5" /> Schedule Post
          </Button>
        </div>
        <div className="glass overflow-hidden rounded-2xl">
          <div className="divide-y divide-white/[0.04]">
            {scheduledPosts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04]">
                  <Send className="h-4 w-4 text-zinc-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{post.title}</p>
                  <p className="text-xs text-zinc-500">
                    {post.channel} &middot;{" "}
                    {new Date(post.scheduledFor).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    post.status === "publishing"
                      ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                      : "border-white/[0.08] bg-white/[0.03] text-zinc-500"
                  )}
                >
                  {post.status === "publishing" ? "Publishing..." : "Scheduled"}
                </Badge>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Basic Analytics */}
      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Performance Overview
        </h2>
        <div className="glass rounded-2xl p-6">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { label: "Total Distributed", value: "287", change: "+18%" },
              { label: "Total Reach", value: "379K", change: "+23%" },
              { label: "Avg. Engagement", value: "4.2%", change: "+0.8%" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-xs text-zinc-500">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                <p className="mt-0.5 text-xs font-medium text-emerald-400">
                  {stat.change} vs last month
                </p>
              </div>
            ))}
          </div>
          {/* Placeholder chart area */}
          <div className="mt-6 flex h-48 items-center justify-center rounded-xl bg-white/[0.02]">
            <div className="text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-zinc-700" />
              <p className="mt-2 text-xs text-zinc-600">Analytics chart coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
