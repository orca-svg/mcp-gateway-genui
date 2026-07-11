import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  ChangeLogEntrySchema,
  GetChangeLogRequestSchema,
  type ChangeLogEntry,
  type GetChangeLogRequest,
  type SourceSyncBatch
} from "@mcp-gen-ui/schema";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import { hashCanonicalJson } from "./canonical-json.js";
import { diffJsonPointers } from "./json-diff.js";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const STORE_ERROR_MESSAGES = {
  invalid_request: "Snapshot store request is invalid.",
  transaction_failed: "Snapshot store transaction failed.",
  corrupt_data: "Snapshot store data is invalid.",
  unavailable: "Snapshot store is unavailable."
} as const;

export type SnapshotStoreErrorCode = keyof typeof STORE_ERROR_MESSAGES;

/** A stable storage error that never retains payloads, credentials, or SQL details. */
export class SnapshotStoreError extends Error {
  readonly code: SnapshotStoreErrorCode;

  constructor(code: SnapshotStoreErrorCode) {
    super(STORE_ERROR_MESSAGES[code]);
    this.name = "SnapshotStoreError";
    this.code = code;
    this.stack = undefined;
  }

  toJSON(): {
    name: "SnapshotStoreError";
    code: SnapshotStoreErrorCode;
    message: string;
  } {
    return { name: "SnapshotStoreError", code: this.code, message: this.message };
  }
}

export interface SourceSyncResult {
  sourceId: string;
  sourceRevision: string;
  observedAt: string;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  events: ChangeLogEntry[];
}

export interface ChangeLogPage {
  entries: ChangeLogEntry[];
  nextCursor?: string;
}

interface StoredSnapshotRow {
  entity_id: string;
  content_hash: string;
  payload: string;
}

interface StoredChangeRow {
  sequence: number;
  id: string;
  entity_id: string;
  entity_type: string;
  change_type: string;
  changed_paths: string;
  source_id: string;
  source_revision: string;
  content_hash: string;
  summary: string;
  created_at: string;
}

interface CursorPayload {
  version: 1;
  createdAt: string;
  sequence: number;
}

/**
 * SQLite persistence for explicit source ingestion and paginated v2 history.
 *
 * The legacy `snapshots` and `change_log` tables are left intact for existing
 * installations, but v2 ingestion never reads or writes them.
 */
export class SnapshotStore {
  private readonly db: DatabaseSyncInstance;

  constructor(path = "mcp-gen-ui-gateway.db") {
    let database: DatabaseSyncInstance | undefined;
    try {
      database = new DatabaseSync(path);
      database.exec("PRAGMA journal_mode = WAL;");
      database.exec(`
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

        create table if not exists source_snapshots_v2 (
          source_id text not null,
          entity_id text not null,
          entity_type text not null,
          source_revision text not null,
          content_hash text not null,
          payload text not null,
          first_observed_at text not null,
          last_observed_at text not null,
          primary key (source_id, entity_id)
        );

        create table if not exists change_log_v2 (
          sequence integer primary key autoincrement,
          id text not null unique,
          entity_id text not null,
          entity_type text not null,
          change_type text not null check (change_type in ('created', 'updated', 'deleted')),
          changed_paths text not null,
          source_id text not null,
          source_revision text not null,
          content_hash text not null,
          summary text not null,
          created_at text not null
        );

        create index if not exists change_log_v2_order_idx
          on change_log_v2 (created_at desc, sequence desc);
        create index if not exists change_log_v2_entity_order_idx
          on change_log_v2 (entity_id, created_at desc, sequence desc);
      `);
    } catch {
      try {
        database?.close();
      } catch {
        // The stable error below is sufficient; never expose driver details.
      }
      throw new SnapshotStoreError("unavailable");
    }
    this.db = database;
  }

