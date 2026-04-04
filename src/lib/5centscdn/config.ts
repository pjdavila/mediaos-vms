import { FiveCentsCdnClient } from "./client.js";

export interface CdnConfig {
  apiKey: string;
  baseUrl: string;
  vodZoneId: number;
  ftpHost: string;
  ftpUser: string;
  ftpPass: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Endpoint?: string;
  s3Bucket?: string;
}

export function loadCdnConfig(): CdnConfig {
  const apiKey = requireEnv("FIVE_CENTS_CDN_API_KEY");
  const vodZoneId = Number(requireEnv("FIVE_CENTS_CDN_VOD_ZONE_ID"));

  return {
    apiKey,
    baseUrl:
      process.env.FIVE_CENTS_CDN_BASE_URL ??
      "https://api.5centscdn.com/v2",
    vodZoneId,
    // FTP — optional if S3 is configured
    ftpHost: process.env.FIVE_CENTS_CDN_VOD_FTP_HOST ?? "",
    ftpUser: process.env.FIVE_CENTS_CDN_VOD_FTP_USER ?? "",
    ftpPass: process.env.FIVE_CENTS_CDN_VOD_FTP_PASS ?? "",
    // S3 — preferred over FTP
    s3AccessKey: process.env.FIVE_CENTS_CDN_S3_ACCESS_KEY,
    s3SecretKey: process.env.FIVE_CENTS_CDN_S3_SECRET_KEY,
    s3Endpoint: process.env.FIVE_CENTS_CDN_S3_ENDPOINT,
    s3Bucket: process.env.FIVE_CENTS_CDN_S3_BUCKET,
  };
}

export function createClient(config: CdnConfig): FiveCentsCdnClient {
  return new FiveCentsCdnClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
