import * as ftp from "basic-ftp";
import * as path from "node:path";
import * as fs from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { CdnConfig } from "../lib/5centscdn/index.js";

export interface UploadResult {
  remotePath: string;
  filename: string;
  sizeBytes: number;
  hlsUrl?: string;
  zoneId?: string;
}

/**
 * Upload a video file to the 5CentsCDN VOD Push Zone.
 * Prefers S3-compatible API (HTTP) over FTP.
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

  // Try S3 first (preferred)
  if (config.s3AccessKey && config.s3SecretKey && config.s3Endpoint) {
    try {
      return await uploadViaS3(localFilePath, config, filename, remotePath, stat);
    } catch (err) {
      console.warn("[upload] S3 upload failed, falling back to FTP:", err);
      // Fall through to FTP
    }
  }

  // Fallback to FTP
  if (config.ftpHost && config.ftpUser && config.ftpPass) {
    return await uploadViaFtp(localFilePath, config, remotePath, stat);
  }

  throw new Error("No upload method available: neither S3 nor FTP credentials configured");
}

async function uploadViaS3(
  localFilePath: string,
  config: CdnConfig,
  filename: string,
  remotePath: string,
  stat: fs.Stats
): Promise<UploadResult> {
  const bucket = config.s3Bucket ?? String(config.vodZoneId);
  const endpoint = config.s3Endpoint?.replace(/\/$/, "") ?? "https://storage-na-01.5centscdn.com";

  const s3Client = new S3Client({
    region: "us-east-1",
    endpoint,
    credentials: {
      accessKeyId: config.s3AccessKey!,
      secretAccessKey: config.s3SecretKey!,
    },
    forcePathStyle: true, // Required for S3-compatible services
  });

  const fileBuffer = fs.readFileSync(localFilePath);
  const contentType = getMimeType(filename);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: remotePath,
      Body: fileBuffer,
      ContentType: contentType,
      ContentLength: stat.size,
    })
  );

  // Construct HLS URL — auto-transcode produces HLS in /{filename}/playlist.m3u8
  const hlsUrl = `https://${bucket}-hls-push.5centscdn.com/${stripExtension(filename)}/playlist.m3u8`;

  return {
    remotePath,
    filename,
    sizeBytes: stat.size,
    hlsUrl,
    zoneId: bucket,
  };
}

async function uploadViaFtp(
  localFilePath: string,
  config: CdnConfig,
  remotePath: string,
  stat: fs.Stats
): Promise<UploadResult> {
  const client = new ftp.Client();

  try {
    await client.access({
      host: config.ftpHost,
      user: config.ftpUser,
      password: config.ftpPass,
      secure: false,
    });

    await client.ensureDir("/raw");
    await client.uploadFrom(localFilePath, remotePath);

    return {
      remotePath,
      filename: path.basename(localFilePath),
      sizeBytes: stat.size,
    };
  } finally {
    client.close();
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.substring(0, dot) : filename;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".wmv": "video/x-ms-wmv",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".m4v": "video/x-m4v",
  };
  return mimeTypes[ext] ?? "application/octet-stream";
}
