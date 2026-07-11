import type { DataStatus, StableErrorCode } from "@mcp-gen-ui/schema";

const PUBLIC_MESSAGES: Record<StableErrorCode, string> = {
  validation_error: "The request did not match the published tool contract.",
  not_found: "The requested benefit candidate was not found.",
  all_sources_failed: "No configured benefit source is currently available.",
  source_unavailable: "A configured benefit source is currently unavailable.",
  configuration_error: "The gateway runtime configuration is invalid.",
  unsupported_schema_version: "The requested schema version is not supported.",
  internal_error: "The gateway could not complete the request."
};

/** Domain failure safe to translate into a stable MCP error response. */
export class GatewayError extends Error {
  readonly code: StableErrorCode;
  readonly retryable: boolean;
  readonly dataStatus?: DataStatus;

  constructor(
    code: StableErrorCode,
    options: { retryable?: boolean; dataStatus?: DataStatus } = {}
  ) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "GatewayError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.dataStatus = options.dataStatus;
  }
}

export function isGatewayError(value: unknown): value is GatewayError {
  return value instanceof GatewayError;
}
