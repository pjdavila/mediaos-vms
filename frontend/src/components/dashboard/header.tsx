"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Bell, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export function Header() {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#0a0a0a]/80 px-8 backdrop-blur-xl">
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search videos, streams, channels..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="h-9 w-full rounded-xl border-white/[0.06] bg-white/[0.04] pl-9 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500/50 focus:bg-white/[0.06] focus:ring-1 focus:ring-blue-500/20"
        />
        <motion.div
          initial={false}
          animate={{ opacity: searchFocused ? 1 : 0 }}
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            boxShadow: "0 0 20px rgba(59, 130, 246, 0.1)",
          }}
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/upload">
          <Button
            size="sm"
            className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-medium text-white hover:from-blue-500 hover:to-violet-500"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Upload
          </Button>
        </Link>

        <button className="relative flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-500" />
        </button>

        <Avatar className="h-8 w-8 cursor-pointer border border-white/[0.1]">
          <AvatarFallback className="bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold text-white">
            V
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
