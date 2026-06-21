import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP server tools/list", () => {
  it("exposes getUpcomingDeadlines and listPersonas", async () => {
    const client = new Client({ name: "mcp-gen-ui-test-client", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: "pnpm",
      args: ["start"],
      cwd: process.cwd(),
      stderr: "pipe",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        MCP_GEN_UI_DB_PATH: ":memory:"
      }
    });

    try {
      await client.connect(transport);
      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["getUpcomingDeadlines", "listPersonas"])
      );

      const personas = await client.callTool({ name: "listPersonas", arguments: {} });
      const payload = JSON.parse(personas.content[0]?.type === "text" ? personas.content[0].text : "null");
      expect(payload.personas.map((persona: { id: string }) => persona.id)).toEqual([
        "youth_jobseeker",
        "university_student",
        "newlywed_family",
        "single_parent",
        "senior",
        "general"
      ]);
    } finally {
      await client.close();
    }
  }, 60_000);
});
