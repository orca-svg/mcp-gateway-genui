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
import { hashCanonicalJson } from "./canonical-json.js";
import { BenefitIngestionService, IngestionError } from "./ingestion-service.js";
import { SnapshotStore } from "./sqlite-store.js";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const SOURCE_ID = "source-one";
const SOURCE_REVISION = "rev-1";
const FIRST_OBSERVED_AT = "2026-07-10T00:00:00.000Z";
const SECOND_OBSERVED_AT = "2026-07-11T00:00:00.000Z";
const RAW_CONTENT_HASH = "a".repeat(64);

describe("BenefitIngestionService", () => {
  it("creates no event for identical content and updates only lastObservedAt", () => {
    const path = temporaryDatabasePath();
    const store = new SnapshotStore(path);
    const service = serviceAt(store, "2026-07-10T00:01:00.000Z");
    const first = benefitRecord();

    expect(service.syncSource(syncBatch([first]))).toMatchObject({
      created: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0
    });

    const reobserved = benefitRecord({
      lastFetchedAt: SECOND_OBSERVED_AT,
      provenance: first.provenance.map((item) => ({
        ...item,
        observedAt: SECOND_OBSERVED_AT
      })),
      links: first.links.map((link) => ({
        ...link,
        verifiedAt: SECOND_OBSERVED_AT
      }))
    });
    const result = service.syncSource(
      syncBatch([reobserved], { retrievedAt: SECOND_OBSERVED_AT })
    );

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 1,
      events: []
    });
    expect(store.getChangeLogPage().entries).toHaveLength(1);

    const database = new DatabaseSync(path) as DatabaseSyncInstance;
    const row = database
      .prepare(
        "select payload, last_observed_at from source_snapshots_v2 where source_id = ? and entity_id = ?"
      )
      .get(SOURCE_ID, first.id) as { payload: string; last_observed_at: string };
    expect(row.last_observed_at).toBe(SECOND_OBSERVED_AT);
    expect(JSON.parse(row.payload)).toMatchObject({ lastFetchedAt: FIRST_OBSERVED_AT });
    database.close();
    store.close();
  });

  it("emits one update with exact sorted paths, source revision, and canonical hash", () => {
    const store = new SnapshotStore(temporaryDatabasePath());
    const service = serviceAt(store, "2026-07-10T00:01:00.000Z");
    const first = benefitRecord();
    service.syncSource(syncBatch([first]));

    const updated = benefitRecord({ summary: "Updated public summary." });
    const result = service.syncSource(
      syncBatch([updated], { retrievedAt: SECOND_OBSERVED_AT })
    );

    expect(result).toMatchObject({ created: 0, updated: 1, deleted: 0, unchanged: 0 });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      entityId: updated.id,
      changeType: "updated",
      changedPaths: ["/summary"],
      sourceId: SOURCE_ID,
      sourceRevision: SOURCE_REVISION,
      contentHash: hashCanonicalJson(updated)
    });
    expect(store.getChangeLogPage().entries.map((entry) => entry.changeType)).toEqual([
      "updated",
      "created"
    ]);
    store.close();
  });

  it("deletes missing records only after a complete successful source sync", () => {
    const path = temporaryDatabasePath();
    const store = new SnapshotStore(path);
    const service = serviceAt(store, "2026-07-10T00:01:00.000Z");
    const kept = benefitRecord({ id: "benefit-kept", sourceRecordId: "kept" });
    const removed = benefitRecord({ id: "benefit-removed", sourceRecordId: "removed" });
    service.syncSource(syncBatch([kept, removed]));

    const result = service.syncSource(
      syncBatch([kept], { retrievedAt: SECOND_OBSERVED_AT })
    );

    expect(result).toMatchObject({ created: 0, updated: 0, deleted: 1, unchanged: 1 });
    expect(result.events).toEqual([
      expect.objectContaining({
        entityId: removed.id,
        changeType: "deleted",
        changedPaths: [""],
        contentHash: hashCanonicalJson(removed)
      })
    ]);
    expect(snapshotCount(path, SOURCE_ID)).toBe(1);
    store.close();
  });

  it("never deletes on partial or failed observations", () => {
    const path = temporaryDatabasePath();
    const store = new SnapshotStore(path);
    const service = serviceAt(store, "2026-07-10T00:01:00.000Z");
    const first = benefitRecord({ id: "benefit-one", sourceRecordId: "one" });
    const second = benefitRecord({ id: "benefit-two", sourceRecordId: "two" });
    service.syncSource(syncBatch([first, second]));

    const partialResult = service.syncSource(
      syncBatch([benefitRecord({ id: first.id, sourceRecordId: "one", summary: "Changed." })], {
        status: "partial",
        complete: true,
        retrievedAt: SECOND_OBSERVED_AT
      })
    );
    const failureResult = service.syncSource(
      syncBatch([], {
        status: "unavailable",
        complete: true,
        retrievedAt: "2026-07-12T00:00:00.000Z"
      })
    );

    expect(partialResult).toMatchObject({ updated: 1, deleted: 0 });
    expect(failureResult).toMatchObject({
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      events: []
    });
    expect(snapshotCount(path, SOURCE_ID)).toBe(2);
    expect(
      store.getChangeLogPage().entries.some((entry) => entry.changeType === "deleted")
    ).toBe(false);
    store.close();
  });

  it("rolls back a failed batch transaction and exposes no sensitive input", () => {
    const path = temporaryDatabasePath();
    const store = new SnapshotStore(path);
    const service = serviceAt(store, "2026-07-10T00:01:00.000Z");
    const sensitive = benefitRecord({
      title: "resident-secret-123",
      summary: "upstream-secret-body"
    });

    let transactionError: IngestionError | undefined;
    try {
      service.syncSource(syncBatch([sensitive, sensitive]));
    } catch (error) {
      transactionError = error as IngestionError;
    }
    expect(transactionError).toBeInstanceOf(IngestionError);
    expect(transactionError).toMatchObject({ code: "storage_failure" });
    expect(JSON.stringify(transactionError)).not.toContain("resident-secret-123");
    expect(JSON.stringify(transactionError)).not.toContain("upstream-secret-body");
    expect(transactionError?.stack).toBeUndefined();
    expect(snapshotCount(path, SOURCE_ID)).toBe(0);
    expect(store.getChangeLogPage().entries).toEqual([]);

    const invalid = {
      ...syncBatch([sensitive]),
      residentNumber: "resident-secret-123"
    };
    expect(() => service.syncSource(invalid)).toThrow(
      expect.objectContaining({ code: "invalid_batch" })
    );
    try {
      service.syncSource(invalid);
    } catch (error) {
      expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(
        "resident-secret-123"
      );
    }
    store.close();
  });
});

