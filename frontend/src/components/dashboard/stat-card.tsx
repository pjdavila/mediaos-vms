"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  suffix?: string;
  prefix?: string;
  change?: number;
  icon: LucideIcon;
  gradient?: string;
}

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const motionValue = useMotionValue(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 1.5,
      ease: "easeOut",
    });
    const unsubscribe = motionValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = `${prefix}${Math.round(latest).toLocaleString()}${suffix}`;
      }
    });
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value, motionValue, prefix, suffix]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
}

export function StatCard({ title, value, suffix, prefix, change, icon: Icon, gradient }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="glass group relative overflow-hidden rounded-2xl p-6 transition-all duration-300"
    >
      {/* Subtle gradient glow on hover */}
      <div
        className={cn(
          "absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20",
          gradient || "bg-blue-500"
        )}
      />

      <div className="relative z-10 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {title}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
          </p>
          {change !== undefined && (
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                change >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {change >= 0 ? "+" : ""}
              {change}% vs last month
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
          <Icon className="h-5 w-5 text-zinc-400" />
        </div>
      </div>
    </motion.div>
  );
}
