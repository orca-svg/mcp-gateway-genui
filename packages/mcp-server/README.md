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

### Live data opt-in

The stdio server starts with fixture data only when no API keys are configured.
For live public-benefit data, set environment variables in the MCP host config:

```json
{
  "mcpServers": {
    "mcp-gen-ui-gateway": {
      "command": "node",
      "args": ["node_modules/@mcp-gen-ui/mcp-server/dist/index.js"],
      "env": {
        "MCP_GEN_UI_DB_PATH": "mcp-gen-ui-gateway.db",
        "DATA_GO_KR_API_KEY": "...",
        "YOUTH_CENTER_API_KEY": "..."
      }
    }
  }
}
```

`DATA_GO_KR_API_KEY` enables the 복지로 and 보조금24 adapters. If needed,
`BOKJIRO_API_KEY` or `SUBSIDY24_API_KEY` can be supplied to override the shared
key for one source. `YOUTH_CENTER_API_KEY` enables 온통청년. Live source results
are cached briefly by the server and fixture records remain as fallback data;
set `MCP_GEN_UI_FIXTURES=off` only when you want live-source results without the
bundled fixture catalog.
