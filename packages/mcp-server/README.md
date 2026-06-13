# @mcp-gen-ui/mcp-server

stdio MCP server for the mcp-gen-ui gateway public-benefit discovery tools.

The server registers deterministic tools for benefit search, benefit detail, checklist generation, application guidance, and snapshot change logs. It delegates all host conversation and LLM orchestration to the MCP client.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.

## Install

```bash
npm install @mcp-gen-ui/mcp-server
```

## Usage

```bash
npx mcp-gen-ui-gateway
```

Example MCP host configuration after building or installing:

```json
{
  "mcpServers": {
    "mcp-gen-ui-gateway": {
      "command": "node",
      "args": ["node_modules/@mcp-gen-ui/mcp-server/dist/index.js"],
      "env": { "MCP_GEN_UI_DB_PATH": "mcp-gen-ui-gateway.db" }
    }
  }
}
```
