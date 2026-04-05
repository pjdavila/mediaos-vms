"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Grid3X3, List, Trash2, Send, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VideoCard } from "@/components/dashboard/video-card";
import { cn } from "@/lib/utils";
import { api, type Video } from "@/lib/api";

const filters = ["All", "Ready", "Processing", "Failed"];

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const statusFilter = activeFilter === "All" ? undefined : activeFilter.toLowerCase();
      const result = await api.videos.list({
        status: statusFilter,
        search: search || undefined,
      });
      setVideos(result.items);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, search]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleDelete = async () => {
    for (const id of selected) {
      try {
        await api.videos.delete(id);
      } catch (err) {
        console.error(`Failed to delete video ${id}:`, err);
      }
    }
    setSelected(new Set());
    fetchVideos();
  };

  const filteredVideos = videos;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold tracking-tight">Video Library</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {total} videos in your library
        </p>
      </motion.div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos..."
            className="h-9 rounded-xl border-white/[0.06] bg-white/[0.04] pl-9 text-sm text-white placeholder:text-zinc-600"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                activeFilter === f
                  ? "bg-white/[0.08] text-white"
                  : "text-zinc-500 hover:text-white"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "rounded-lg p-1.5 transition-all",
              viewMode === "grid"
                ? "bg-white/[0.08] text-white"
                : "text-zinc-500 hover:text-white"
            )}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "rounded-lg p-1.5 transition-all",
              viewMode === "list"
                ? "bg-white/[0.08] text-white"
                : "text-zinc-500 hover:text-white"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass flex items-center gap-3 rounded-2xl p-3"
        >
          <span className="text-sm font-medium text-zinc-400">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-white/[0.1]" />
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-zinc-400 hover:text-white"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" /> Distribute
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-zinc-400 hover:text-white"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-red-400 hover:text-red-300"
            onClick={handleDelete}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-zinc-600 hover:text-white"
          >
            Clear
          </button>
        </motion.div>
      )}

      {/* Video grid */}
      <div
        className={cn(
          "grid gap-4",
          viewMode === "grid"
            ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "grid-cols-1"
        )}
      >
        {filteredVideos.map((video, i) => (
          <div key={video.id} className="relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                toggleSelect(video.id);
              }}
              className={cn(
                "absolute left-3 top-3 z-20 flex h-5 w-5 items-center justify-center rounded-md border transition-all",
                selected.has(video.id)
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-white/[0.15] bg-black/40 text-transparent hover:border-white/30"
              )}
            >
              {selected.has(video.id) && (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <VideoCard video={video} index={i} />
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
        </div>
      )}

      {!loading && filteredVideos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
            <Search className="h-8 w-8 text-zinc-700" />
          </div>
          <p className="text-sm font-medium text-zinc-400">No videos found</p>
          <p className="mt-1 text-xs text-zinc-600">
            {total === 0 ? "Upload your first video to get started" : "Try adjusting your search or filters"}
          </p>
        </div>
      )}
    </div>
  );
}
