import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BenefitRecordSchema,
  type BenefitRecord,
  type SourceSyncBatch
} from "@mcp-gen-ui/schema";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { BenefitIngestionService } from "./ingestion-service.js";
import { SnapshotStore, SnapshotStoreError } from "./sqlite-store.js";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const OBSERVED_AT = "2026-07-10T00:00:00.000Z";
const CONTENT_HASH = "b".repeat(64);

describe("SnapshotStore v2", () => {
  it("preserves legacy tables and data while creating separate v2 tables", () => {
    const path = temporaryDatabasePath();
    const legacy = new DatabaseSync(path) as DatabaseSyncInstance;
    legacy.exec(`
      create table snapshots (
        entity_id text primary key,
        entity_type text not null,
        content_hash text not null,
        payload text not null,
        updated_at text not null
      );
      create table change_log (
        id text primary key,
        entity_id text not null,
        entity_type text not null,
        change_type text not null,
        summary text not null,
        created_at text not null
      );
      insert into snapshots values (
        'legacy-benefit', 'benefit', '${CONTENT_HASH}', '{"legacy":true}', '${OBSERVED_AT}'
      );
    `);
    legacy.close();

    const store = new SnapshotStore(path);
    store.close();

    const database = new DatabaseSync(path) as DatabaseSyncInstance;
    const legacyRow = database
      .prepare("select payload from snapshots where entity_id = 'legacy-benefit'")
      .get() as { payload: string };
    const tables = database
      .prepare("select name from sqlite_master where type = 'table'")
      .all() as Array<{ name: string }>;
    expect(legacyRow.payload).toBe('{"legacy":true}');
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        "snapshots",
        "change_log",
        "source_snapshots_v2",
        "change_log_v2"
      ])
    );
    database.close();
  });

  it("paginates newest-first with an opaque stable cursor and a hard max limit", () => {
    const store = new SnapshotStore(temporaryDatabasePath());
    const service = new BenefitIngestionService(store, {
      now: () => new Date("2026-07-10T01:00:00.000Z")
    });
    service.syncSource(
      batch("source-page", [
        record("benefit-one", "source-page"),
        record("benefit-two", "source-page"),
        record("benefit-three", "source-page")
      ])
    );

    const firstPage = store.getChangeLogPage({ limit: 2 });
    const repeatedFirstPage = store.getChangeLogPage({ limit: 2 });
    expect(firstPage.entries.map((entry) => entry.entityId)).toEqual([
      "benefit-three",
      "benefit-two"
    ]);
    expect(firstPage.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(firstPage.nextCursor).toBe(repeatedFirstPage.nextCursor);
    expect(firstPage.nextCursor).not.toContain("benefit-two");

    const secondPage = store.getChangeLogPage({
      limit: 2,
      cursor: firstPage.nextCursor
    });
    expect(secondPage.entries.map((entry) => entry.entityId)).toEqual(["benefit-one"]);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(
      store.getChangeLogPage({ entityId: "benefit-two", limit: 100 }).entries
    ).toHaveLength(1);

    expect(() => store.getChangeLogPage({ limit: 101 })).toThrow(
      expect.objectContaining({ code: "invalid_request" })
    );
    let cursorError: SnapshotStoreError | undefined;
    try {
      store.getChangeLogPage({ cursor: "resident-secret", limit: 2 });
    } catch (error) {
      cursorError = error as SnapshotStoreError;
    }
    expect(cursorError).toMatchObject({ code: "invalid_request" });
    expect(JSON.stringify(cursorError)).not.toContain("resident-secret");
    expect(cursorError?.stack).toBeUndefined();
    store.close();
  });

  it("scopes snapshots and complete-sync deletion by source", () => {
    const path = temporaryDatabasePath();
    const store = new SnapshotStore(path);
    const service = new BenefitIngestionService(store, {
      now: () => new Date("2026-07-10T01:00:00.000Z")
    });
    service.syncSource(batch("source-a", [record("shared-benefit", "source-a")]));
    service.syncSource(batch("source-b", [record("shared-benefit", "source-b")]));

    const deletion = service.syncSource(batch("source-a", []));

    expect(deletion).toMatchObject({ deleted: 1 });
    expect(deletion.events[0]).toMatchObject({
      entityId: "shared-benefit",
      sourceId: "source-a",
      changeType: "deleted"
    });
    const database = new DatabaseSync(path) as DatabaseSyncInstance;
    const remaining = database
      .prepare("select source_id from source_snapshots_v2 where entity_id = ?")
      .all("shared-benefit") as Array<{ source_id: string }>;
    expect(remaining).toEqual([{ source_id: "source-b" }]);
    database.close();
    store.close();
  });
});

function record(id: string, sourceId: string): BenefitRecord {
  return BenefitRecordSchema.parse({
    id,
    sourceId,
    sourceRecordId: `${sourceId}-${id}`,
    sourceRevision: "rev-1",
    contentHash: CONTENT_HASH,
    title: `Title ${id}`,
    provider: "Public provider",
    category: "other",
    summary: "Public summary.",
    target: "Public target.",
    eligibility: [],
    documents: [],
    applicationMethods: [],
    constraints: [],
    searchableText: "",
    provenance: [
      {
        field: "/title",
        sourceId,
        sourceRecordId: `${sourceId}-${id}`,
        authority: "authoritative_structured",
        contentHash: CONTENT_HASH,
        observedAt: OBSERVED_AT,
        sourceRevision: "rev-1"
      }
    ],
    links: [
      {
        rel: "source",
        url: `https://example.test/${sourceId}/${id}`,
        official: true,
        health: "verified",
        verifiedAt: OBSERVED_AT,
        verificationMethod: "fixture"
      }
    ],
    lastFetchedAt: OBSERVED_AT
  });
}

function batch(sourceId: string, records: BenefitRecord[]): SourceSyncBatch {
  return {
    observation: {
      sourceId,
      status: "ok",
      retrievedAt: OBSERVED_AT,
      recordCount: records.length,
      adapterVersion: "adapter-1"
    },
    sourceRevision: "rev-1",
    complete: true,
    records
  };
}

function temporaryDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), "mcp-snapshot-store-")), "test.db");
}
