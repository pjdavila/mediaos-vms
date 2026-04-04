"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Upload,
  Video,
  Radio,
  Send,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Upload, label: "Upload", href: "/dashboard/upload" },
  { icon: Video, label: "Videos", href: "/dashboard/videos" },
  { icon: Radio, label: "Streams", href: "/dashboard/streams" },
  { icon: Send, label: "Distribute", href: "/dashboard/distribute" },
];

const bottomItems = [
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 220 : 72 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/[0.06] bg-[#0d0d0d] py-6"
    >
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="text-lg font-bold tracking-tight whitespace-nowrap"
            >
              VideoOS
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-white/[0.08]"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <item.icon className={cn(
                "relative z-10 h-5 w-5 shrink-0 transition-colors",
                isActive ? "text-blue-400" : "text-zinc-500 group-hover:text-white"
              )} />
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="relative z-10 whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Bottom items */}
      <div className="mt-auto flex flex-col gap-1 px-3">
        {bottomItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <AnimatePresence>
              {expanded && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        ))}

        {/* Collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-600 transition-colors hover:text-white"
        >
          {expanded ? (
            <ChevronLeft className="h-5 w-5 shrink-0" />
          ) : (
            <ChevronRight className="h-5 w-5 shrink-0" />
          )}
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
