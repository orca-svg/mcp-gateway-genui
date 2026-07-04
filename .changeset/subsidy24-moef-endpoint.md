---
"@mcp-gen-ui/adapters": patch
---

Replace the defunct 보조금24 `gov24SubsidyList` endpoint (HTTP 500, discontinued) with the MOEF 국고보조금 정보 API (`MoefOpenAPI/T_OPD_PRMSCT_SBBGST`) as the subsidy24 adapter default, updating the default provider to 기획재정부 and the probe query to `resultType=json` + `bsnsyear`.
