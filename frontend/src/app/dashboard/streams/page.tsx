"use client";

import { motion } from "framer-motion";
import { Radio, Play, Square, Users, Clock, Copy, Plus, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const mockStreams = [
  {
    id: "1",
    title: "Product Demo Live Stream",
    status: "live" as const,
    viewers: 1243,
    startedAt: "2026-04-04T14:00:00Z",
    rtmpUrl: "rtmp://stream.videoos.io/live",
    streamKey: "sk_live_abc123xyz",
  },
  {
    id: "2",
    title: "Weekly Engineering Standup",
    status: "offline" as const,
    viewers: 0,
    startedAt: undefined,
    rtmpUrl: "rtmp://stream.videoos.io/live",
    streamKey: "sk_live_def456uvw",
  },
  {
    id: "3",
    title: "Customer Webinar Series",
    status: "offline" as const,
    viewers: 0,
    startedAt: undefined,
    rtmpUrl: "rtmp://stream.videoos.io/live",
    streamKey: "sk_live_ghi789rst",
  },
];

const statusConfig = {
  live: { label: "LIVE", className: "bg-red-500/10 text-red-400 border-red-500/20", dotClass: "bg-red-500 animate-pulse" },
  offline: { label: "Offline", className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20", dotClass: "bg-zinc-600" },
  starting: { label: "Starting", className: "bg-amber-500/10 text-amber-400 border-amber-500/20", dotClass: "bg-amber-500 animate-pulse" },
  ending: { label: "Ending", className: "bg-amber-500/10 text-amber-400 border-amber-500/20", dotClass: "bg-amber-500" },
};

export default function StreamsPage() {
  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Streams</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage your live streams and RTMP endpoints.
          </p>
        </div>
        <Button className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-medium">
          <Plus className="mr-1.5 h-4 w-4" /> New Stream
        </Button>
      </motion.div>

      {/* Stream list */}
      <div className="space-y-4">
        {mockStreams.map((stream, i) => {
          const status = statusConfig[stream.status];
          const isLive = stream.status === "live";

          return (
            <motion.div
              key={stream.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "glass overflow-hidden rounded-2xl transition-all duration-300 hover:border-white/[0.1]",
                isLive && "ring-1 ring-red-500/20"
              )}
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl",
                        isLive ? "bg-red-500/10" : "bg-white/[0.04]"
                      )}
                    >
                      {isLive ? (
                        <Wifi className="h-5 w-5 text-red-400" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-zinc-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{stream.title}</h3>
                      <div className="mt-1 flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", status.className)}
                        >
                          <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", status.dotClass)} />
                          {status.label}
                        </Badge>
                        {isLive && (
                          <>
                            <span className="flex items-center gap-1 text-xs text-zinc-500">
                              <Users className="h-3 w-3" />
                              {stream.viewers?.toLocaleString()} viewers
                            </span>
                            <span className="flex items-center gap-1 text-xs text-zinc-500">
                              <Clock className="h-3 w-3" />
                              Started{" "}
                              {stream.startedAt
                                ? new Date(stream.startedAt).toLocaleTimeString()
                                : "N/A"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isLive ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl border-red-500/20 bg-red-500/5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        <Square className="mr-1.5 h-3 w-3" fill="currentColor" /> End Stream
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-xs"
                      >
                        <Play className="mr-1.5 h-3 w-3" fill="white" /> Start
                      </Button>
                    )}
                  </div>
                </div>

                {/* Stream config */}
                <div className="mt-4 grid gap-3 rounded-xl bg-white/[0.02] p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-zinc-600">RTMP URL</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 truncate font-mono text-xs text-zinc-400">
                        {stream.rtmpUrl}
                      </code>
                      <button className="text-zinc-600 hover:text-white">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Stream Key</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 truncate font-mono text-xs text-zinc-400">
                        {"•".repeat(20)}
                      </code>
                      <button className="text-zinc-600 hover:text-white">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
