import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
// Type-only import: erased at compile time, so it never triggers a runtime load.
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import type { BenefitRecord, ChangeLogEntry } from "@mcp-gen-ui/schema";

// `node:sqlite` is a Node builtin that is only importable *with* the `node:`
// prefix. Some bundlers/test transformers (Vite/Vitest) strip the prefix on a
// static value import, which then fails to resolve. Loading it through
// createRequire keeps the literal specifier intact at runtime and works
// identically under plain Node and under Vitest.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

/**
 * SQLite-backed snapshot + change log.
 *
 * Uses Node's built-in `node:sqlite` (DatabaseSync) so the gateway has no
 * native build step. Each recorded benefit is content-hashed; a differing hash
 * for a known id produces an `updated` change-log entry, an unseen id produces
 * `created`, and an identical hash produces `unchanged`.
 *
 * Only normalized public benefit data is stored — never sensitive identifiers.
 */
export class SnapshotStore {
  private readonly db: DatabaseSyncInstance;

  constructor(path = "mcp-gen-ui-gateway.db") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      create table if not exists snapshots (
        entity_id text primary key,
        entity_type text not null,
        content_hash text not null,
        payload text not null,
        updated_at text not null
      );

      create table if not exists change_log (
        id text primary key,
        entity_id text not null,
        entity_type text not null,
        change_type text not null,
        summary text not null,
        created_at text not null
      );
    `);
  }

  recordBenefitSnapshot(benefit: BenefitRecord): ChangeLogEntry {
    const payload = JSON.stringify(benefit);
    const contentHash = hash(payload);
    const now = new Date().toISOString();

    const existing = this.db
      .prepare("select content_hash from snapshots where entity_id = ?")
      .get(benefit.id) as { content_hash: string } | undefined;
    const changeType: ChangeLogEntry["changeType"] = existing
      ? existing.content_hash === contentHash
        ? "unchanged"
        : "updated"
      : "created";

    this.db
      .prepare(
        `insert into snapshots (entity_id, entity_type, content_hash, payload, updated_at)
         values (?, 'benefit', ?, ?, ?)
         on conflict(entity_id) do update set
           content_hash = excluded.content_hash,
           payload = excluded.payload,
           updated_at = excluded.updated_at`
      )
      .run(benefit.id, contentHash, payload, now);

    const entry: ChangeLogEntry = {
      id: randomUUID(),
      entityId: benefit.id,
      entityType: "benefit",
      changeType,
      summary: `${benefit.title} ${changeType}.`,
      createdAt: now
    };

    this.db
      .prepare(
        `insert into change_log (id, entity_id, entity_type, change_type, summary, created_at)
         values (?, ?, 'benefit', ?, ?, ?)`
      )
      .run(entry.id, entry.entityId, entry.changeType, entry.summary, entry.createdAt);

    return entry;
  }

  getChangeLog(entityId?: string): ChangeLogEntry[] {
    const rows = entityId
      ? this.db
          .prepare(
            "select * from change_log where entity_id = ? order by created_at desc"
          )
          .all(entityId)
      : this.db.prepare("select * from change_log order by created_at desc").all();

    return rows.map((row) => {
      const record = row as Record<string, string>;
      return {
        id: record.id,
        entityId: record.entity_id,
        entityType: "benefit",
        changeType: record.change_type as ChangeLogEntry["changeType"],
        summary: record.summary,
        createdAt: record.created_at
      };
    });
  }

  close(): void {
    this.db.close();
  }
}

function hash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}
