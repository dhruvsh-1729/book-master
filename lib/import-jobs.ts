import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export type ImportJobEvent =
  | {
      type:
        | "job-created"
        | "job-started"
        | "job-completed"
        | "job-failed"
        | "file-start"
        | "file-complete"
        | "sheet-start"
        | "sheet-complete"
        | "row-success"
        | "row-error"
        | "file-error";
      payload: Record<string, any>;
    }
  | {
      type: "summary";
      payload: ImportJobSummary;
    };

export interface ImportFileSummary {
  fileName: string;
  fileType: string;
  sheets: Array<{
    name: string;
    created: number;
    skipped: number;
    errors: RowError[];
    error?: string;
  }>;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

export interface RowError {
  rowIndex: number;
  message: string;
  fields?: string[];
}

export interface ImportJobSummary {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  userId: string;
  files: ImportFileSummary[];
  startedAt: string;
  finishedAt?: string;
  totalCreated: number;
  totalSkipped: number;
}

interface ImportJob {
  id: string;
  userId: string;
  status: ImportJobSummary["status"];
  emitter: EventEmitter;
  events: ImportJobEvent[];
  summary: ImportJobSummary;
}

export class ImportJobManager {
  private jobs = new Map<string, ImportJob>();

  createJob(userId: string, files: { fileName: string; fileType: string }[]) {
    const id = randomUUID();
    const emitter = new EventEmitter();
    emitter.setMaxListeners(1000);

    const summary: ImportJobSummary = {
      jobId: id,
      status: "pending",
      userId,
      startedAt: new Date().toISOString(),
      files: files.map((f) => ({
        fileName: f.fileName,
        fileType: f.fileType,
        sheets: [],
        status: "pending",
      })),
      totalCreated: 0,
      totalSkipped: 0,
    };

    const job: ImportJob = {
      id,
      userId,
      status: "pending",
      emitter,
      events: [],
      summary,
    };

    this.jobs.set(id, job);
    this.emit(job, { type: "job-created", payload: { jobId: id } });
    this.emit(job, { type: "summary", payload: summary });
    return job;
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId);
  }

  emit(job: ImportJob, event: ImportJobEvent) {
    job.events.push(event);
    job.emitter.emit("event", event);
  }

  updateSummary(job: ImportJob, updater: (draft: ImportJobSummary) => void) {
    updater(job.summary);
    this.emit(job, { type: "summary", payload: job.summary });
  }

  completeJob(job: ImportJob, status: ImportJobSummary["status"], error?: string) {
    job.status = status;
    this.updateSummary(job, (draft) => {
      draft.status = status;
      draft.finishedAt = new Date().toISOString();
      if (error) {
        draft.files.forEach((file) => {
          if (file.status === "processing") {
            file.status = "failed";
            file.error = error;
          }
        });
      }
    });
    this.emit(job, {
      type: status === "completed" ? "job-completed" : "job-failed",
      payload: { jobId: job.id, error },
    });
  }
}

declare global {
  var __IMPORT_JOB_MANAGER__: ImportJobManager | undefined;
}

export const importJobManager =
  globalThis.__IMPORT_JOB_MANAGER__ ?? (globalThis.__IMPORT_JOB_MANAGER__ = new ImportJobManager());