  /** Applies one validated source batch atomically. Called only by the ingestion service. */
  applySourceSync(batch: SourceSyncBatch, eventCreatedAt: string): SourceSyncResult {
    const result = emptySyncResult(batch);
    if (!isProcessableObservation(batch.observation.status)) return result;

    try {
      this.db.exec("BEGIN IMMEDIATE;");
      const existingRows = this.db
        .prepare(
          `select entity_id, content_hash, payload
             from source_snapshots_v2
            where source_id = ?`
        )
        .all(batch.observation.sourceId) as unknown as StoredSnapshotRow[];
      const existingByEntityId = new Map(
        existingRows.map((row) => [row.entity_id, row])
      );
      const incomingEntityIds = new Set<string>();

      for (const record of batch.records) {
        if (incomingEntityIds.has(record.id)) {
          throw new Error("duplicate entity");
        }
        incomingEntityIds.add(record.id);

        const contentHash = hashCanonicalJson(record);
        const payload = JSON.stringify(record);
        const existing = existingByEntityId.get(record.id);

        if (!existing) {
          this.db
            .prepare(
              `insert into source_snapshots_v2 (
                 source_id, entity_id, entity_type, source_revision, content_hash,
                 payload, first_observed_at, last_observed_at
               ) values (?, ?, 'benefit', ?, ?, ?, ?, ?)`
            )
            .run(
              batch.observation.sourceId,
              record.id,
              batch.sourceRevision,
              contentHash,
              payload,
              batch.observation.retrievedAt,
              batch.observation.retrievedAt
            );
          const event = this.insertChangeEvent({
            entityId: record.id,
            changeType: "created",
            changedPaths: [""],
            sourceId: batch.observation.sourceId,
            sourceRevision: batch.sourceRevision,
            contentHash,
            createdAt: eventCreatedAt
          });
          result.created += 1;
          result.events.push(event);
          continue;
        }

        if (existing.content_hash === contentHash) {
          this.db
            .prepare(
              `update source_snapshots_v2
                  set last_observed_at = ?
                where source_id = ? and entity_id = ?`
            )
            .run(
              batch.observation.retrievedAt,
              batch.observation.sourceId,
              record.id
            );
          result.unchanged += 1;
          continue;
        }

        const previousPayload = JSON.parse(existing.payload) as unknown;
        const changedPaths = diffJsonPointers(previousPayload, record);
        if (changedPaths.length === 0) {
          throw new Error("hash and diff disagree");
        }
        this.db
          .prepare(
            `update source_snapshots_v2
                set source_revision = ?, content_hash = ?, payload = ?, last_observed_at = ?
              where source_id = ? and entity_id = ?`
          )
          .run(
            batch.sourceRevision,
            contentHash,
            payload,
            batch.observation.retrievedAt,
            batch.observation.sourceId,
            record.id
          );
        const event = this.insertChangeEvent({
          entityId: record.id,
          changeType: "updated",
          changedPaths,
          sourceId: batch.observation.sourceId,
          sourceRevision: batch.sourceRevision,
          contentHash,
          createdAt: eventCreatedAt
        });
        result.updated += 1;
        result.events.push(event);
      }

      if (batch.complete && batch.observation.status === "ok") {
        for (const existing of existingRows) {
          if (incomingEntityIds.has(existing.entity_id)) continue;

          this.db
            .prepare(
              "delete from source_snapshots_v2 where source_id = ? and entity_id = ?"
            )
            .run(batch.observation.sourceId, existing.entity_id);
          const event = this.insertChangeEvent({
            entityId: existing.entity_id,
            changeType: "deleted",
            changedPaths: [""],
            sourceId: batch.observation.sourceId,
            sourceRevision: batch.sourceRevision,
            contentHash: existing.content_hash,
            createdAt: eventCreatedAt
          });
          result.deleted += 1;
          result.events.push(event);
        }
      }

      this.db.exec("COMMIT;");
      return result;
    } catch {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // Preserve the stable transaction error even if rollback also fails.
      }
      throw new SnapshotStoreError("transaction_failed");
    }
  }

  getChangeLogPage(input: unknown = {}): ChangeLogPage {
    let request: GetChangeLogRequest;
    let cursor: CursorPayload | undefined;
    try {
      request = GetChangeLogRequestSchema.parse(input);
      cursor = request.cursor ? decodeCursor(request.cursor) : undefined;
    } catch {
      throw new SnapshotStoreError("invalid_request");
    }

    const predicates: string[] = [];
    const parameters: Array<string | number> = [];
    if (request.entityId) {
      predicates.push("entity_id = ?");
      parameters.push(request.entityId);
    }
    if (cursor) {
      predicates.push("(created_at < ? or (created_at = ? and sequence < ?))");
      parameters.push(cursor.createdAt, cursor.createdAt, cursor.sequence);
    }
    const whereClause =
      predicates.length > 0 ? `where ${predicates.join(" and ")}` : "";

    let rows: StoredChangeRow[];
    try {
      rows = this.db
        .prepare(
          `select sequence, id, entity_id, entity_type, change_type, changed_paths,
                  source_id, source_revision, content_hash, summary, created_at
             from change_log_v2
             ${whereClause}
            order by created_at desc, sequence desc
            limit ?`
        )
        .all(...parameters, request.limit + 1) as unknown as StoredChangeRow[];
    } catch {
      throw new SnapshotStoreError("unavailable");
    }

    const hasMore = rows.length > request.limit;
    const pageRows = hasMore ? rows.slice(0, request.limit) : rows;
    let entries: ChangeLogEntry[];
    try {
      entries = pageRows.map(rowToChangeLogEntry);
    } catch {
      throw new SnapshotStoreError("corrupt_data");
    }

    if (!hasMore || pageRows.length === 0) return { entries };
    const lastRow = pageRows.at(-1)!;
    return {
      entries,
      nextCursor: encodeCursor({
        version: 1,
        createdAt: lastRow.created_at,
        sequence: lastRow.sequence
      })
    };
  }

  close(): void {
    this.db.close();
  }

  private insertChangeEvent(input: {
    entityId: string;
    changeType: ChangeLogEntry["changeType"];
    changedPaths: string[];
    sourceId: string;
    sourceRevision: string;
    contentHash: string;
    createdAt: string;
  }): ChangeLogEntry {
    const event = ChangeLogEntrySchema.parse({
      id: randomUUID(),
      entityId: input.entityId,
      entityType: "benefit",
      changeType: input.changeType,
      changedPaths: input.changedPaths,
      sourceId: input.sourceId,
      sourceRevision: input.sourceRevision,
      contentHash: input.contentHash,
      summary: `Benefit record ${input.changeType}.`,
      createdAt: input.createdAt
    });
    this.db
      .prepare(
        `insert into change_log_v2 (
           id, entity_id, entity_type, change_type, changed_paths, source_id,
           source_revision, content_hash, summary, created_at
         ) values (?, ?, 'benefit', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.entityId,
        event.changeType,
        JSON.stringify(event.changedPaths),
        event.sourceId,
        event.sourceRevision,
        event.contentHash,
        event.summary,
        event.createdAt
      );
    return event;
  }
}

function emptySyncResult(batch: SourceSyncBatch): SourceSyncResult {
  return {
    sourceId: batch.observation.sourceId,
    sourceRevision: batch.sourceRevision,
    observedAt: batch.observation.retrievedAt,
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    events: []
  };
}

function isProcessableObservation(status: SourceSyncBatch["observation"]["status"]): boolean {
  return status === "ok" || status === "partial";
}

function rowToChangeLogEntry(row: StoredChangeRow): ChangeLogEntry {
  return ChangeLogEntrySchema.parse({
    id: row.id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    changeType: row.change_type,
    changedPaths: JSON.parse(row.changed_paths) as unknown,
    sourceId: row.source_id,
    sourceRevision: row.source_revision,
    contentHash: row.content_hash,
    summary: row.summary,
    createdAt: row.created_at
  });
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload {
  const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
  if (!decoded || typeof decoded !== "object") throw new Error("invalid cursor");
  const candidate = decoded as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.createdAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.createdAt)) ||
    typeof candidate.sequence !== "number" ||
    !Number.isSafeInteger(candidate.sequence) ||
    candidate.sequence < 1
  ) {
    throw new Error("invalid cursor");
  }
  const payload: CursorPayload = {
    version: 1,
    createdAt: candidate.createdAt,
    sequence: candidate.sequence
  };
  if (encodeCursor(payload) !== cursor) throw new Error("invalid cursor");
  return payload;
}
