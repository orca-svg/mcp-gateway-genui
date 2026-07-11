import { describe, expect, it, vi } from "vitest";
import {
  AdapterTransportError,
  fetchAdapterResource,
  type AdapterTransportRequest
} from "./transport.js";

const ENDPOINT = "https://api.example.test/benefits?serviceKey=runtime-secret";

function request(
  overrides: Partial<AdapterTransportRequest> = {}
): AdapterTransportRequest {
  return {
    endpoint: ENDPOINT,
    allowedOrigins: ["https://api.example.test"],
    allowedContentTypes: ["application/json"],
    timeoutMs: 1_000,
    maxRetries: 0,
    retryDelayMs: 0,
    maxPayloadBytes: 1_024,
    now: () => new Date("2026-07-10T00:00:00.000Z"),
    ...overrides
  };
}

async function captureError(
  promise: Promise<unknown>,
  code: AdapterTransportError["code"]
): Promise<AdapterTransportError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AdapterTransportError);
    expect(error).toMatchObject({ code });
    return error as AdapterTransportError;
  }
  throw new Error("Expected adapter transport request to fail.");
}

describe("fetchAdapterResource", () => {
  it("returns a bounded allowlisted response with normalized metadata", async () => {
    const fetch = vi.fn(async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "Application/JSON; charset=utf-8" }
      })
    );

    const response = await fetchAdapterResource(
      request({ fetch: fetch as typeof globalThis.fetch })
    );

    expect(response).toEqual({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
      retrievedAt: "2026-07-10T00:00:00.000Z"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "manual",
      signal: expect.any(AbortSignal)
    });
  });

  it.each([429, 502, 503, 504])(
    "retries retryable HTTP %s responses and then succeeds",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(
          new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );

      await expect(
        fetchAdapterResource(
          request({
            fetch: fetch as typeof globalThis.fetch,
            maxRetries: 1
          })
        )
      ).resolves.toMatchObject({ status: 200, body: "{}" });
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  );

  it("bounds retries for network failures", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(`network failure for ${ENDPOINT}`);
    });

    const error = await captureError(
      fetchAdapterResource(
        request({
          fetch: fetch as typeof globalThis.fetch,
          maxRetries: 2
        })
      ),
      "unavailable"
    );

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(error)).not.toContain("runtime-secret");
  });

  it("bounds retries for retryable HTTP failures", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));

    await captureError(
      fetchAdapterResource(
        request({
          fetch: fetch as typeof globalThis.fetch,
          maxRetries: 3
        })
      ),
      "unavailable"
    );

    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not retry non-retryable HTTP failures", async () => {
    const fetch = vi.fn(async () => new Response("secret body", { status: 500 }));

    await captureError(
      fetchAdapterResource(
        request({ fetch: fetch as typeof globalThis.fetch, maxRetries: 3 })
      ),
      "http_error"
    );

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("enforces the request timeout even when fetch ignores its signal", async () => {
    const fetch = vi.fn(
      () => new Promise<Response>(() => undefined)
    );

    await captureError(
      fetchAdapterResource(
        request({
          fetch: fetch as typeof globalThis.fetch,
          timeoutMs: 10,
          maxRetries: 3
        })
      ),
      "timeout"
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honors caller aborts without retrying", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      () => new Promise<Response>(() => undefined)
    );

    const pending = fetchAdapterResource(
      request({
        fetch: fetch as typeof globalThis.fetch,
        signal: controller.signal,
        maxRetries: 3
      })
    );
    controller.abort();

    await captureError(pending, "unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honors caller aborts while streaming the response body", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode("partial"));
      }
    });
    const fetch = vi.fn(async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const pending = fetchAdapterResource(
      request({
        fetch: fetch as typeof globalThis.fetch,
        signal: controller.signal,
        maxRetries: 3
      })
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await captureError(pending, "unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("applies the overall timeout while waiting to retry", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));

    await captureError(
      fetchAdapterResource(
        request({
          fetch: fetch as typeof globalThis.fetch,
          timeoutMs: 10,
          retryDelayMs: 100,
          maxRetries: 3
        })
      ),
      "timeout"
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects content types outside the allowlist without exposing the body", async () => {
    const fetch = vi.fn(async () =>
      new Response("upstream-secret-body", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      })
    );

    const error = await captureError(
      fetchAdapterResource(
        request({ fetch: fetch as typeof globalThis.fetch })
      ),
      "invalid_content_type"
    );
    expect(JSON.stringify(error)).not.toContain("upstream-secret-body");
  });

  it("rejects an oversized declared Content-Length before consuming it", async () => {
    const fetch = vi.fn(async () =>
      new Response("small", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "11"
        }
      })
    );

    await captureError(
      fetchAdapterResource(
        request({
          fetch: fetch as typeof globalThis.fetch,
          maxPayloadBytes: 10
        })
      ),
      "payload_too_large"
    );
  });

  it.each([undefined, "3"])(
    "enforces the streamed payload cap when Content-Length is %s",
    async (contentLength) => {
      const chunks = [
        new TextEncoder().encode("123456"),
        new TextEncoder().encode("789012")
      ];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        }
      });
      const headers = new Headers({ "Content-Type": "application/json" });
      if (contentLength !== undefined) headers.set("Content-Length", contentLength);
      const fetch = vi.fn(async () =>
        new Response(stream, { status: 200, headers })
      );

      await captureError(
        fetchAdapterResource(
          request({
            fetch: fetch as typeof globalThis.fetch,
            maxPayloadBytes: 10
          })
        ),
        "payload_too_large"
      );
    }
  );

  it.each([
    "http://api.example.test/benefits",
    "https://unknown.example.test/benefits"
  ])("rejects non-HTTPS or unregistered endpoint %s", async (endpoint) => {
    const fetch = vi.fn();

    await captureError(
      fetchAdapterResource(
        request({ endpoint, fetch: fetch as typeof globalThis.fetch })
      ),
      "invalid_configuration"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a retry count above the hard transport bound", async () => {
    const fetch = vi.fn();

    await captureError(
      fetchAdapterResource(
        request({ maxRetries: 4, fetch: fetch as typeof globalThis.fetch })
      ),
      "invalid_configuration"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a configured payload cap above the hard safety bound", async () => {
    const fetch = vi.fn();

    await captureError(
      fetchAdapterResource(
        request({
          maxPayloadBytes: 16 * 1024 * 1024 + 1,
          fetch: fetch as typeof globalThis.fetch
        })
      ),
      "invalid_configuration"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("redacts endpoint keys, upstream errors, bodies, and stacks", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(
        `${ENDPOINT} failed with body=upstream-secret-body and stack=internal-stack`
      );
    });

    const error = await captureError(
      fetchAdapterResource(
        request({ fetch: fetch as typeof globalThis.fetch })
      ),
      "unavailable"
    );
    const serialized = `${String(error)} ${JSON.stringify(error)} ${error.stack ?? ""}`;

    expect(serialized).not.toContain("runtime-secret");
    expect(serialized).not.toContain("upstream-secret-body");
    expect(serialized).not.toContain("internal-stack");
    expect(serialized).not.toContain("https://");
    expect(error.stack).toBeUndefined();
  });
});