function serviceAt(store: SnapshotStore, timestamp: string): BenefitIngestionService {
  return new BenefitIngestionService(store, { now: () => new Date(timestamp) });
}

function benefitRecord(overrides: Partial<BenefitRecord> = {}): BenefitRecord {
  const id = overrides.id ?? "benefit-one";
  const sourceId = overrides.sourceId ?? SOURCE_ID;
  const sourceRecordId = overrides.sourceRecordId ?? "record-one";
  const sourceRevision = overrides.sourceRevision ?? SOURCE_REVISION;
  const contentHash = overrides.contentHash ?? RAW_CONTENT_HASH;
  return BenefitRecordSchema.parse({
    id,
    sourceId,
    sourceRecordId,
    sourceRevision,
    contentHash,
    title: "Public benefit",
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
        sourceRecordId,
        authority: "authoritative_structured",
        contentHash,
        observedAt: FIRST_OBSERVED_AT,
        sourceRevision
      }
    ],
    links: [
      {
        rel: "source",
        url: `https://example.test/${id}`,
        official: true,
        health: "verified",
        verifiedAt: FIRST_OBSERVED_AT,
        verificationMethod: "fixture"
      }
    ],
    lastFetchedAt: FIRST_OBSERVED_AT,
    ...overrides
  });
}

function syncBatch(
  records: BenefitRecord[],
  overrides: {
    status?: SourceSyncBatch["observation"]["status"];
    complete?: boolean;
    retrievedAt?: string;
    sourceRevision?: string;
  } = {}
): SourceSyncBatch {
  return {
    observation: {
      sourceId: SOURCE_ID,
      status: overrides.status ?? "ok",
      retrievedAt: overrides.retrievedAt ?? FIRST_OBSERVED_AT,
      recordCount: records.length,
      adapterVersion: "adapter-1"
    },
    sourceRevision: overrides.sourceRevision ?? SOURCE_REVISION,
    complete: overrides.complete ?? true,
    records
  };
}

function temporaryDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), "mcp-ingestion-")), "test.db");
}

function snapshotCount(path: string, sourceId: string): number {
  const database = new DatabaseSync(path) as DatabaseSyncInstance;
  const row = database
    .prepare("select count(*) as count from source_snapshots_v2 where source_id = ?")
    .get(sourceId) as { count: number };
  database.close();
  return row.count;
}
