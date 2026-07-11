import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ApplicationGuideResponseSchema,
  BenefitSearchResponseV2Schema,
  ChecklistResponseSchema,
  GetBenefitDetailResponseSchema,
  GetChangeLogResponseSchema,
  ListPersonasResponseSchema,
  StableMcpErrorSchema,
  UpcomingDeadlinesResponseV2Schema,
  type DataStatus,
  type ToolName
} from "@mcp-gen-ui/schema";
import {
  BenefitToolService,
  FixtureBenefitRepository,
  SnapshotStore,
  fixtureBenefits,
  type BenefitRepository
} from "@mcp-gen-ui/core";
import { createGatewayMcpServer } from "./server.js";

const EXPECTED_TOOLS: ToolName[] = [
  "searchBenefits",
  "getBenefitDetail",
  "getUpcomingDeadlines",
  "listPersonas",
  "buildChecklist",
  "getApplicationGuide",
  "getChangeLog"
];

describe("complete MCP tool contracts", () => {
  const now = () => new Date("2026-07-10T00:00:00.000Z");
  const repository = new FixtureBenefitRepository(undefined, { now });
  const snapshots = new SnapshotStore(":memory:");
  const service = new BenefitToolService(repository, snapshots, {
    now,
    gatewayVersion: "9.9.9"
  });
  const server = createGatewayMcpServer({ service, version: "9.9.9", now });
  const client = new Client({ name: "mcp-gen-ui-test-client", version: "1.0.0" });

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    snapshots.close();
  });

  it("publishes seven input/output schemas, exact annotations, and package metadata", async () => {
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(EXPECTED_TOOLS);
    for (const tool of listed.tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: !["listPersonas", "getChangeLog"].includes(tool.name)
      });
    }
    expect(client.getServerVersion()).toMatchObject({
      name: "mcp-gen-ui-gateway",
      version: "9.9.9"
    });
  });

  it("calls every tool and keeps structuredContent equal to JSON TextContent", async () => {
    const id = fixtureBenefits[0]!.id;
    const calls = [
      [
        "searchBenefits",
        { query: "benefit" },
        BenefitSearchResponseV2Schema
      ],
      ["getBenefitDetail", { id }, GetBenefitDetailResponseSchema],
      ["getUpcomingDeadlines", {}, UpcomingDeadlinesResponseV2Schema],
      ["listPersonas", {}, ListPersonasResponseSchema],
      ["buildChecklist", { benefitId: id }, ChecklistResponseSchema],
      ["getApplicationGuide", { benefitId: id }, ApplicationGuideResponseSchema],
      ["getChangeLog", {}, GetChangeLogResponseSchema]
    ] as const;

    for (const [name, args, schema] of calls) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      const text = result.content.find((item) => item.type === "text");
      expect(text?.type).toBe("text");
      const textValue = JSON.parse(text?.type === "text" ? text.text : "null") as unknown;
      expect(textValue).toEqual(result.structuredContent);
      expect(schema.safeParse(result.structuredContent).success).toBe(true);
    }
  });

  it("returns expected failures as stable, redacted structured JSON", async () => {
    const result = await client.callTool({
      name: "getBenefitDetail",
      arguments: { id: "missing-benefit" }
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const text = result.content.find((item) => item.type === "text");
    const parsed = StableMcpErrorSchema.parse(
      JSON.parse(text?.type === "text" ? text.text : "null")
    );
    expect(parsed.error).toMatchObject({ code: "not_found", retryable: false });
    expect(JSON.stringify(parsed)).not.toContain("stack");
  });

  it("rejects unknown PII-shaped input fields", async () => {
    const result = await client.callTool({
      name: "searchBenefits",
      arguments: {
        query: "benefit",
        profile: { email: "should-not-be-accepted@example.test" }
      }
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const text = result.content.find((item) => item.type === "text");
    const parsed = StableMcpErrorSchema.parse(
      JSON.parse(text?.type === "text" ? text.text : "null")
    );
    expect(parsed.error).toMatchObject({
      code: "validation_error",
      retryable: false
    });
    expect(JSON.stringify(parsed)).not.toContain("should-not-be-accepted@example.test");
  });

  it("maps a malformed opaque cursor to the same stable validation envelope", async () => {
    const result = await client.callTool({
      name: "getChangeLog",
      arguments: { cursor: "syntactically-valid-but-malformed" }
    });
    expect(result.isError).toBe(true);
    const text = result.content.find((item) => item.type === "text");
    const parsed = StableMcpErrorSchema.parse(
      JSON.parse(text?.type === "text" ? text.text : "null")
    );
    expect(parsed.error.code).toBe("validation_error");
  });
});

describe("all-source MCP failure", () => {
  it("returns the stable retryable error with source observations", async () => {
    const now = () => new Date("2026-07-10T00:00:00.000Z");
    const dataStatus: DataStatus = {
      mode: "live",
      partial: true,
      sources: [
        {
          sourceId: "source-a",
          status: "timeout",
          retrievedAt: now().toISOString(),
          recordCount: 0,
          errorCode: "timeout",
          adapterVersion: "1.0.0"
        }
      ]
    };
    const failedRepository: BenefitRepository = {
      mode: "live",
      async search() {
        return { records: [], dataStatus };
      },
      async getById() {
        return { dataStatus };
      }
    };
    const service = new BenefitToolService(failedRepository, undefined, { now });
    const server = createGatewayMcpServer({ service, version: "9.9.9", now });
    const client = new Client({ name: "failed-source-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);

    try {
      const result = await client.callTool({
        name: "searchBenefits",
        arguments: { query: "benefit" }
      });
      expect(result.isError).toBe(true);
      const text = result.content.find((item) => item.type === "text");
      const parsed = StableMcpErrorSchema.parse(
        JSON.parse(text?.type === "text" ? text.text : "null")
      );
      expect(parsed).toMatchObject({
        tool: "searchBenefits",
        error: { code: "all_sources_failed", retryable: true },
        dataStatus
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
