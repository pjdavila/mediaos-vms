import * as ftp from "basic-ftp";
import * as path from "node:path";
import * as fs from "node:fs";
import type { CdnConfig } from "../lib/5centscdn/index.js";

export interface UploadResult {
  remotePath: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Upload a video file to the 5CentsCDN VOD Push Zone via FTP.
 * Uploading to /raw triggers auto-transcoding if a profile is configured.
 */
export async function uploadToVodZone(
  localFilePath: string,
  config: CdnConfig,
  options?: { remoteDir?: string }
): Promise<UploadResult> {
  const remoteDir = options?.remoteDir ?? "/raw";
  const filename = sanitizeFilename(path.basename(localFilePath));
  const remotePath = `${remoteDir}/${filename}`;

  const stat = fs.statSync(localFilePath);

  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === "development";

  try {
    await client.access({
      host: config.ftpHost,
      user: config.ftpUser,
      password: config.ftpPass,
      secure: false,
    });

    await client.ensureDir(remoteDir);
    await client.uploadFrom(localFilePath, remotePath);

    return {
      remotePath,
      filename,
      sizeBytes: stat.size,
    };
  } finally {
    client.close();
  }
}

/**
 * Replace spaces with underscores (5CentsCDN requirement) and remove
 * characters that could cause issues in FTP paths.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}
