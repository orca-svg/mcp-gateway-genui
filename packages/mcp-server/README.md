# @mcp-gen-ui/mcp-server

stdio MCP server for the mcp-gen-ui gateway public-benefit discovery tools.

The server registers seven deterministic read-only tools for benefit search,
detail, deadlines, personas, checklist generation, application guidance, and
snapshot change logs. It delegates conversation and LLM orchestration to the
MCP client.

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
      "env": {
        "MCP_GEN_UI_REPOSITORY_MODE": "fixture",
        "MCP_GEN_UI_DB_PATH": "mcp-gen-ui-gateway.db"
      }
    }
  }
}
```

## Runtime environment

| Variable | Contract |
| --- | --- |
| `MCP_GEN_UI_REPOSITORY_MODE` | `fixture`, `live`, or `mixed`; required in production, otherwise defaults to `fixture`. |
| `MCP_GEN_UI_LIVE_SOURCES` | Optional comma-separated subset of `youth-center,bokjiro,subsidy24`; omission infers sources from configured keys. |
| `YOUTH_CENTER_API_KEY` | Required for 온통청년; the shared data.go.kr key never applies to this source. |
| `BOKJIRO_API_KEY` / `SUBSIDY24_API_KEY` | Source-specific keys; each takes precedence over `DATA_GO_KR_API_KEY`. |
| `DATA_GO_KR_API_KEY` | Shared fallback for Bokjiro and the national-subsidy open-call source only. |
| `MCP_GEN_UI_CACHE_TTL_MS` | Live/mixed cache TTL, 1,000–86,400,000 ms; defaults to 300,000 ms. |
| `YOUTH_CENTER_API_ENDPOINT` / `BOKJIRO_API_ENDPOINT` / `SUBSIDY24_API_ENDPOINT` | Optional overrides restricted to each source's exact official HTTPS origin, without credentials, query, or fragment. |
| `MCP_GEN_UI_DB_PATH` | SQLite path; defaults to `mcp-gen-ui-gateway.db`. |

Production startup fails closed when the mode or selected keys are missing;
live mode never silently falls back to fixtures. The historical source ID and
environment prefix `subsidy24` refer to the 기획예산처 national-subsidy
open-call dataset, not the 행정안전부 보조금24 individual-benefit catalog.

All tools publish strict input/output schemas and read-only, non-destructive,
idempotent annotations. A success returns identical JSON as structured content
and text; a failure returns only a stable `mcp-error.v1` JSON text payload.
