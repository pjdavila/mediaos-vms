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

// API response wrapper from backend: { status: "ok", data: T }
interface ApiResponse<T> {
  status: string;
  data: T;
  total?: number;
}

// Map backend VideoRecord to frontend Video
function mapVideo(v: BackendVideo): Video {
  return {
    id: v.videoId,
    title: v.title,
    description: v.description,
    status: v.status,
    duration: v.duration,
    thumbnailUrl: v.thumbnailUrl,
    url: v.hlsUrl,
    createdAt: v.createdAt ?? "",
    size: v.sizeBytes,
    format: v.format,
    resolution: v.resolution,
    views: v.views,
  };
}

interface BackendVideo {
  videoId: string;
  title: string;
  description?: string;
  filename: string;
  sizeBytes: number;
  hlsUrl?: string;
  thumbnailUrl?: string;
  status: "uploading" | "processing" | "ready" | "failed";
  duration?: number;
  resolution?: string;
  format?: string;
  userId?: string;
  views: number;
  createdAt?: string;
  updatedAt?: string;
}

export const api = {
  videos: {
    list: async (params?: { status?: string; search?: string }): Promise<{ items: Video[]; total: number }> => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.search) query.set("search", params.search);
      const qs = query.toString();
      const res = await apiFetch<ApiResponse<BackendVideo[]>>(`/api/videos${qs ? `?${qs}` : ""}`);
      return { items: (res.data || []).map(mapVideo), total: (res as any).total ?? 0 };
    },
    get: async (id: string): Promise<Video> => {
      const res = await apiFetch<ApiResponse<BackendVideo>>(`/api/videos/${id}`);
      return mapVideo(res.data);
    },
    update: async (id: string, data: Partial<Video>): Promise<Video> => {
      const res = await apiFetch<ApiResponse<BackendVideo>>(`/api/videos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return mapVideo(res.data);
    },
    delete: async (id: string): Promise<void> => {
      await apiFetch(`/api/videos/${id}`, { method: "DELETE" });
    },
    upload: (formData: FormData) =>
      fetch(`${API_BASE}/api/videos/upload`, { method: "POST", body: formData }),
  },
  streams: {
    list: () => apiFetch<ApiResponse<Stream[]>>("/api/streams").then((r) => r.data || []),
    create: (data: Partial<Stream>) =>
      apiFetch<ApiResponse<Stream>>("/api/streams", { method: "POST", body: JSON.stringify(data) }).then((r) => r.data),
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
