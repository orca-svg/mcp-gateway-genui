---
"@mcp-gen-ui/adapters": patch
---

Switch the subsidy24 adapter and canary from MOEF aggregate budget statistics (`T_OPD_PRMSCT_SBBGST`) to the citizen-facing open-call endpoint (`T_OPD_PBNS`) and map its 공모사업 fields into validated `BenefitRecord`s.
