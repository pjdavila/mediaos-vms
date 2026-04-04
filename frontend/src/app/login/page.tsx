"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, ArrowRight, Mail, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate login — wire to real auth later
    await new Promise((r) => setTimeout(r, 1000));
    window.location.href = "/dashboard";
  };

  return (
    <div className="animated-gradient relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Floating orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 100, 0], y: [0, -50, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, -80, 0], y: [0, 60, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, 80, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600/8 blur-[80px]"
        />
      </div>

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="glass-strong relative z-10 mx-4 w-full max-w-md rounded-3xl p-10"
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20"
          >
            <Zap className="h-7 w-7 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in to your VideoOS dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="h-11 rounded-xl border-white/[0.08] bg-white/[0.04] pl-10 text-white placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="h-11 rounded-xl border-white/[0.08] bg-white/[0.04] pl-10 text-white placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-white/[0.1] bg-white/[0.04]"
              />
              Remember me
            </label>
            <button type="button" className="text-xs text-blue-400 hover:text-blue-300">
              Forgot password?
            </button>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
              />
            ) : (
              <>
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-xs text-zinc-600">or</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>

        {/* Magic link */}
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl border-white/[0.08] bg-white/[0.02] text-sm text-zinc-400 hover:border-white/[0.15] hover:bg-white/[0.04] hover:text-white"
        >
          <Sparkles className="mr-2 h-4 w-4 text-violet-400" />
          Sign in with Magic Link
        </Button>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Don&apos;t have an account?{" "}
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            Request access
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
