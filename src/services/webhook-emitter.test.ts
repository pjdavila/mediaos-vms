import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerWebhook,
  clearWebhooks,
  getWebhooks,
  emitWebhook,
  type WebhookPayload,
} from "./webhook-emitter.js";

describe("webhook-emitter", () => {
  beforeEach(() => {
    clearWebhooks();
    delete process.env.WEBHOOK_URL;
    delete process.env.WEBHOOK_SECRET;
  });

  afterEach(() => {
    clearWebhooks();
    delete process.env.WEBHOOK_URL;
    delete process.env.WEBHOOK_SECRET;
    vi.restoreAllMocks();
  });

  it("registers and lists webhooks", () => {
    registerWebhook({ url: "https://example.com/hook" });
    registerWebhook({ url: "https://other.com/hook", secret: "s3cret" });
    const hooks = getWebhooks();
    expect(hooks).toHaveLength(2);
    expect(hooks[0].url).toBe("https://example.com/hook");
    expect(hooks[1].secret).toBe("s3cret");
  });

  it("clears all webhooks", () => {
    registerWebhook({ url: "https://example.com/hook" });
    clearWebhooks();
    expect(getWebhooks()).toHaveLength(0);
  });

  it("delivers payload to registered webhooks", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 })
    );

    registerWebhook({ url: "https://example.com/hook" });

    const payload: WebhookPayload = {
      event: "metadata.ready",
      videoId: "vid-1",
      timestamp: "2026-04-04T00:00:00Z",
    };

    await emitWebhook(payload);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  it("includes X-Webhook-Secret header when secret is set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 })
    );

    registerWebhook({ url: "https://example.com/hook", secret: "my-secret" });

    await emitWebhook({
      event: "metadata.ready",
      videoId: "vid-1",
      timestamp: "2026-04-04T00:00:00Z",
    });

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["X-Webhook-Secret"]).toBe("my-secret");
  });

  it("picks up WEBHOOK_URL from env", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 })
    );

    process.env.WEBHOOK_URL = "https://env-hook.com/callback";

    await emitWebhook({
      event: "metadata.failed",
      videoId: "vid-2",
      timestamp: "2026-04-04T00:00:00Z",
      error: "tagging failed",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://env-hook.com/callback",
      expect.anything()
    );
  });

  it("does not throw when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    registerWebhook({ url: "https://example.com/hook" });

    // Should not throw
    await emitWebhook({
      event: "metadata.failed",
      videoId: "vid-3",
      timestamp: "2026-04-04T00:00:00Z",
    });
  });

  it("does nothing when no webhooks are configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await emitWebhook({
      event: "metadata.ready",
      videoId: "vid-4",
      timestamp: "2026-04-04T00:00:00Z",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
