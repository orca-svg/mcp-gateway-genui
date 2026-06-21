#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BenefitToolService, FixtureBenefitRepository, SnapshotStore } from "@mcp-gen-ui/core";
import { BenefitSearchRequestSchema, UpcomingDeadlinesRequestSchema } from "@mcp-gen-ui/schema";

/**
 * stdio MCP server. It exposes BenefitToolService as deterministic tools.
 * There is no LLM in this process — the host/client model orchestrates the
 * natural-language conversation and decides which tools to call.
 */
const repository = new FixtureBenefitRepository();
const snapshots = new SnapshotStore(process.env.MCP_GEN_UI_DB_PATH ?? "mcp-gen-ui-gateway.db");
const tools = new BenefitToolService(repository, snapshots);

const server = new McpServer({
  name: "mcp-gen-ui-gateway",
  version: "0.1.0"
});

server.tool(
  "searchBenefits",
  "Find public-benefit candidates from non-identifying user profile conditions.",
  BenefitSearchRequestSchema.shape,
  async (input) => jsonToolResult(await tools.searchBenefits(input))
);

server.tool(
  "getBenefitDetail",
  "Return structured detail for a benefit candidate.",
  { id: z.string().min(1) },
  async ({ id }) => jsonToolResult(await tools.getBenefitDetail(id))
);

server.tool(
  "getUpcomingDeadlines",
  "Return benefits with upcoming structured application deadlines, optionally filtered by profile and day window.",
  UpcomingDeadlinesRequestSchema.shape,
  async (input) => jsonToolResult(await tools.getUpcomingDeadlines(input))
);

server.tool(
  "listPersonas",
  "List built-in recommendation persona presets and their scoring weights for host selection.",
  {},
  async () => jsonToolResult({ personas: await tools.listPersonas() })
);

server.tool(
  "buildChecklist",
  "Build a preparation checklist for a benefit application.",
  { benefitId: z.string().min(1) },
  async ({ benefitId }) => jsonToolResult(await tools.buildChecklist(benefitId))
);

server.tool(
  "getApplicationGuide",
  "Return user-action-only application guidance for a benefit.",
  { benefitId: z.string().min(1) },
  async ({ benefitId }) => jsonToolResult(await tools.getApplicationGuide(benefitId))
);

server.tool(
  "getChangeLog",
  "Return snapshot and change-log entries for all benefits or one benefit.",
  { entityId: z.string().optional() },
  async ({ entityId }) => jsonToolResult(await tools.getChangeLog(entityId))
);

const transport = new StdioServerTransport();
await server.connect(transport);

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
