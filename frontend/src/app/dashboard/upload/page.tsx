"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Cloud,
  File,
  X,
  Check,
  Settings2,
  ChevronDown,
  ChevronUp,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UploadFile {
  file: File;
  progress: number;
  status: "waiting" | "uploading" | "complete" | "error";
  previewUrl?: string;
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const uploads: UploadFile[] = Array.from(newFiles).map((file) => ({
      file,
      progress: 0,
      status: "waiting" as const,
      previewUrl: file.type.startsWith("video/") ? URL.createObjectURL(file) : undefined,
    }));
    setFiles((prev) => [...prev, ...uploads]);

    // Simulate upload progress
    uploads.forEach((upload, i) => {
      setTimeout(() => {
        const interval = setInterval(() => {
          setFiles((prev) =>
            prev.map((f) => {
              if (f.file !== upload.file) return f;
              const newProgress = Math.min(f.progress + Math.random() * 15, 100);
              return {
                ...f,
                progress: newProgress,
                status: newProgress >= 100 ? "complete" : "uploading",
              };
            })
          );
        }, 300);
        setTimeout(() => clearInterval(interval), 8000);
      }, i * 500);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold tracking-tight">Upload</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload videos to your library for processing and distribution.
        </p>
      </motion.div>

      {/* Dropzone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "glass group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-16 text-center transition-all duration-300",
          isDragging
            ? "border-blue-500/50 bg-blue-500/5"
            : "border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02]"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Animated background glow */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-violet-500/5"
            />
          )}
        </AnimatePresence>

        <div className="relative z-10">
          <motion.div
            animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]"
          >
            <Cloud
              className={cn(
                "h-8 w-8 transition-colors",
                isDragging ? "text-blue-400" : "text-zinc-600"
              )}
            />
          </motion.div>
          <p className="text-lg font-semibold text-white">
            {isDragging ? "Drop your videos here" : "Drag and drop videos"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            or click to browse. Supports MP4, MOV, AVI, WebM up to 10GB
          </p>
        </div>
      </motion.div>

      {/* File list */}
      <AnimatePresence mode="popLayout">
        {files.map((upload, i) => (
          <motion.div
            key={`${upload.file.name}-${i}`}
            initial={{ opacity: 0, height: 0, y: 20 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="glass overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-4 p-5">
              {/* Preview */}
              <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-900">
                {upload.previewUrl ? (
                  <video src={upload.previewUrl} className="h-full w-full object-cover" />
                ) : (
                  <Film className="h-6 w-6 text-zinc-700" />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {upload.file.name}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {(upload.file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
                <div className="mt-2">
                  <Progress
                    value={upload.progress}
                    className="h-1.5 bg-white/[0.04] [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-violet-500"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="flex shrink-0 items-center gap-2">
                {upload.status === "complete" ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10"
                  >
                    <Check className="h-4 w-4 text-emerald-400" />
                  </motion.div>
                ) : (
                  <span className="text-xs font-medium text-zinc-500">
                    {Math.round(upload.progress)}%
                  </span>
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-white/[0.04] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Advanced config */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl"
      >
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-3">
            <Settings2 className="h-5 w-5 text-zinc-500" />
            <span className="text-sm font-semibold">Advanced Configuration</span>
          </div>
          {showAdvanced ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          )}
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 border-t border-white/[0.06] p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Output Format
                    </label>
                    <Input
                      placeholder="Auto (MP4 / HLS)"
                      className="h-10 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Resolution
                    </label>
                    <Input
                      placeholder="Original"
                      className="h-10 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Bitrate (Mbps)
                    </label>
                    <Input
                      placeholder="Auto"
                      className="h-10 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Watermark
                    </label>
                    <Input
                      placeholder="None"
                      className="h-10 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Upload button */}
      {files.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end"
        >
          <Button className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-8 text-sm font-semibold text-white hover:from-blue-500 hover:to-violet-500">
            <Upload className="mr-2 h-4 w-4" />
            Process {files.length} video{files.length > 1 ? "s" : ""}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
