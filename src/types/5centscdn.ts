export interface ApiResponse<T = unknown> {
  status: string;
  data: T;
  error?: { code: string; message: string };
}

export interface TranscodingProfile {
  id: number;
  name: string;
  format: string;
  cv: string; // video codec
  ca: string; // audio codec
  bv: number; // video bitrate enabled
  bvvalue: string;
  ba: number; // audio bitrate enabled
  bavalue: string;
  fps: number;
  crf: number;
  preset: string;
  outputdir: string;
  hlsmuxer: number;
}

export interface TranscodingJob {
  id: number;
  jobid: number;
  infile: string;
  outfile: string;
  percent: number;
  logs: string;
  errors: string;
  metadata: Record<string, unknown>;
  profilename: string;
  created_at: string;
  updated_at: string;
}

export interface CreateJobResponse {
  result: string;
  jobid: number;
}

export interface CreateProfileResponse {
  result: string;
  profileid: number;
}

export interface Zone {
  id: number;
  type: string;
  serviceid: number;
  alias: string;
  hashid: string;
  ssl: number;
  ftp_host: string;
  ftp_user: string;
  ftp_pass: string;
  playback_url_http: string;
  playback_url_hls: string;
  playback_url_dash: string;
  transcode_file_profiles: number[];
  webhook: string;
}

export interface PushStream {
  id: number;
  name: string;
  server: string;
  codec: string;
  protocols: string[];
  rtmp_url: string;
  hls_url: string;
  dash_url: string;
  disabled: number;
  platforms: StreamPlatform[];
}

export interface StreamPlatform {
  id: number;
  name: string;
  rtmp_url: string;
  auth_key: string;
}

export interface StreamStatistics {
  transcode_status: string;
  bitrate: number;
  fps: number;
  cpu_usage: number;
  memory_usage: number;
}

export interface CreateProfileParams {
  name: string;
  format?: string;
  cv?: string;
  ca?: string;
  bv?: number;
  bvvalue?: string;
  ba?: number;
  bavalue?: string;
  fps?: number;
  crf?: number;
  preset?: string;
  outputdir?: string;
  hlsmuxer?: number;
}

export interface CreateJobParams {
  file: string;
  priority?: number;
  video?: { resolution?: string; codec?: string };
  audio?: { format?: string; bitrate?: string };
  subtitle?: { language?: string; format?: string };
}

export interface CreateStreamParams {
  name: string;
  server?: string;
  codec?: string;
  protocols?: string[];
}
