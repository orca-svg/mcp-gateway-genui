import { SourceSyncBatchSchema, type SourceSyncBatch } from "@mcp-gen-ui/schema";
import type { SnapshotStore, SourceSyncResult } from "./sqlite-store.js";

const INGESTION_ERROR_MESSAGES = {
  invalid_batch: "Source sync batch is invalid.",
  storage_failure: "Source sync could not be persisted."
} as const;

export type IngestionErrorCode = keyof typeof INGESTION_ERROR_MESSAGES;

/** A stable ingestion failure that intentionally retains no input or cause. */
export class IngestionError extends Error {
  readonly code: IngestionErrorCode;

  constructor(code: IngestionErrorCode) {
    super(INGESTION_ERROR_MESSAGES[code]);
    this.name = "IngestionError";
    this.code = code;
    this.stack = undefined;
  }

  toJSON(): {
    name: "IngestionError";
    code: IngestionErrorCode;
    message: string;
  } {
    return { name: "IngestionError", code: this.code, message: this.message };
  }
}

export interface BenefitIngestionServiceOptions {
  now?: () => Date;
}

/** The sole public write path for source snapshot and change-history state. */
export class BenefitIngestionService {
  private readonly now: () => Date;

  constructor(
    private readonly store: SnapshotStore,
    options: BenefitIngestionServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  syncSource(input: unknown): SourceSyncResult {
    const batch = parseAndValidateBatch(input);
    if (!isProcessableObservation(batch.observation.status)) {
      return emptySyncResult(batch);
    }

    let eventCreatedAt: string;
    try {
      eventCreatedAt = this.now().toISOString();
    } catch {
      throw new IngestionError("invalid_batch");
    }

    try {
      return this.store.applySourceSync(batch, eventCreatedAt);
    } catch {
      throw new IngestionError("storage_failure");
    }
  }
}

function parseAndValidateBatch(input: unknown): SourceSyncBatch {
  let batch: SourceSyncBatch;
  try {
    batch = SourceSyncBatchSchema.parse(input);
  } catch {
    throw new IngestionError("invalid_batch");
  }

  if (batch.observation.recordCount !== batch.records.length) {
    throw new IngestionError("invalid_batch");
  }
  if (
    batch.records.some(
      (record) =>
        record.sourceId !== batch.observation.sourceId ||
        record.sourceRevision !== batch.sourceRevision
    )
  ) {
    throw new IngestionError("invalid_batch");
  }
  return batch;
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

function isProcessableObservation(
  status: SourceSyncBatch["observation"]["status"]
): boolean {
  return status === "ok" || status === "partial";
}
