import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment
} from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ApplicationGuideResponseSchema,
  BenefitSearchResponseV2Schema,
  ChecklistResponseSchema,
  GetBenefitDetailResponseSchema,
  GetChangeLogResponseSchema,
  ListPersonasResponseSchema,
  StableMcpErrorSchema,
  UpcomingDeadlinesResponseV2Schema
} from "@mcp-gen-ui/schema";
import { fixtureBenefits } from "@mcp-gen-ui/core";

const nodeRequire = createRequire(import.meta.url);
const packageMetadata = nodeRequire("../package.json") as { version: string };

describe("actual stdio MCP server", () => {
  const client = new Client({ name: "stdio-contract-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["start"],
    cwd: process.cwd(),
    stderr: "pipe",
    env: {
      ...getDefaultEnvironment(),
      NODE_ENV: "test",
      MCP_GEN_UI_REPOSITORY_MODE: "fixture",
      MCP_GEN_UI_DB_PATH: ":memory:"
    }
  });

  beforeAll(async () => {
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  it("publishes package/server version and complete contracts", async () => {
    expect(client.getServerVersion()).toMatchObject({
      name: "mcp-gen-ui-gateway",
      version: packageMetadata.version
    });
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(7);
    expect(listed.tools.every((tool) => tool.inputSchema && tool.outputSchema)).toBe(true);
    expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("calls all seven tools and validates structured/text equality", async () => {
    const id = fixtureBenefits[0]!.id;
    const calls = [
      ["searchBenefits", { query: "benefit" }, BenefitSearchResponseV2Schema],
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
      const parsedText = JSON.parse(text?.type === "text" ? text.text : "null");
      expect(parsedText).toEqual(result.structuredContent);
      schema.parse(result.structuredContent);
    }
  }, 30_000);

  it("returns stable JSON for not-found and strict-input failures", async () => {
    const cases = [
      ["getBenefitDetail", { id: "missing-benefit" }, "not_found"],
      [
        "searchBenefits",
        {
          query: "benefit",
          profile: { email: "stdio-secret@example.test" }
        },
        "validation_error"
      ]
    ] as const;

    for (const [name, args, expectedCode] of cases) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      const text = result.content.find((item) => item.type === "text");
      const parsed = StableMcpErrorSchema.parse(
        JSON.parse(text?.type === "text" ? text.text : "null")
      );
      expect(parsed.error.code).toBe(expectedCode);
      expect(JSON.stringify(parsed)).not.toContain("stdio-secret@example.test");
    }
  }, 30_000);
});
