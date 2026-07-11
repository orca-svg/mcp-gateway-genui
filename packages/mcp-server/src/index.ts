#!/usr/bin/env node
import { createRequire } from "node:module";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  BenefitToolService,
  SnapshotStore,
  isGatewayError
} from "@mcp-gen-ui/core";
import { buildBenefitRepository } from "./repository.js";
import { createGatewayMcpServer } from "./server.js";

const nodeRequire = createRequire(import.meta.url);
const packageMetadata = nodeRequire("../package.json") as { version: string };

async function main(): Promise<void> {
  const repository = buildBenefitRepository();
  const snapshots = new SnapshotStore(
    process.env.MCP_GEN_UI_DB_PATH ?? "mcp-gen-ui-gateway.db"
  );
  const service = new BenefitToolService(repository, snapshots, {
    gatewayVersion: packageMetadata.version
  });
  const server = createGatewayMcpServer({
    service,
    version: packageMetadata.version
  });
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    try {
      await server.close();
    } finally {
      snapshots.close();
    }
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await server.connect(transport);
}

try {
  await main();
} catch (error) {
  const code = isGatewayError(error) ? error.code : "internal_error";
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
}
