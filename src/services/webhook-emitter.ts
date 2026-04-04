export interface WebhookPayload {
  event: "metadata.ready" | "metadata.failed";
  videoId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
}

let _webhookConfigs: WebhookConfig[] = [];

export function registerWebhook(config: WebhookConfig): void {
  _webhookConfigs.push(config);
}

export function clearWebhooks(): void {
  _webhookConfigs = [];
}

export function getWebhooks(): WebhookConfig[] {
  return [..._webhookConfigs];
}

/**
 * Emit a webhook event to all registered endpoints.
 * Fire-and-forget — failures are logged but never block the caller.
 */
export async function emitWebhook(payload: WebhookPayload): Promise<void> {
  const configs = getWebhooks();

  // Also check for a global env-configured webhook
  const envUrl = process.env.WEBHOOK_URL;
  if (envUrl) {
    configs.push({ url: envUrl, secret: process.env.WEBHOOK_SECRET });
  }

  if (configs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    configs.map(async (config) => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (config.secret) {
          headers["X-Webhook-Secret"] = config.secret;
        }

        const resp = await fetch(config.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });

        if (!resp.ok) {
          console.warn(
            `[webhook] ${config.url} returned ${resp.status} for ${payload.event} (video: ${payload.videoId})`
          );
        }
      } catch (err) {
        console.warn(
          `[webhook] Failed to deliver ${payload.event} to ${config.url}:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );
}
