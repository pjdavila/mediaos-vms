import type { AdPodConfig, AdBreak } from "../schemas/ads.js";
import { listAdPodsForVideo, listAdPodsForChannel } from "./ad-store.js";

export interface VastRequest {
  videoId?: string;
  channelId?: string;
  position?: "pre-roll" | "mid-roll" | "post-roll";
  currentTimeSec?: number;
}

export interface VastAdBreak {
  position: string;
  offsetSec: number;
  maxDurationSec: number;
  maxAds: number;
  vastConfig: AdPodConfig["vast"];
}

export function resolveAdBreaks(req: VastRequest): VastAdBreak[] {
  let pods: AdPodConfig[] = [];

  if (req.videoId) {
    pods = listAdPodsForVideo(req.videoId);
  }
  if (pods.length === 0 && req.channelId) {
    pods = listAdPodsForChannel(req.channelId);
  }

  const breaks: VastAdBreak[] = [];
  for (const pod of pods) {
    for (const brk of pod.breaks) {
      if (req.position && brk.position !== req.position) continue;
      breaks.push({
        position: brk.position,
        offsetSec: brk.offsetSec ?? 0,
        maxDurationSec: brk.maxDurationSec,
        maxAds: brk.maxAds,
        vastConfig: pod.vast,
      });
    }
  }

  return breaks.sort((a, b) => a.offsetSec - b.offsetSec);
}

export function generateVastXml(adBreak: VastAdBreak, baseUrl: string): string {
  const version = adBreak.vastConfig.vastVersion ?? "4.2";
  const adId = `mediaos-${Date.now()}`;
  const skipOffset = adBreak.vastConfig.skipAfterSec
    ? ` skipoffset="${formatTime(adBreak.vastConfig.skipAfterSec)}"`
    : "";

  const tagUrl = adBreak.vastConfig.tagUrl;
  if (tagUrl) {
    return wrapperVast(version, adId, tagUrl);
  }

  return inlineVast(version, adId, adBreak, skipOffset, baseUrl);
}

function wrapperVast(version: string, adId: string, tagUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="${escapeXml(version)}">
  <Ad id="${escapeXml(adId)}">
    <Wrapper>
      <AdSystem>MediaOS Ad Server</AdSystem>
      <VASTAdTagURI><![CDATA[${tagUrl}]]></VASTAdTagURI>
      <Impression><![CDATA[]]></Impression>
    </Wrapper>
  </Ad>
</VAST>`;
}

function inlineVast(
  version: string,
  adId: string,
  adBreak: VastAdBreak,
  skipOffset: string,
  baseUrl: string
): string {
  const clickThrough = adBreak.vastConfig.clickThroughUrl
    ? `<ClickThrough><![CDATA[${adBreak.vastConfig.clickThroughUrl}]]></ClickThrough>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="${escapeXml(version)}">
  <Ad id="${escapeXml(adId)}">
    <InLine>
      <AdSystem>MediaOS Ad Server</AdSystem>
      <AdTitle>MediaOS ${escapeXml(adBreak.position)}</AdTitle>
      <Impression><![CDATA[${baseUrl}/api/ads/tracking/impression?ad=${adId}]]></Impression>
      <Creatives>
        <Creative>
          <Linear${skipOffset}>
            <Duration>${formatTime(adBreak.maxDurationSec)}</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[${baseUrl}/api/ads/tracking/start?ad=${adId}]]></Tracking>
              <Tracking event="firstQuartile"><![CDATA[${baseUrl}/api/ads/tracking/firstQuartile?ad=${adId}]]></Tracking>
              <Tracking event="midpoint"><![CDATA[${baseUrl}/api/ads/tracking/midpoint?ad=${adId}]]></Tracking>
              <Tracking event="thirdQuartile"><![CDATA[${baseUrl}/api/ads/tracking/thirdQuartile?ad=${adId}]]></Tracking>
              <Tracking event="complete"><![CDATA[${baseUrl}/api/ads/tracking/complete?ad=${adId}]]></Tracking>
            </TrackingEvents>
            <VideoClicks>
              ${clickThrough}
              <ClickTracking><![CDATA[${baseUrl}/api/ads/tracking/click?ad=${adId}]]></ClickTracking>
            </VideoClicks>
            <MediaFiles/>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;
}

export function generateVastResponse(req: VastRequest, baseUrl: string): string {
  const breaks = resolveAdBreaks(req);

  if (breaks.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="4.2"/>`;
  }

  const adXmls = breaks.map((brk) => generateVastXml(brk, baseUrl));
  const version = breaks[0].vastConfig.vastVersion ?? "4.2";

  if (adXmls.length === 1) {
    return adXmls[0];
  }

  const innerAds = adXmls
    .map((xml) => {
      const match = xml.match(/<Ad[\s\S]*<\/Ad>/);
      return match ? match[0] : "";
    })
    .filter(Boolean)
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="${escapeXml(version)}">
  ${innerAds}
</VAST>`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
