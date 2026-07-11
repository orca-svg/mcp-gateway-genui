import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  McpError,
  type CallToolResult,
  type ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ApplicationGuideResponseSchema,
  BenefitSearchRequestSchema,
  BenefitSearchResponseV2Schema,
  BuildChecklistRequestSchema,
  ChecklistResponseSchema,
  GetApplicationGuideRequestSchema,
  GetBenefitDetailRequestSchema,
  GetBenefitDetailResponseSchema,
  GetChangeLogRequestSchema,
  GetChangeLogResponseSchema,
  ListPersonasRequestSchema,
  ListPersonasResponseSchema,
  StableMcpErrorSchema,
  ToolNameSchema,
  UpcomingDeadlinesRequestSchema,
  UpcomingDeadlinesResponseV2Schema,
  type StableMcpError,
  type ToolName
} from "@mcp-gen-ui/schema";
import {
  BenefitToolService,
  GatewayError,
  isGatewayError
} from "@mcp-gen-ui/core";

export type CreateGatewayMcpServerOptions = {
  service: BenefitToolService;
  version: string;
  now?: () => Date;
};

const OPEN_WORLD_READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};

const CLOSED_WORLD_READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

type ToolOperation = (input: unknown) => Promise<object>;
type ToolOperations = Record<ToolName, ToolOperation>;

/** Build the stdio-neutral MCP server with all seven complete tool contracts. */
export function createGatewayMcpServer(options: CreateGatewayMcpServerOptions): McpServer {
  const server = new McpServer({
    name: "mcp-gen-ui-gateway",
    version: options.version
  });
  const now = options.now ?? (() => new Date());
  const operations = toolOperations(options.service);

  server.registerTool(
    "searchBenefits",
    {
      description: "Discover and rank public-benefit candidates without deciding eligibility.",
      inputSchema: BenefitSearchRequestSchema,
      outputSchema: BenefitSearchResponseV2Schema,
      annotations: OPEN_WORLD_READ
    },
    async (input) =>
      invoke("searchBenefits", () => operations.searchBenefits(input), now)
  );

  server.registerTool(
    "getBenefitDetail",
    {
      description: "Return source-aware detail for one candidate.",
      inputSchema: GetBenefitDetailRequestSchema,
      outputSchema: GetBenefitDetailResponseSchema,
      annotations: OPEN_WORLD_READ
    },
    async (input) =>
      invoke("getBenefitDetail", () => operations.getBenefitDetail(input), now)
  );

  server.registerTool(
    "getUpcomingDeadlines",
    {
      description: "Return deadline-bearing candidates without excluding conflicts.",
      inputSchema: UpcomingDeadlinesRequestSchema,
      outputSchema: UpcomingDeadlinesResponseV2Schema,
      annotations: OPEN_WORLD_READ
    },
    async (input) =>
      invoke(
        "getUpcomingDeadlines",
        () => operations.getUpcomingDeadlines(input),
        now
      )
  );

  server.registerTool(
    "listPersonas",
    {
      description: "List transparent ranking-only persona presets.",
      inputSchema: ListPersonasRequestSchema,
      outputSchema: ListPersonasResponseSchema,
      annotations: CLOSED_WORLD_READ
    },
    async (input) =>
      invoke("listPersonas", () => operations.listPersonas(input), now)
  );

  server.registerTool(
    "buildChecklist",
    {
      description: "Build a source-linked preparation checklist for a candidate.",
      inputSchema: BuildChecklistRequestSchema,
      outputSchema: ChecklistResponseSchema,
      annotations: OPEN_WORLD_READ
    },
    async (input) =>
      invoke("buildChecklist", () => operations.buildChecklist(input), now)
  );

  server.registerTool(
    "getApplicationGuide",
    {
      description: "Return user-action-only guidance without login or submission automation.",
      inputSchema: GetApplicationGuideRequestSchema,
      outputSchema: ApplicationGuideResponseSchema,
      annotations: OPEN_WORLD_READ
    },
    async (input) =>
      invoke(
        "getApplicationGuide",
        () => operations.getApplicationGuide(input),
        now
      )
  );

  server.registerTool(
    "getChangeLog",
    {
      description: "Read paginated, source-scoped ingestion change events.",
      inputSchema: GetChangeLogRequestSchema,
      outputSchema: GetChangeLogResponseSchema,
      annotations: CLOSED_WORLD_READ
    },
    async (input) =>
      invoke("getChangeLog", () => operations.getChangeLog(input), now)
  );

  installStableToolDispatcher(server, operations, now);

  return server;
}

function toolOperations(service: BenefitToolService): ToolOperations {
  return {
    searchBenefits: (input) => service.searchBenefits(input),
    getBenefitDetail: (input) => service.getBenefitDetail(input),
    getUpcomingDeadlines: (input) => service.getUpcomingDeadlines(input),
    listPersonas: async (input) => {
      ListPersonasRequestSchema.parse(input);
      return service.listPersonas();
    },
    buildChecklist: (input) => service.buildChecklist(input),
    getApplicationGuide: (input) => service.getApplicationGuide(input),
    getChangeLog: (input) => service.getChangeLog(input)
  };
}

/**
 * The SDK validates registered Zod inputs before invoking a tool callback and
 * converts validation failures to unstructured text. Keep registerTool as the
 * tools/list source of truth, but route calls through the same service methods
 * so every expected failure uses the published stable JSON error envelope.
 */
function installStableToolDispatcher(
  server: McpServer,
  operations: ToolOperations,
  now: () => Date
): void {
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const parsedTool = ToolNameSchema.safeParse(request.params.name);
    if (!parsedTool.success) {
      throw new McpError(ErrorCode.InvalidParams, "Unknown tool.");
    }
    const tool = parsedTool.data;
    const input = request.params.arguments ?? {};
    return invoke(tool, () => operations[tool](input), now);
  });
}

async function invoke(
  tool: ToolName,
  operation: () => Promise<object>,
  now: () => Date
): Promise<CallToolResult> {
  try {
    return successResult(await operation());
  } catch (error) {
    return errorResult(tool, error, now);
  }
}

function successResult(value: object): CallToolResult {
  const structuredContent = value as Record<string, unknown>;
  return {
    structuredContent,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }]
  };
}

function errorResult(tool: ToolName, error: unknown, now: () => Date): CallToolResult {
  const gatewayError = isGatewayError(error)
    ? error
    : error instanceof z.ZodError
      ? new GatewayError("validation_error")
      : undefined;
  const payload = StableMcpErrorSchema.parse({
    schemaVersion: "mcp-error.v1",
    tool,
    error: {
      code: gatewayError?.code ?? "internal_error",
      message:
        gatewayError?.message ?? "The gateway could not complete the request.",
      retryable: gatewayError?.retryable ?? false
    },
    dataStatus: gatewayError?.dataStatus,
    generatedAt: safeNow(now)
  }) satisfies StableMcpError;

  return {
    isError: true,
    // MCP outputSchema describes successful structuredContent. Error payloads
    // remain stable JSON TextContent so conforming clients do not validate an
    // error object against the success schema.
    content: [{ type: "text", text: JSON.stringify(payload) }]
  };
}

function safeNow(now: () => Date): string {
  try {
    const value = now();
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value.toISOString();
    }
  } catch {
    // Fall through to a valid non-sensitive timestamp.
  }
  return new Date(0).toISOString();
}
