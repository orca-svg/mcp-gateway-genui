const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 5_000;

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

export const ADAPTER_TRANSPORT_ERROR_CODES = [
  "timeout",
  "unavailable",
  "invalid_content_type",
  "payload_too_large",
  "invalid_configuration",
  "http_error"
] as const;

export type AdapterTransportErrorCode =
  (typeof ADAPTER_TRANSPORT_ERROR_CODES)[number];

const ERROR_MESSAGES: Record<AdapterTransportErrorCode, string> = {
  timeout: "Adapter request timed out.",
  unavailable: "Adapter source is unavailable.",
  invalid_content_type: "Adapter response content type is not allowed.",
  payload_too_large: "Adapter response exceeded the payload limit.",
  invalid_configuration: "Adapter transport configuration is invalid.",
  http_error: "Adapter source returned an HTTP error."
};

/**
 * Stable, public-safe adapter transport failure.
 *
 * It intentionally retains no cause or stack because upstream errors can embed
 * full request URLs (including API keys), response bodies, or internal details.
 */
export class AdapterTransportError extends Error {
  readonly code: AdapterTransportErrorCode;

  constructor(code: AdapterTransportErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AdapterTransportError";
    this.code = code;
    this.stack = undefined;
  }

  toJSON(): {
    name: "AdapterTransportError";
    code: AdapterTransportErrorCode;
    message: string;
  } {
    return {
      name: "AdapterTransportError",
      code: this.code,
      message: this.message
    };
  }
}

export interface AdapterTransportRequest {
  endpoint: string | URL;
  allowedOrigins: readonly (string | URL)[];
  allowedContentTypes: readonly string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  maxPayloadBytes?: number;
  headers?: HeadersInit;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}

export interface AdapterTransportResponse {
  status: number;
  contentType: string;
  body: string;
  retrievedAt: string;
}

interface NormalizedTransportRequest {
  endpoint: URL;
  allowedContentTypes: Set<string>;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  maxPayloadBytes: number;
  headers: Headers;
  fetch: typeof globalThis.fetch;
  now: () => Date;
  signal?: AbortSignal;
}

interface AbortContext {
  controller: AbortController;
  didTimeout: () => boolean;
  didCallerAbort: () => boolean;
  dispose: () => void;
}

/**
 * Fetches a text payload through the common adapter safety boundary.
 *
 * The request is GET-only and redirects are not followed, so an allowed HTTPS
 * origin cannot redirect the transport to an unregistered source.
 */
export async function fetchAdapterResource(
  request: AdapterTransportRequest
): Promise<AdapterTransportResponse> {
  const normalized = normalizeRequest(request);
  const abortContext = createAbortContext(normalized.signal, normalized.timeoutMs);

  try {
    throwIfAborted(abortContext);

    for (let attempt = 0; attempt <= normalized.maxRetries; attempt += 1) {
      try {
        const response = await raceWithAbort(
          Promise.resolve().then(() =>
            normalized.fetch(normalized.endpoint, {
              method: "GET",
              headers: normalized.headers,
              redirect: "manual",
              signal: abortContext.controller.signal
            })
          ),
          abortContext.controller.signal
        );

        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          discardResponse(response);
          if (attempt === normalized.maxRetries) {
            throw new AdapterTransportError("unavailable");
          }
          await waitBeforeRetry(normalized.retryDelayMs, attempt, abortContext);
          continue;
        }

        if (!response.ok) {
          discardResponse(response);
          throw new AdapterTransportError("http_error");
        }

        const contentType = normalizedContentType(
          response.headers.get("content-type")
        );
        if (!contentType || !normalized.allowedContentTypes.has(contentType)) {
          discardResponse(response);
          throw new AdapterTransportError("invalid_content_type");
        }

        if (declaredPayloadTooLarge(response, normalized.maxPayloadBytes)) {
          discardResponse(response);
          throw new AdapterTransportError("payload_too_large");
        }

        const body = await readBoundedBody(
          response,
          normalized.maxPayloadBytes,
          abortContext.controller.signal
        );
        throwIfAborted(abortContext);

        const retrievedAt = safeRetrievedAt(normalized.now);
        return {
          status: response.status,
          contentType,
          body,
          retrievedAt
        };
      } catch (error) {
        if (error instanceof AdapterTransportError) throw error;
        throwIfAborted(abortContext);

        if (attempt === normalized.maxRetries) {
          throw new AdapterTransportError("unavailable");
        }
        await waitBeforeRetry(normalized.retryDelayMs, attempt, abortContext);
      }
    }

    throw new AdapterTransportError("unavailable");
  } finally {
    abortContext.dispose();
  }
}

