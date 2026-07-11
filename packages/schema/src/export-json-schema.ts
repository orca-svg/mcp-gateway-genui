import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePublicJsonSchemas } from "./json-schema.js";

/** Export deterministic JSON Schema draft 2020-12 artifacts. */
const outDir = fileURLToPath(new URL("../schema/v2/", import.meta.url));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const [fileName, schema] of generatePublicJsonSchemas()) {
  writeFileSync(
    join(outDir, fileName),
    `${JSON.stringify(schema, null, 2)}\n`
  );
  console.log(`exported schema/v2/${fileName}`);
}
