import type {
  ApiResponse,
  Zone,
  TranscodingJob,
  TranscodingProfile,
  CreateJobResponse,
  CreateProfileResponse,
  CreateProfileParams,
  CreateJobParams,
  PushStream,
  StreamStatistics,
  CreateStreamParams,
} from "../../types/5centscdn.js";

export interface FiveCentsCdnConfig {
  apiKey: string;
  baseUrl?: string;
}

export class FiveCentsCdnClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: FiveCentsCdnConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.5centscdn.com/v2";
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string>; dataKey?: string }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "X-API-KEY": this.apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new FiveCentsCdnError(
        `${method} ${path} failed: ${res.status} ${res.statusText}`,
        res.status,
        text
      );
    }

    const json = await res.json() as Record<string, unknown>;

    // 5CentsCDN wraps responses: {result: "success", <dataKey>: <data>}
    // If a dataKey is specified, unwrap it. Otherwise return the raw response.
    if (options?.dataKey && options.dataKey in json) {
      return json[options.dataKey] as T;
    }

    return json as T;
  }

  // --- Zones ---

  async listZones(): Promise<Zone[]> {
    return this.request<Zone[]>("GET", "/zones", undefined, {
      dataKey: "zones",
    });
  }

  async getVodPushZone(zoneId: number): Promise<Zone> {
    return this.request<Zone>("GET", `/zones/http/push/${zoneId}`);
  }

  async createVodPushZone(params: {
    alias: string;
    server: string;
    profiles?: number[];
    webhook?: string;
  }): Promise<Zone> {
    return this.request<Zone>("POST", "/zones/vod/push", params);
  }

  async updateVodPushZone(
    zoneId: number,
    params: {
      alias?: string;
      server?: string;
      cnames?: string[];
      profiles?: number[];
      webhook?: string;
    }
  ): Promise<Zone> {
    return this.request<Zone>(
      "POST",
      `/zones/http/push/${zoneId}`,
      params
    );
  }

  // --- Transcoding Profiles ---

  async listProfiles(): Promise<Record<string, TranscodingProfile>> {
    return this.request<Record<string, TranscodingProfile>>(
      "GET",
      "/transcoding/file/profiles",
      undefined,
      { dataKey: "profiles" }
    );
  }

  async createProfile(
    params: CreateProfileParams
  ): Promise<CreateProfileResponse> {
    return this.request<CreateProfileResponse>(
      "POST",
      "/transcoding/file/profiles/new",
      params
    );
  }

  async updateProfile(
    profileId: number,
    params: Partial<CreateProfileParams>
  ): Promise<{ result: string }> {
    return this.request<{ result: string }>(
      "POST",
      `/transcoding/file/profiles/${profileId}`,
      params
    );
  }

  async deleteProfile(profileId: number): Promise<{ result: string }> {
    return this.request<{ result: string }>(
      "DELETE",
      `/transcoding/file/profiles/${profileId}`
    );
  }

  // --- Transcoding Jobs ---

  async listJobs(): Promise<TranscodingJob[]> {
    return this.request<TranscodingJob[]>("GET", "/transcoding/jobs", undefined, {
      dataKey: "jobs",
    });
  }

  async createJob(
    zoneId: number,
    profileId: number,
    params: CreateJobParams
  ): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>(
      "POST",
      `/transcoding/jobs/${zoneId}/${profileId}`,
      params
    );
  }

  async retryJob(jobId: number): Promise<void> {
    await this.request<unknown>("GET", `/transcoding/jobs/retry/${jobId}`);
  }

  async cancelJob(jobId: number): Promise<void> {
    await this.request<unknown>("GET", `/transcoding/jobs/cancel/${jobId}`);
  }

  // --- Live Streams ---

  async listStreams(): Promise<PushStream[]> {
    return this.request<PushStream[]>("GET", "/streams", undefined, {
      dataKey: "streams",
    });
  }

  async createPushStream(params: CreateStreamParams): Promise<PushStream> {
    return this.request<PushStream>("POST", "/streams/push/new", params);
  }

  async getPushStream(streamId: number): Promise<PushStream> {
    return this.request<PushStream>("GET", `/streams/push/${streamId}`);
  }

  async updatePushStreamStatus(
    streamId: number,
    disabled: boolean
  ): Promise<PushStream> {
    return this.request<PushStream>(
      "POST",
      `/streams/push/${streamId}/status`,
      { disabled: disabled ? "1" : "0" }
    );
  }

  async getStreamStatistics(streamId: number): Promise<StreamStatistics> {
    return this.request<StreamStatistics>(
      "GET",
      `/streams/push/${streamId}/statistics`
    );
  }

  async deletePushStream(streamId: number): Promise<{ result: string }> {
    return this.request<{ result: string }>(
      "DELETE",
      `/streams/push/${streamId}`
    );
  }
}

export class FiveCentsCdnError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody: string
  ) {
    super(message);
    this.name = "FiveCentsCdnError";
  }
}
