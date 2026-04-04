const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://mediaos-vms.onrender.com";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  videos: {
    list: () => apiFetch<Video[]>("/api/videos"),
    get: (id: string) => apiFetch<Video>(`/api/videos/${id}`),
    upload: (formData: FormData) =>
      fetch(`${API_BASE}/api/videos/upload`, { method: "POST", body: formData }),
  },
  streams: {
    list: () => apiFetch<Stream[]>("/api/streams"),
    create: (data: Partial<Stream>) =>
      apiFetch<Stream>("/api/streams", { method: "POST", body: JSON.stringify(data) }),
  },
};

export interface Video {
  id: string;
  title: string;
  description?: string;
  status: "processing" | "ready" | "failed" | "uploading";
  duration?: number;
  thumbnailUrl?: string;
  url?: string;
  createdAt: string;
  size?: number;
  format?: string;
  resolution?: string;
  views?: number;
  channels?: string[];
}

export interface Stream {
  id: string;
  title: string;
  status: "live" | "offline" | "starting" | "ending";
  viewers?: number;
  startedAt?: string;
  rtmpUrl?: string;
  streamKey?: string;
}
