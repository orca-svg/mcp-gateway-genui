import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BenefitRecord,
  BenefitRepositoryDetailResult,
  BenefitRepositoryResult,
  DataStatus
} from "@mcp-gen-ui/schema";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { GatewayError } from "./errors.js";
import { fixtureBenefits } from "./fixtures.js";
import { BenefitIngestionService } from "./ingestion-service.js";
import type { BenefitRepository } from "./repository.js";
import { FixtureBenefitRepository } from "./repository.js";
import { SnapshotStore } from "./sqlite-store.js";
import {
  BenefitToolService,
  NON_ELIGIBILITY_DISCLAIMER
} from "./tool-service.js";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const NOW = "2026-07-10T00:00:00.000Z";

describe("BenefitToolService v2", () => {
  it("rejects unknown profile fields and unsafe query normalization before repository access", async () => {
    const search = vi.fn(async (): Promise<BenefitRepositoryResult> => ({
      records: fixtureBenefits,
      dataStatus: fixtureDataStatus(fixtureBenefits.length)
    }));
    const repository: BenefitRepository = {
      mode: "fixture",
      search,
      async getById(): Promise<BenefitRepositoryDetailResult> {
        return { dataStatus: fixtureDataStatus(0) };
      }
    };
    const service = fixedService(repository);

    await expect(
      service.searchBenefits({
        query: "청년 주거",
        profile: { regionCode: "KR-11", email: "person@example.test" }
      })
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      service.searchBenefits({ query: " 청년 주거 ", profile: {} })
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      service.searchBenefits({
        query: "청년 주거",
        profile: {},
        residentNumber: "000000-0000000"
      })
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(search).not.toHaveBeenCalled();
  });

  it("returns the strict v2 search envelope with ranking policy and visible fixture status", async () => {
    const service = fixedFixtureService();

    const response = await service.searchBenefits({
      query: "청년 주거",
      profile: {
        regionCode: "KR-11",
        ageBand: "twenties",
        studentStatus: "not_student",
        employmentStatus: "unemployed",
        householdType: "single",
        interests: ["housing"],
        persona: "general"
      }
    });

    expect(response).toMatchObject({
      schemaVersion: "benefit-search.v2",
      query: "청년 주거",
      rankingPolicy: {
        scoreMeaning: "relative_relevance_not_eligibility",
        persona: "general"
      },
      dataStatus: {
        mode: "fixture",
        partial: false,
        sources: [
          expect.objectContaining({
            sourceId: "fixture-benefits",
            status: "ok",
            recordCount: fixtureBenefits.length,
            adapterVersion: "2.0.0-fixture"
          })
        ]
      },
      generatedAt: NOW
    });
    expect(response.results).toHaveLength(fixtureBenefits.length);
    expect(response.results[0]).toEqual(
      expect.objectContaining({
        assessment: expect.objectContaining({ status: expect.any(String) }),
        ranking: expect.objectContaining({
          score: expect.any(Number),
          breakdown: expect.any(Array)
        }),
        provenance: expect.any(Array),
        links: expect.any(Array)
      })
    );
  });

  it("throws a retryable GatewayError when every source fails", async () => {
    const dataStatus: DataStatus = {
      mode: "live",
      partial: false,
      sources: [
        {
          sourceId: "broken-source",
          status: "unavailable",
          retrievedAt: NOW,
          recordCount: 0,
          errorCode: "upstream_unavailable",
          adapterVersion: "adapter-2"
        }
      ]
    };
    const repository: BenefitRepository = {
      mode: "live",
      async search() {
        return { records: [], dataStatus };
      },
      async getById() {
        return { dataStatus };
      }
    };

    let error: GatewayError | undefined;
    try {
      await fixedService(repository).searchBenefits({ query: "주거 지원" });
    } catch (value) {
      error = value as GatewayError;
    }

    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({
      code: "all_sources_failed",
      retryable: true,
      dataStatus
    });
  });

  it("retains authoritative conflicts as candidates for user verification", async () => {
    const response = await fixedFixtureService().searchBenefits({
      query: "서울 월세",
      profile: {
        regionCode: "KR-26",
        ageBand: "fifties",
        householdType: "family"
      }
    });

    const conflict = response.results.find(
      (candidate) => candidate.id === "seoul-youth-rent-support"
    );
    expect(conflict).toBeDefined();
    expect(conflict?.assessment.status).toBe("conflict_detected");
    expect(
      conflict?.assessment.constraints.some(
        (constraint) =>
          constraint.basis === "authoritative_structured" &&
          constraint.outcome === "conflict"
      )
    ).toBe(true);
  });

  it("returns detail, checklist, and guide envelopes with direct provenance and links", async () => {
    const service = fixedFixtureService();
    const id = "seoul-youth-rent-support";
    const source = fixtureBenefits.find((record) => record.id === id)!;

    const detail = await service.getBenefitDetail({ id });
    const checklist = await service.buildChecklist({ benefitId: id });
    const guide = await service.getApplicationGuide({ benefitId: id });

    expect(detail).toMatchObject({
      schemaVersion: "benefit-detail.v2",
      dataStatus: { mode: "fixture" },
      result: {
        id,
        documents: source.documents,
        provenance: source.provenance,
        links: source.links
      },
      generatedAt: NOW
    });
    expect(checklist).toMatchObject({
      schemaVersion: "application-checklist.v2",
      benefitId: id,
      items: source.documents,
      caveats: [NON_ELIGIBILITY_DISCLAIMER],
      provenance: source.provenance,
      links: source.links,
      generatedAt: NOW
    });
    expect(guide).toMatchObject({
      schemaVersion: "application-guide.v2",
      benefitId: id,
      provenance: source.provenance,
      links: source.links,
      generatedAt: NOW
    });
    expect(guide.steps).toHaveLength(3);
    expect(guide.steps.every((step) => step.requiresUserAction)).toBe(true);
    expect(guide.safetyNotice).toContain("does not log in");
  });

  it("validates deadline bounds and returns in-window candidates by ascending deadline", async () => {
    const records = [
      deadlineRecord("deadline-later", "2026-07-15T00:00:00.000Z"),
      deadlineRecord("deadline-sooner", "2026-07-12T00:00:00.000Z"),
      deadlineRecord("deadline-boundary", "2026-08-09T00:00:00.000Z"),
      deadlineRecord("deadline-outside", "2026-08-10T00:00:00.000Z"),
      deadlineRecord("deadline-past", "2026-07-09T00:00:00.000Z"),
      deadlineRecord("deadline-unknown")
    ];
    const service = fixedFixtureService(records);

    await expect(service.getUpcomingDeadlines({ withinDays: 0 })).rejects.toMatchObject({
      name: "ZodError"
    });
    await expect(service.getUpcomingDeadlines({ withinDays: 366 })).rejects.toMatchObject({
      name: "ZodError"
    });

    const response = await service.getUpcomingDeadlines({ withinDays: 30 });
    expect(response).toMatchObject({
      schemaVersion: "upcoming-deadlines.v2",
      withinDays: 30,
      dataStatus: { mode: "fixture" },
      rankingPolicy: { scoreMeaning: "relative_relevance_not_eligibility" },
      generatedAt: NOW
    });
    expect(response.results.map((candidate) => candidate.id)).toEqual([
      "deadline-sooner",
      "deadline-later",
      "deadline-boundary"
    ]);
    expect(response.results.map((candidate) => candidate.applicationDeadline)).toEqual([
      "2026-07-12T00:00:00.000Z",
      "2026-07-15T00:00:00.000Z",
      "2026-08-09T00:00:00.000Z"
    ]);
  });

  it("lists every built-in persona in a versioned response", async () => {
    const response = await fixedFixtureService().listPersonas();

    expect(response).toMatchObject({
      schemaVersion: "persona-list.v2",
      dataStatus: {
        mode: "fixture",
        sources: [
          expect.objectContaining({
            sourceId: "gateway-core",
            recordCount: 6,
            adapterVersion: "2.0.0-test"
          })
        ]
      },
      generatedAt: NOW
    });
    expect(response.personas.map((persona) => persona.id).sort()).toEqual([
      "general",
      "newlywed_family",
      "senior",
      "single_parent",
      "university_student",
      "youth_jobseeker"
    ]);
    expect(response.personas.every((persona) => persona.weights.query >= 0)).toBe(true);
  });

  it("reads paginated change history without creating additional events", async () => {
    const store = new SnapshotStore(temporaryDatabasePath());
    const ingestion = new BenefitIngestionService(store, { now: fixedNow });
    ingestion.syncSource({
      observation: {
        sourceId: fixtureBenefits[0]!.sourceId,
        status: "ok",
        retrievedAt: NOW,
        recordCount: fixtureBenefits.length,
        adapterVersion: "fixture-ingestion-2"
      },
      sourceRevision: fixtureBenefits[0]!.sourceRevision,
      complete: true,
      records: fixtureBenefits
    });
    const initialEventCount = store.getChangeLogPage({ limit: 100 }).entries.length;
    const service = fixedFixtureService(fixtureBenefits, store);

    const firstPage = await service.getChangeLog({ limit: 2 });
    const secondPage = await service.getChangeLog({
      limit: 2,
      cursor: firstPage.nextCursor
    });

    expect(firstPage).toMatchObject({
      schemaVersion: "benefit-change-log.v2",
      dataStatus: { mode: "fixture" },
      entries: expect.any(Array),
      nextCursor: expect.any(String),
      generatedAt: NOW
    });
    expect(firstPage.entries).toHaveLength(2);
    expect(secondPage.entries).toHaveLength(fixtureBenefits.length - 2);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(
      new Set([...firstPage.entries, ...secondPage.entries].map((entry) => entry.id)).size
    ).toBe(fixtureBenefits.length);
    expect(store.getChangeLogPage({ limit: 100 }).entries).toHaveLength(
      initialEventCount
    );
    store.close();
  });

  it("maps a malformed opaque change-log cursor to a stable validation error", async () => {
    const store = new SnapshotStore(temporaryDatabasePath());
    const service = fixedFixtureService(fixtureBenefits, store);

    await expect(
      service.getChangeLog({ cursor: "syntactically-valid-but-malformed" })
    ).rejects.toMatchObject({
      name: "GatewayError",
      code: "validation_error",
      retryable: false
    });
    store.close();
  });

  it("performs no snapshot or change writes from any benefit read tool", async () => {
    const path = temporaryDatabasePath();
    const store = new SnapshotStore(path);
    const service = fixedFixtureService(fixtureBenefits, store);

    await service.searchBenefits({ query: "청년 주거" });
    await service.getBenefitDetail({ id: fixtureBenefits[0]!.id });
    await service.getUpcomingDeadlines({});
    await service.buildChecklist({ benefitId: fixtureBenefits[0]!.id });
    await service.getApplicationGuide({ benefitId: fixtureBenefits[0]!.id });

    expect(v2WriteCounts(path)).toEqual({ snapshots: 0, changes: 0 });
    store.close();
  });
});

function fixedService(
  repository: BenefitRepository,
  changeLog?: SnapshotStore
): BenefitToolService {
  return new BenefitToolService(repository, changeLog, {
    now: fixedNow,
    gatewayVersion: "2.0.0-test"
  });
}

function fixedFixtureService(
  records: BenefitRecord[] = fixtureBenefits,
  changeLog?: SnapshotStore
): BenefitToolService {
  return fixedService(
    new FixtureBenefitRepository(records, { now: fixedNow }),
    changeLog
  );
}

function fixedNow(): Date {
  return new Date(NOW);
}

function fixtureDataStatus(recordCount: number): DataStatus {
  return {
    mode: "fixture",
    partial: false,
    sources: [
      {
        sourceId: "fixture",
        status: "ok",
        retrievedAt: NOW,
        recordCount,
        adapterVersion: "2.0.0-fixture"
      }
    ]
  };
}

function deadlineRecord(id: string, applicationDeadline?: string): BenefitRecord {
  const base = fixtureBenefits[0]!;
  return {
    ...base,
    id,
    sourceRecordId: id,
    contentHash: "d".repeat(64),
    title: `Deadline ${id}`,
    summary: `Deadline fixture for ${id}.`,
    ...(applicationDeadline ? { applicationDeadline } : { applicationDeadline: undefined }),
    provenance: base.provenance.map((item) => ({ ...item, sourceRecordId: id })),
    links: base.links.map((link) => ({
      ...link,
      url: `https://example.test/${id}/${link.rel}`
    }))
  };
}

function temporaryDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), "mcp-tool-service-")), "test.db");
}

function v2WriteCounts(path: string): { snapshots: number; changes: number } {
  const database = new DatabaseSync(path) as DatabaseSyncInstance;
  const snapshots = database
    .prepare("select count(*) as count from source_snapshots_v2")
    .get() as { count: number };
  const changes = database
    .prepare("select count(*) as count from change_log_v2")
    .get() as { count: number };
  database.close();
  return { snapshots: snapshots.count, changes: changes.count };
}
