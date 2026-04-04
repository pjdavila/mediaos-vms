import * as crypto from "node:crypto";
import type { AdPodConfig, SsaiConfig } from "../schemas/ads.js";
import { listAdPodsForVideo, listAdPodsForChannel } from "./ad-store.js";

export interface SsaiSession {
  sessionId: string;
  videoId: string;
  channelId?: string;
  manifestUrl: string;
  adBreaks: SsaiAdMarker[];
  ssaiConfig: SsaiConfig;
  createdAt: string;
}

export interface SsaiAdMarker {
  position: string;
  offsetSec: number;
  durationSec: number;
  adPodId: string;
}

const sessions = new Map<string, SsaiSession>();

export function createSsaiSession(
  videoId: string,
  originalManifestUrl: string,
  channelId?: string
): SsaiSession | null {
  let pods: AdPodConfig[] = listAdPodsForVideo(videoId);
  if (pods.length === 0 && channelId) {
    pods = listAdPodsForChannel(channelId);
  }

  const ssaiPods = pods.filter((p) => p.ssai.mode !== "disabled");
  if (ssaiPods.length === 0) return null;

  const sessionId = crypto.randomUUID();
  const markers: SsaiAdMarker[] = [];

  for (const pod of ssaiPods) {
    for (const brk of pod.breaks) {
      markers.push({
        position: brk.position,
        offsetSec: brk.offsetSec ?? 0,
        durationSec: brk.maxDurationSec,
        adPodId: pod.adPodId!,
      });
    }
  }

  markers.sort((a, b) => a.offsetSec - b.offsetSec);

  const session: SsaiSession = {
    sessionId,
    videoId,
    channelId,
    manifestUrl: originalManifestUrl,
    adBreaks: markers,
    ssaiConfig: ssaiPods[0].ssai,
    createdAt: new Date().toISOString(),
  };

  sessions.set(sessionId, session);
  return session;
}

export function getSsaiSession(sessionId: string): SsaiSession | null {
  return sessions.get(sessionId) ?? null;
}

export function rewriteHlsManifest(
  manifest: string,
  session: SsaiSession,
  baseUrl: string
): string {
  const lines = manifest.split("\n");
  const output: string[] = [];

  let currentTimeSec = 0;
  const preRollMarkers = session.adBreaks.filter((m) => m.position === "pre-roll");
  const midRollMarkers = session.adBreaks.filter((m) => m.position === "mid-roll");
  const postRollMarkers = session.adBreaks.filter((m) => m.position === "post-roll");

  // Inject pre-roll markers at the start
  let preRollInjected = false;

  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      // Inject pre-roll before the first segment
      if (!preRollInjected && preRollMarkers.length > 0) {
        for (const marker of preRollMarkers) {
          output.push(
            `#EXT-X-DATERANGE:ID="ad-${marker.adPodId}",CLASS="com.mediaos.ad",START-DATE="${session.createdAt}",DURATION=${marker.durationSec},X-AD-POD-ID="${marker.adPodId}",X-AD-URL="${baseUrl}/api/ads/vast?videoId=${session.videoId}&position=pre-roll"`
          );
          output.push("#EXT-X-CUE-OUT:DURATION=" + marker.durationSec);
          output.push(line);
          preRollInjected = true;
          // Next segment after ad should have CUE-IN
        }
        continue;
      }

      // Parse segment duration for mid-roll timing
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      if (durationMatch) {
        const segDuration = parseFloat(durationMatch[1]);

        // Check if any mid-roll should fire at this time
        for (const marker of midRollMarkers) {
          if (
            currentTimeSec <= marker.offsetSec &&
            currentTimeSec + segDuration > marker.offsetSec
          ) {
            output.push(
              `#EXT-X-DATERANGE:ID="ad-${marker.adPodId}",CLASS="com.mediaos.ad",DURATION=${marker.durationSec},X-AD-POD-ID="${marker.adPodId}",X-AD-URL="${baseUrl}/api/ads/vast?videoId=${session.videoId}&position=mid-roll"`
            );
            output.push("#EXT-X-CUE-OUT:DURATION=" + marker.durationSec);
          }
        }

        currentTimeSec += segDuration;
      }
    }

    output.push(line);

    // Inject post-roll before #EXT-X-ENDLIST
    if (line.startsWith("#EXT-X-ENDLIST") && postRollMarkers.length > 0) {
      // Insert before the ENDLIST line
      const endList = output.pop()!;
      for (const marker of postRollMarkers) {
        output.push(
          `#EXT-X-DATERANGE:ID="ad-${marker.adPodId}",CLASS="com.mediaos.ad",DURATION=${marker.durationSec},X-AD-POD-ID="${marker.adPodId}",X-AD-URL="${baseUrl}/api/ads/vast?videoId=${session.videoId}&position=post-roll"`
        );
        output.push("#EXT-X-CUE-OUT:DURATION=" + marker.durationSec);
      }
      output.push(endList);
    }
  }

  return output.join("\n");
}

export function cleanupExpiredSessions(maxAgeSec: number = 3600): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    const age = (now - new Date(session.createdAt).getTime()) / 1000;
    if (age > maxAgeSec) {
      sessions.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}
