import { FiveCentsCdnClient } from "./client.js";

export interface CdnConfig {
  apiKey: string;
  baseUrl: string;
  vodZoneId: number;
  ftpHost: string;
  ftpUser: string;
  ftpPass: string;
}

export function loadCdnConfig(): CdnConfig {
  const apiKey = requireEnv("FIVE_CENTS_CDN_API_KEY");
  return {
    apiKey,
    baseUrl:
      process.env.FIVE_CENTS_CDN_BASE_URL ??
      "https://api.5centscdn.com/v2",
    vodZoneId: Number(requireEnv("FIVE_CENTS_CDN_VOD_ZONE_ID")),
    ftpHost: requireEnv("FIVE_CENTS_CDN_VOD_FTP_HOST"),
    ftpUser: requireEnv("FIVE_CENTS_CDN_VOD_FTP_USER"),
    ftpPass: requireEnv("FIVE_CENTS_CDN_VOD_FTP_PASS"),
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