function normalizeRequest(request: AdapterTransportRequest): NormalizedTransportRequest {
  if (!request || typeof request !== "object") {
    throw new AdapterTransportError("invalid_configuration");
  }

  const allowedOrigins = normalizeAllowedOrigins(request.allowedOrigins);
  const endpoint = normalizeEndpoint(request.endpoint, allowedOrigins);
  const allowedContentTypes = normalizeAllowedContentTypes(
    request.allowedContentTypes
  );
  const timeoutMs = boundedInteger(
    request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    1,
    MAX_TIMEOUT_MS
  );
  const maxRetries = boundedInteger(
    request.maxRetries ?? DEFAULT_MAX_RETRIES,
    0,
    MAX_RETRIES
  );
  const retryDelayMs = boundedInteger(
    request.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    0,
    MAX_RETRY_DELAY_MS
  );
  const maxPayloadBytes = boundedInteger(
    request.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES,
    1,
    MAX_PAYLOAD_BYTES
  );

  let headers: Headers;
  try {
    headers = new Headers(request.headers);
  } catch {
    throw new AdapterTransportError("invalid_configuration");
  }

  const fetchImpl = request.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new AdapterTransportError("invalid_configuration");
  }

  if (request.signal !== undefined && !isAbortSignal(request.signal)) {
    throw new AdapterTransportError("invalid_configuration");
  }

  if (request.now !== undefined && typeof request.now !== "function") {
    throw new AdapterTransportError("invalid_configuration");
  }

  return {
    endpoint,
    allowedContentTypes,
    timeoutMs,
    maxRetries,
    retryDelayMs,
    maxPayloadBytes,
    headers,
    fetch: fetchImpl,
    now: request.now ?? (() => new Date()),
    signal: request.signal
  };
}

function normalizeAllowedOrigins(
  configuredOrigins: readonly (string | URL)[]
): Set<string> {
  if (!Array.isArray(configuredOrigins) || configuredOrigins.length === 0) {
    throw new AdapterTransportError("invalid_configuration");
  }

  const origins = new Set<string>();
  for (const configuredOrigin of configuredOrigins) {
    let origin: URL;
    try {
      origin = new URL(configuredOrigin);
    } catch {
      throw new AdapterTransportError("invalid_configuration");
    }

    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      throw new AdapterTransportError("invalid_configuration");
    }
    origins.add(origin.origin);
  }
  return origins;
}

function normalizeEndpoint(endpointValue: string | URL, allowedOrigins: Set<string>): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new AdapterTransportError("invalid_configuration");
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    !allowedOrigins.has(endpoint.origin)
  ) {
    throw new AdapterTransportError("invalid_configuration");
  }

  endpoint.hash = "";
  return endpoint;
}

function normalizeAllowedContentTypes(configuredContentTypes: readonly string[]): Set<string> {
  if (!Array.isArray(configuredContentTypes) || configuredContentTypes.length === 0) {
    throw new AdapterTransportError("invalid_configuration");
  }

  const contentTypes = new Set<string>();
  for (const configuredContentType of configuredContentTypes) {
    if (typeof configuredContentType !== "string") {
      throw new AdapterTransportError("invalid_configuration");
    }
    const contentType = normalizedContentType(configuredContentType);
    if (!contentType || !isMediaType(contentType)) {
      throw new AdapterTransportError("invalid_configuration");
    }
    contentTypes.add(contentType);
  }
  return contentTypes;
}

function normalizedContentType(value: string | null): string | undefined {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType || undefined;
}

function isMediaType(value: string): boolean {
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value);
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AdapterTransportError("invalid_configuration");
  }
  return value;
}

function createAbortContext(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number
): AbortContext {
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;

  const onCallerAbort = () => {
    if (controller.signal.aborted) return;
    callerAborted = true;
    controller.abort();
  };

  if (callerSignal?.aborted) {
    callerAborted = true;
    controller.abort();
  } else {
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  }

  const timeoutHandle = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    didTimeout: () => timedOut,
    didCallerAbort: () => callerAborted,
    dispose: () => {
      clearTimeout(timeoutHandle);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  };
}

function throwIfAborted(context: AbortContext): void {
  if (context.didTimeout()) {
    throw new AdapterTransportError("timeout");
  }
  if (context.didCallerAbort() || context.controller.signal.aborted) {
    throw new AdapterTransportError("unavailable");
  }
}

async function waitBeforeRetry(
  baseDelayMs: number,
  attempt: number,
  abortContext: AbortContext
): Promise<void> {
  throwIfAborted(abortContext);
  const delayMs = Math.min(baseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
  if (delayMs === 0) return;

  try {
    await delayWithAbort(delayMs, abortContext.controller.signal);
  } catch {
    throwIfAborted(abortContext);
    throw new AdapterTransportError("unavailable");
  }
}

function declaredPayloadTooLarge(response: Response, maximumBytes: number): boolean {
  const contentLength = response.headers.get("content-length")?.trim();
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;

  try {
    return BigInt(contentLength) > BigInt(maximumBytes);
  } catch {
    return false;
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal);
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        void reader.cancel().catch(() => undefined);
        throw new AdapterTransportError("payload_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled stream may still have a pending read in a non-compliant
      // fetch implementation. Never replace the stable transport failure.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function safeRetrievedAt(now: () => Date): string {
  let date: Date;
  try {
    date = now();
  } catch {
    throw new AdapterTransportError("invalid_configuration");
  }
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new AdapterTransportError("invalid_configuration");
  }
  return date.toISOString();
}

function discardResponse(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function" &&
    typeof (value as AbortSignal).removeEventListener === "function"
  );
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new InternalAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new InternalAbortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function delayWithAbort(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new InternalAbortError());

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(handle);
      cleanup();
      reject(new InternalAbortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const handle = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

class InternalAbortError extends Error {}
