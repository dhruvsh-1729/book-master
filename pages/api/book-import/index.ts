import type { NextApiRequest, NextApiResponse } from "next";
import { parse } from "csv-parse/sync";
import XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";
import { importJobManager, RowError } from "@/lib/import-jobs";

type BookRecord = Awaited<ReturnType<typeof prisma.bookMaster.create>>;

interface BookPayload {
  libraryNumber: string;
  bookName: string;
  bookSummary: string | null;
  pageNumbers: string | null;
  grade: string | null;
  remark: string | null;
  edition: string | null;
  publisherName: string | null;
}

interface JobImportCaches {
  books: Map<string, Promise<BookRecord>>;
  transactionKeys: Map<string, Set<string>>;
  genericSubjects: Map<string, Promise<{ id: string; name: string }>>;
  specificTags: Map<string, Promise<{ id: string; name: string; category: string | null }>>;
  transactionLookups: Map<
    string,
    {
      bySrNo: Map<number, string>;
      byTitle: Map<string, string>;
    }
  >;
}

const CSV_PARSE_OPTIONS = {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  relax_quotes: true,
  relax_column_count: true,
  relax_column_count_less: true,
  trim: true,
};

const COLS = {
  libraryNumber: ["Sr No."],
  bookName: ["bookName", "Book Name", "Title", "Book", "Generic Subject"],
  bookSummary: ["bookSummary", "Book Summary", "Summary (Book)", "Book_Summary"],
  pageNumbers: ["pageNumbers", "Pages", "Page Numbers", "Total Pages"],
  grade: ["grade", "Grade", "Class"],
  remark: ["remark", "Remarks", "Book Remark"],
  edition: ["edition", "Edition"],
  publisherName: ["publisherName", "Publisher", "Publisher Name"],
  srNo: ["srNo", "Sr No", "SR No", "S.No", "Sr", "Index", "Sr No."],
  title: ["title", "Title", "Topic"],
  keywords: ["keywords", "Keywords", "Keyword"],
  relevantParagraph: [
    "relevantParagraph",
    "Relevant Paragraph",
    "Paragraph (JSON/Text)",
    "Relevant Para",
    "Excerpts",
  ],
  paragraphNo: ["paragraphNo", "Paragraph No", "Para No"],
  pageNo: ["pageNo", "Page No", "Page"],
  informationRating: ["informationRating", "Information Rating", "Rating"],
  itemRemark: ["remark", "Remarks", "Item Remark", "Txn Remark", "Remark"],
  summary: ["summary", "Summary"],
  conclusion: ["conclusion", "Conclusion"],
  genericSubjectName: ["genericSubject", "Generic Subject", "Subject (Generic)"],
  specificTagName: ["specificSubject", "Specific Subject", "Tag", "Specific"],
  tagCategory: ["category", "Tag Category", "Specific Category"],
} as const;

const TRANSACTION_CONCURRENCY = 8;

const EXPORT_HEADERS = [
  { key: "srNo", label: "Sr No", source: "transaction" },
  { key: "genericSubjectName", label: "Generic Subject", source: "transaction-extra" },
  { key: "specificTagName", label: "Specific Subject", source: "transaction-extra" },
  { key: "tagCategory", label: "Specific Category", source: "transaction-extra" },
  { key: "title", label: "Title", source: "transaction" },
  { key: "keywords", label: "Keywords", source: "transaction" },
  { key: "images", label: "Images", source: "transaction" },
  { key: "relevantParagraph", label: "Relevant Paragraph", source: "transaction" },
  { key: "footNote", label: "Footnote", source: "transaction" },
  { key: "paragraphNo", label: "Paragraph No", source: "transaction" },
  { key: "pageNo", label: "Page No", source: "transaction" },
  { key: "informationRating", label: "Information Rating", source: "transaction" },
  { key: "itemRemark", label: "Txn Remark", source: "transaction" },
  { key: "summary", label: "Summary", source: "transaction" },
  { key: "conclusion", label: "Conclusion", source: "transaction" },
];

const BOOK_OVERVIEW_FIELDS = [
  { key: "libraryNumber", label: "Library Number" },
  { key: "bookName", label: "Book Name" },
  { key: "bookSummary", label: "Book Summary" },
  { key: "pageNumbers", label: "Page Numbers" },
  { key: "grade", label: "Grade" },
  { key: "remark", label: "Book Remark" },
  { key: "edition", label: "Edition" },
  { key: "publisherName", label: "Publisher Name" },
  { key: "editors", label: "Editors" },
  { key: "coverImageUrl", label: "Cover Image" },
  { key: "bookImages", label: "Book Images" },
] as const;

const EXPORT_VARIANTS = {
  TRANSACTIONS: "transactions",
  BOOK_OVERVIEW: "book-overview",
} as const;

const truthy = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

const normalizeHeaderKey = (k: unknown) =>
  String(k ?? "")
    .replace(/^[\uFEFF]/, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeText = (value: unknown) =>
  typeof value === "string"
    ? value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";

// Extra normalization for matching (case-insensitive, ignores punctuation & extra spaces)
const normalizeForMatch = (k: unknown) =>
  normalizeHeaderKey(k)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeRowKeys = (row: Record<string, any>) => {
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    out[normalizeHeaderKey(key)] = row[key];
  }
  return out;
};

const asAliasList = (aliases?: readonly string[]) => (aliases ? [...aliases] : []);

/**
 * Smart column picker:
 * - Normalizes both header names & aliases
 * - Ignores case, punctuation, extra spaces
 * - Tries exact match, then prefix, then substring
 *   e.g. "Sr.No." ↔ "Sr No", "Title / Heading" ↔ "Title",
 *        "Relevant Paragraph / Excerpts" ↔ "Relevant Paragraph"
 */
const pickCol = (row: Record<string, unknown>, aliases?: readonly string[]) => {
  const list = asAliasList(aliases);
  if (!list.length) return undefined;

  const entries = Object.entries(row).map(([key, value]) => ({
    key,
    value,
    normKey: normalizeForMatch(key),
  }));

  for (const alias of list) {
    const normAlias = normalizeForMatch(alias);
    if (!normAlias) continue;

    // 1) exact normalized match
    let candidate = entries.find((e) => e.normKey === normAlias);

    // 2) prefix match (either way)
    if (!candidate) {
      candidate = entries.find(
        (e) => e.normKey.startsWith(normAlias) || normAlias.startsWith(e.normKey)
      );
    }

    // 3) substring match (either way)
    if (!candidate) {
      candidate = entries.find(
        (e) => e.normKey.includes(normAlias) || normAlias.includes(e.normKey)
      );
    }

    if (candidate && truthy(candidate.value)) {
      return String(candidate.value).trim();
    }
  }

  return undefined;
};

const maybeParseJSON = (value?: string) => {
  if (!truthy(value)) return null;
  const input = String(value).trim();
  if (!(input.startsWith("{") || input.startsWith("["))) return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};

const escapeCsv = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const normalized = String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return `"${normalized.replace(/"/g, '""')}"`;
};

const toStr = (v: unknown) =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";

const splitMultiValues = (raw?: string) => {
  if (!truthy(raw)) return [];
  return String(raw)
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const joinMultiValues = (values: (string | null | undefined)[]) =>
  values
    .filter(Boolean)
    .map((v) => String(v))
    .join("; ");

const collectImageUrls = (
  primary?: string | null,
  list?: Array<{ url?: string | null } | null>
): string[] => {
  const urls = new Set<string>();
  if (truthy(primary)) urls.add(String(primary).trim());
  (list || []).forEach((img) => {
    if (img?.url && truthy(img.url)) {
      urls.add(String(img.url).trim());
    }
  });
  return Array.from(urls);
};

const formatImageCell = (urls: string[]) => (urls.length ? escapeCsv(urls.join("; ")) : "");

const formatEditors = (editors?: Array<{ name?: string | null; role?: string | null } | null>) => {
  if (!editors || !editors.length) return "";
  const parts = editors
    .map((e) => {
      const name = truthy(e?.name) ? String(e?.name).trim() : "";
      const role = truthy(e?.role) ? String(e?.role).trim() : "";
      if (!name) return null;
      return role ? `${name} (${role})` : name;
    })
    .filter(Boolean);
  return escapeCsv(parts.join("; "));
};

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  if (!items.length) return;
  const queue = [...items];
  const size = Math.min(limit, queue.length);
  const runners = Array.from({ length: size }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (next) {
        await worker(next);
      }
    }
  });
  await Promise.all(runners);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  if (req.method === "POST") {
    return startImportJob(req, res, userId);
  }

  if (req.method === "GET") {
    return handleExport(req, res, userId);
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

interface IncomingFilePayload {
  name?: string;
  type?: string;
  data?: string; // base64
  csvText?: string;
}

interface PreparedFile {
  fileName: string;
  fileType: string;
  buffer?: Buffer;
  csvText?: string;
}

async function startImportJob(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const body = req.body ?? {};
  const filesPayload: IncomingFilePayload[] = Array.isArray(body.files)
    ? body.files
    : body.csvText
    ? [{ name: body.fileName || "upload.csv", type: "text/csv", csvText: body.csvText }]
    : [];

  if (!filesPayload.length) {
    return res.status(400).json({ error: "No files provided. Upload a CSV or XLSX file." });
  }

  let preparedFiles: PreparedFile[] = [];
  try {
    preparedFiles = filesPayload.map((file) => normalizeIncomingFile(file));
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Invalid file payload" });
  }

  const job = importJobManager.createJob(
    userId,
    preparedFiles.map((file) => ({ fileName: file.fileName, fileType: file.fileType }))
  );

  try {
    // Kick off the import in the background so the client can subscribe to status updates.
    processImportJob(job.id, userId, preparedFiles, body.bookName).catch((error: any) => {
      const jobRef = importJobManager.getJob(job.id);
      if (jobRef) {
        importJobManager.completeJob(jobRef, "failed", error?.message || "Import failed");
      }
    });

    return res.status(202).json({ summary: job.summary });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Import failed" });
  }
}

function normalizeIncomingFile(file: IncomingFilePayload): PreparedFile {
  const fileName = file.name || "upload.csv";
  const inferredType = inferMimeType(fileName);
  const fileType = file.type || inferredType;

  if (file.csvText && truthy(file.csvText)) {
    return {
      fileName,
      fileType: fileType || "text/csv",
      csvText: String(file.csvText),
    };
  }

  if (!file.data) {
    throw new Error(`Missing file data for ${fileName}`);
  }

  return {
    fileName,
    fileType: fileType || "application/octet-stream",
    buffer: Buffer.from(file.data, "base64"),
  };
}

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "text/csv";
  return "application/octet-stream";
}

const isExcelFile = (file: PreparedFile) =>
  file.fileType.includes("sheet") || file.fileName.toLowerCase().endsWith(".xlsx") || file.fileName.toLowerCase().endsWith(".xls");

async function processImportJob(
  jobId: string,
  userId: string,
  files: PreparedFile[],
  explicitBookName?: string
) {
  const job = importJobManager.getJob(jobId);
  if (!job) return;

  const jobCaches: JobImportCaches = {
    books: new Map(),
    transactionKeys: new Map(),
    genericSubjects: new Map(),
    specificTags: new Map(),
    transactionLookups: new Map(),
  };

  // keep a global seen set to avoid duplicates across all files in same job
  const globalSeenKeys = new Set<string>();

  importJobManager.updateSummary(job, (draft) => {
    draft.status = "processing";
  });
  importJobManager.emit(job, { type: "job-started", payload: { jobId } });

  try {
    for (const file of files) {
      await processSingleFile(job, userId, file, jobCaches, globalSeenKeys, explicitBookName);
    }
  } catch (error: any) {
    importJobManager.completeJob(job, "failed", error?.message || "Import failed");
    return job.summary;
  }

  const hasFailures = job.summary.files.some((file) => file.status === "failed");
  importJobManager.completeJob(job, hasFailures ? "failed" : "completed");
  return job.summary;
}

async function processSingleFile(
  job: NonNullable<ReturnType<typeof importJobManager.getJob>>,
  userId: string,
  file: PreparedFile,
  caches: JobImportCaches,
  globalSeenKeys: Set<string>,
  explicitBookName?: string
) {
  if (!job) return;

  importJobManager.updateSummary(job, (draft) => {
    const target = draft.files.find((f) => f.fileName === file.fileName);
    if (target) {
      target.status = "processing";
      target.error = undefined;
    }
  });

  importJobManager.emit(job, {
    type: "file-start",
    payload: { jobId: job.id, fileName: file.fileName, fileType: file.fileType },
  });

  try {
    if (isExcelFile(file)) {
      await processExcelFile(job, userId, file, caches, globalSeenKeys, explicitBookName);
    } else {
      await processCsvFile(job, userId, file, caches, globalSeenKeys, explicitBookName);
    }

    importJobManager.updateSummary(job, (draft) => {
      const target = draft.files.find((f) => f.fileName === file.fileName);
      if (target) target.status = "completed";
    });
    importJobManager.emit(job, {
      type: "file-complete",
      payload: { jobId: job.id, fileName: file.fileName },
    });
  } catch (error: any) {
    importJobManager.updateSummary(job, (draft) => {
      const target = draft.files.find((f) => f.fileName === file.fileName);
      if (target) {
        target.status = "failed";
        target.error = error?.message || "Unknown error";
      }
    });
    importJobManager.emit(job, {
      type: "file-error",
      payload: { jobId: job.id, fileName: file.fileName, message: error?.message },
    });
    throw error;
  }
}

async function processCsvFile(
  job: NonNullable<ReturnType<typeof importJobManager.getJob>>,
  userId: string,
  file: PreparedFile,
  caches: JobImportCaches,
  globalSeenKeys: Set<string>,
  explicitBookName?: string
) {
  const csvText = file.csvText ?? file.buffer?.toString("utf8") ?? "";
  if (!csvText.trim()) {
    throw new Error("CSV file is empty");
  }

  const records = parseCsvOrThrow(csvText, file.fileName);
  if (!records.length) {
    throw new Error("No rows detected in CSV file");
  }

  await importFromRecords(job, userId, caches, {
    fileName: file.fileName,
    sheetName: undefined,
    records,
    globalSeenKeys,
    explicitBookName,
  });
}

async function processExcelFile(
  job: NonNullable<ReturnType<typeof importJobManager.getJob>>,
  userId: string,
  file: PreparedFile,
  caches: JobImportCaches,
  globalSeenKeys: Set<string>,
  explicitBookName?: string
) {
  if (!file.buffer) {
    throw new Error("Missing binary data for Excel file");
  }

  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames.length) {
    throw new Error("No sheets found in the workbook");
  }

  for (const sheetName of sheetNames) {
    importJobManager.emit(job, {
      type: "sheet-start",
      payload: { jobId: job.id, fileName: file.fileName, sheetName },
    });

    const sheet = workbook.Sheets[sheetName];
    const csvText = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (!csvText.trim()) {
      addSheetSummary(job, file.fileName, sheetName, { error: "Sheet is empty" });
      importJobManager.emit(job, {
        type: "sheet-complete",
        payload: { jobId: job.id, fileName: file.fileName, sheetName, skipped: 0, created: 0 },
      });
      continue;
    }

    try {
      const records = parseCsvOrThrow(csvText, `${file.fileName}::${sheetName}`);
      if (!records.length) {
        addSheetSummary(job, file.fileName, sheetName, { error: "No rows found in sheet" });
        continue;
      }

      await importFromRecords(job, userId, caches, {
        fileName: file.fileName,
        sheetName,
        records,
        globalSeenKeys,
        explicitBookName,
      });
    } catch (error: any) {
      addSheetSummary(job, file.fileName, sheetName, { error: error?.message });
      importJobManager.emit(job, {
        type: "row-error",
        payload: {
          jobId: job.id,
          fileName: file.fileName,
          sheetName,
          rowIndex: 1,
          message: error?.message,
        },
      });
    }

    importJobManager.emit(job, {
      type: "sheet-complete",
      payload: { jobId: job.id, fileName: file.fileName, sheetName },
    });
  }
}

function parseCsvOrThrow(csvText: string, contextLabel: string) {
  try {
    const records = parse(csvText, CSV_PARSE_OPTIONS) as Record<string, any>[];
    return records.map(normalizeRowKeys);
  } catch (error: any) {
    throw new Error(`CSV parse error in ${contextLabel}: ${error?.message || error}`);
  }
}

interface ImportTaskContext {
  fileName: string;
  sheetName?: string;
  records: Record<string, any>[];
  explicitBookName?: string;
  globalSeenKeys: Set<string>;
}

async function importFromRecords(
  job: NonNullable<ReturnType<typeof importJobManager.getJob>>,
  userId: string,
  caches: JobImportCaches,
  ctx: ImportTaskContext
) {
  const { fileName, sheetName, records, explicitBookName, globalSeenKeys } = ctx;
  if (!records.length) return;

  const sheetSummary = addSheetSummary(job, fileName, sheetName, { created: 0, skipped: 0, errors: [] });

  const first = records[0];
  const libraryNumber = pickCol(first, COLS.libraryNumber);
  let bookName = explicitBookName || pickCol(first, COLS.bookName);

  if (!truthy(libraryNumber)) {
    const message = "libraryNumber is required (first row)";
    pushRowError(job, sheetSummary, { rowIndex: 1, message, fields: ["libraryNumber"] }, fileName, sheetName);
    return;
  }

  if (!truthy(bookName)) {
    bookName = String(libraryNumber);
  }

  const bookData = {
    libraryNumber: String(libraryNumber).trim(),
    bookName: String(bookName).trim(),
    bookSummary: pickCol(first, COLS.bookSummary)?.trim() || null,
    pageNumbers: pickCol(first, COLS.pageNo)?.trim() || null,
    grade: pickCol(first, COLS.grade)?.trim() || null,
    remark: pickCol(first, COLS.remark)?.trim() || null,
    edition: pickCol(first, COLS.edition)?.trim() || null,
    publisherName: pickCol(first, COLS.publisherName)?.trim() || null,
  };

  const book = await getOrCreateBookForJob(userId, bookData, caches);
  const bookTransactionKey = book.id || `${userId}::${bookData.libraryNumber}`;
  let jobTransactionKeys = caches.transactionKeys.get(bookTransactionKey);
  if (!jobTransactionKeys) {
    jobTransactionKeys = new Set();
    caches.transactionKeys.set(bookTransactionKey, jobTransactionKeys);
  }

  const seenRowKeys = new Set<string>();
  const lookup = await getTransactionLookup(book.id, userId, caches);
  let nextAutoSrNo = 1;
  lookup.bySrNo.forEach((_id, key) => {
    if (typeof key === "number" && Number.isFinite(key)) {
      nextAutoSrNo = Math.max(nextAutoSrNo, key + 1);
    }
  });
  const transactionTasks: Array<{
    rowIndex: number;
    srNoValue: number;
    rowTitle: string;
    hasUserSrNo: boolean;
    hasUserTitle: boolean;
    genericNames: string[];
    specificNames: string[];
    tagCategory: string | null;
    keywords: string | null;
    relevantParagraph: any;
    paragraphNo: any;
    pageNo: any;
    informationRating: any;
    itemRemark: any;
    summary: any;
    conclusion: any;
  }> = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const rowIndex = i + 1;
    const hasUserSrNo = false;
    const baseSrNo = nextAutoSrNo++;

    const rawTitle = pickCol(row, COLS.title);
    const hasUserTitle = truthy(rawTitle);
    const rowTitle = hasUserTitle ? String(rawTitle) : "-";

    const genericNames = splitMultiValues(pickCol(row, COLS.genericSubjectName));
    const specificNames = splitMultiValues(pickCol(row, COLS.specificTagName));

    const normalizedTitleKey = normalizeText(rowTitle);
    const keyLabel = normalizedTitleKey || `row-${rowIndex}`;

    let srNoValue = baseSrNo;
    let dedupeKey = `${srNoValue}::${keyLabel}`;
    const hasConflict = () =>
      seenRowKeys.has(dedupeKey) ||
      jobTransactionKeys.has(dedupeKey) ||
      globalSeenKeys.has(dedupeKey) ||
      lookup.bySrNo.has(srNoValue);

    while (hasConflict()) {
      srNoValue += 1;
      dedupeKey = `${srNoValue}::${keyLabel}`;
    }

    seenRowKeys.add(dedupeKey);
    jobTransactionKeys.add(dedupeKey);
    globalSeenKeys.add(dedupeKey);

    const tagCategory = pickCol(row, COLS.tagCategory) ?? null;
    const keywords = pickCol(row, COLS.keywords) ?? null;
    const relevantParagraph = maybeParseJSON(pickCol(row, COLS.relevantParagraph));
    const paragraphNo = pickCol(row, COLS.paragraphNo) ?? null;
    const pageNo = pickCol(row, COLS.pageNo) ?? null;
    const informationRating = pickCol(row, COLS.informationRating) ?? null;
    const itemRemark = pickCol(row, COLS.itemRemark) ?? null;
    const summary = pickCol(row, COLS.summary) ?? null;
    const conclusion = pickCol(row, COLS.conclusion) ?? null;
    transactionTasks.push({
      rowIndex,
      srNoValue,
      rowTitle,
      hasUserSrNo,
      hasUserTitle,
      genericNames,
      specificNames,
      tagCategory,
      keywords,
      relevantParagraph,
      paragraphNo,
      pageNo,
      informationRating,
      itemRemark,
      summary,
      conclusion,
    });
  }

  await runWithConcurrency(transactionTasks, TRANSACTION_CONCURRENCY, async (task) => {
    const {
      rowIndex,
      srNoValue,
      rowTitle,
      hasUserSrNo,
      hasUserTitle,
      genericNames,
      specificNames,
      tagCategory,
      keywords,
      relevantParagraph,
      paragraphNo,
      pageNo,
      informationRating,
      itemRemark,
      summary,
      conclusion,
    } = task;

    try {
      const genericRecords = genericNames.length
        ? await Promise.all(genericNames.map((name) => getGenericSubject(name, caches)))
        : [];

      const specificRecords = specificNames.length
        ? await Promise.all(specificNames.map((name) => getSpecificTag(name, tagCategory, caches)))
        : [];

      const transactionData = {
        srNo: srNoValue,
        title: rowTitle,
        keywords,
        relevantParagraph: relevantParagraph ?? null,
        paragraphNo,
        pageNo,
        informationRating,
        remark: itemRemark,
        summary,
        conclusion,
        bookId: book.id,
        userId,
      };

      const normalizedRowTitle = rowTitle ? normalizeText(rowTitle) : "";
      let existingId: string | undefined;
      if (hasUserSrNo && lookup.bySrNo.has(srNoValue)) {
        existingId = lookup.bySrNo.get(srNoValue);
      }
      if (!existingId && hasUserTitle && normalizedRowTitle && lookup.byTitle.has(normalizedRowTitle)) {
        existingId = lookup.byTitle.get(normalizedRowTitle);
      }

      const isUpdate = Boolean(existingId);

      if (existingId) {
        await prisma.summaryTransaction.update({
          where: { id: existingId },
          data: {
            ...transactionData,
            genericSubjects: genericRecords.length
              ? {
                  deleteMany: {},
                  create: genericRecords.map((record) => ({
                    genericSubject: { connect: { id: record.id } },
                  })),
                }
              : { deleteMany: {} },
            specificSubjects: specificRecords.length
              ? {
                  deleteMany: {},
                  create: specificRecords.map((record) => ({
                    tag: { connect: { id: record.id } },
                  })),
                }
              : { deleteMany: {} },
          },
        });
      } else {
        const createdTx = await prisma.summaryTransaction.create({
          data: {
            ...transactionData,
            genericSubjects: genericRecords.length
              ? {
                  create: genericRecords.map((record) => ({
                    genericSubject: { connect: { id: record.id } },
                  })),
                }
              : undefined,
            specificSubjects: specificRecords.length
              ? {
                  create: specificRecords.map((record) => ({
                    tag: { connect: { id: record.id } },
                  })),
                }
              : undefined,
          },
        });
        existingId = createdTx.id;
        sheetSummary.created += 1;
        importJobManager.updateSummary(job, (draft) => {
          draft.totalCreated += 1;
        });
      }

      if (existingId) {
        lookup.bySrNo.set(srNoValue, existingId);
        if (hasUserTitle && normalizedRowTitle) {
          lookup.byTitle.set(normalizedRowTitle, existingId);
        }
      }

      importJobManager.emit(job, {
        type: "row-success",
        payload: {
          jobId: job.id,
          fileName,
          sheetName,
          rowIndex,
          mode: isUpdate ? "updated" : "created",
        },
      });
    } catch (error: any) {
      const message = error?.message || "Failed to save transaction";
      pushRowError(
        job,
        sheetSummary,
        { rowIndex, message, fields: ["database"] },
        fileName,
        sheetName
      );
    }
  });
}

function addSheetSummary(
  job: NonNullable<ReturnType<typeof importJobManager.getJob>>,
  fileName: string,
  sheetName?: string,
  overrides?: Partial<{ created: number; skipped: number; errors: RowError[]; error: string }>
) {
  let sheetRef: { name: string; created: number; skipped: number; errors: RowError[]; error?: string } | undefined;
  importJobManager.updateSummary(job, (draft) => {
    const file = draft.files.find((f) => f.fileName === fileName);
    if (!file) return;
    const existing = file.sheets.find((s) => s.name === (sheetName || "Sheet1"));
    if (existing) {
      if (overrides?.error) existing.error = overrides.error;
      sheetRef = existing;
      return;
    }
    const sheetSummary = {
      name: sheetName || "Sheet1",
      created: overrides?.created ?? 0,
      skipped: overrides?.skipped ?? 0,
      errors: overrides?.errors ?? [],
      error: overrides?.error,
    };
    file.sheets.push(sheetSummary);
    sheetRef = sheetSummary;
  });
  return sheetRef!;
}

function pushRowError(
  job: NonNullable<ReturnType<typeof importJobManager.getJob>>,
  sheetSummary: { created: number; skipped: number; errors: RowError[]; error?: string },
  error: RowError,
  fileName: string,
  sheetName?: string
) {
  sheetSummary.skipped += 1;
  sheetSummary.errors.push(error);
  importJobManager.updateSummary(job, (draft) => {
    draft.totalSkipped += 1;
  });
  importJobManager.emit(job, {
    type: "row-error",
    payload: { jobId: job.id, fileName, sheetName, ...error },
  });
}

async function getOrCreateBookForJob(
  userId: string,
  data: BookPayload,
  caches: JobImportCaches
): Promise<BookRecord> {
  const normalizedKey = normalizeText(data.libraryNumber) || data.libraryNumber;
  const cacheKey = `${userId}::${normalizedKey}`;

  let promise = caches.books.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      const existing = await prisma.bookMaster.findFirst({
        where: { userId, libraryNumber: data.libraryNumber },
      });

      if (existing) {
        return prisma.bookMaster.update({
          where: { id: existing.id },
          data: { ...data, userId },
        });
      }

      return prisma.bookMaster.create({
        data: { ...data, userId },
      });
    })();

    caches.books.set(cacheKey, promise);
  }

  return promise;
}

async function getGenericSubject(name: string, caches: JobImportCaches) {
  const trimmedName = name.trim();
  const normalized = normalizeText(trimmedName) || trimmedName.toLowerCase();
  let promise = caches.genericSubjects.get(normalized);
  if (!promise) {
    promise = (async () => {
      const existing = await prisma.genericSubjectMaster.findFirst({
        where: { name: { equals: trimmedName, mode: "insensitive" } },
      });
      if (existing) return existing;

      try {
        return await prisma.genericSubjectMaster.create({ data: { name: trimmedName } });
      } catch (error: any) {
        // On unique violation (race), return the existing record instead of failing the row.
        const fallback = await prisma.genericSubjectMaster.findFirst({
          where: { name: { equals: trimmedName, mode: "insensitive" } },
        });
        if (fallback) return fallback;
        caches.genericSubjects.delete(normalized);
        throw error;
      }
    })();
    caches.genericSubjects.set(normalized, promise);
  }
  return promise;
}

async function getSpecificTag(name: string, category: string | null, caches: JobImportCaches) {
  const trimmedName = name.trim();
  const normalized = normalizeText(trimmedName) || trimmedName.toLowerCase();
  let promise = caches.specificTags.get(normalized);
  if (!promise) {
    promise = (async () => {
      const existing = await prisma.tagMaster.findFirst({
        where: { name: { equals: trimmedName, mode: "insensitive" } },
      });
      if (existing) {
        if (category && existing.category !== category) {
          try {
            return await prisma.tagMaster.update({
              where: { id: existing.id },
              data: { category },
            });
          } catch (error: any) {
            const fallbackAfterUpdate = await prisma.tagMaster.findFirst({
              where: { name: { equals: trimmedName, mode: "insensitive" } },
            });
            if (fallbackAfterUpdate) return fallbackAfterUpdate;
            caches.specificTags.delete(normalized);
            throw error;
          }
        }
        return existing;
      }

      try {
        return await prisma.tagMaster.create({ data: { name: trimmedName, category } });
      } catch (error: any) {
        // On unique violation (race), return the existing record instead of failing the row.
        const fallback = await prisma.tagMaster.findFirst({
          where: { name: { equals: trimmedName, mode: "insensitive" } },
        });
        if (fallback) {
          if (category && fallback.category !== category) {
            try {
              return await prisma.tagMaster.update({
                where: { id: fallback.id },
                data: { category },
              });
            } catch {
              return fallback;
            }
          }
          return fallback;
        }
        caches.specificTags.delete(normalized);
        throw error;
      }
    })();
    caches.specificTags.set(normalized, promise);
  }
  return promise;
}

async function getTransactionLookup(bookId: string, userId: string, caches: JobImportCaches) {
  let lookup = caches.transactionLookups.get(bookId);
  if (!lookup) {
    const existing = await prisma.summaryTransaction.findMany({
      where: { bookId, userId },
      select: { id: true, srNo: true, title: true },
    });
    lookup = { bySrNo: new Map(), byTitle: new Map() };
    existing.forEach((tx) => {
      if (typeof tx.srNo === "number") {
        lookup!.bySrNo.set(tx.srNo, tx.id);
      }
      if (tx.title) {
        lookup!.byTitle.set(normalizeText(tx.title), tx.id);
      }
    });
    caches.transactionLookups.set(bookId, lookup);
  }
  return lookup;
}

async function handleExport(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const bookId = toStr(req.query.bookId).trim();
  if (!bookId) return res.status(400).json({ error: "bookId is required" });

  const variantParam = toStr(req.query.variant).trim().toLowerCase();
  const variant =
    variantParam === EXPORT_VARIANTS.BOOK_OVERVIEW
      ? EXPORT_VARIANTS.BOOK_OVERVIEW
      : EXPORT_VARIANTS.TRANSACTIONS;

  const genericSubjectId = toStr(req.query.genericSubjectId).trim();
  const specificSubjectId = toStr(req.query.specificSubjectId).trim();
  const search = toStr(req.query.search).trim();

  const book = await prisma.bookMaster.findFirst({
    where: { id: bookId, userId },
    include: { images: true, editor: true },
  });
  if (!book) return res.status(404).json({ error: "Book not found" });

  const where: any = { bookId, userId };
  if (genericSubjectId) where.genericSubjects = { some: { genericSubjectId } };
  if (specificSubjectId) where.specificSubjects = { some: { tagId: specificSubjectId } };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { keywords: { contains: search, mode: "insensitive" } },
      { remark: { contains: search, mode: "insensitive" } },
    ];
  }

  const transactions = await prisma.summaryTransaction.findMany({
    where,
    include: {
      genericSubjects: { include: { genericSubject: true } },
      specificSubjects: { include: { tag: true } },
      images: true,
    },
    orderBy: [{ srNo: "asc" }, { createdAt: "asc" }],
  });

  const rows: string[][] = [];

  if (variant === EXPORT_VARIANTS.BOOK_OVERVIEW) {
    const bookImages = collectImageUrls((book as any)?.coverImageUrl, (book as any)?.images);
    const bookHeaderRow = BOOK_OVERVIEW_FIELDS.map((field) => field.label);
    const bookValueRow = BOOK_OVERVIEW_FIELDS.map((field) => {
      if (field.key === "bookImages") return formatImageCell(bookImages);
      if (field.key === "coverImageUrl") return escapeCsv((book as any).coverImageUrl ?? "");
      if (field.key === "editors") return formatEditors((book as any).editor);
      return escapeCsv((book as any)[field.key] ?? "");
    });
    rows.push(bookHeaderRow, bookValueRow, [], []);
  }

  rows.push(EXPORT_HEADERS.map((col) => col.label));

  const transactionRows = transactions
    .map((tx) => {
      const genericNames = (tx.genericSubjects || [])
        .map((link: any) => link.genericSubject?.name ?? null)
        .filter(Boolean);
      const specificNames = (tx.specificSubjects || [])
        .map((link: any) => link.tag?.name ?? null)
        .filter(Boolean);
      const specificCategories = (tx.specificSubjects || [])
        .map((link: any) => link.tag?.category ?? null)
        .filter(Boolean);
      const imageUrls = collectImageUrls((tx as any).imageUrl, (tx as any).images);

      const hasTitle = truthy(tx.title);
      const hasSpecific = specificNames.length > 0;
      const includeInExport =
        variant === EXPORT_VARIANTS.BOOK_OVERVIEW ? !hasTitle || !hasSpecific : hasTitle && hasSpecific;
      if (!includeInExport) return null;

      const row = EXPORT_HEADERS.map((col) => {
        if (col.key === "genericSubjectName") return escapeCsv(joinMultiValues(genericNames));
        if (col.key === "specificTagName") return escapeCsv(joinMultiValues(specificNames));
        if (col.key === "tagCategory") return escapeCsv(joinMultiValues(specificCategories));
        if (col.key === "images") return formatImageCell(imageUrls);
        if (col.key === "itemRemark") return escapeCsv(tx.remark ?? "");
        if (col.key === "footNote") return escapeCsv(tx.footNote ?? "");
        if (col.key === "relevantParagraph") {
          const value = tx.relevantParagraph;
          if (!value) return "";
          if (typeof value === "string") return escapeCsv(value);
          return escapeCsv(JSON.stringify(value));
        }
        return escapeCsv((tx as any)[col.key] ?? "");
      });
      return row;
    })
    .filter(Boolean) as string[][];

  rows.push(...transactionRows);

  const csv = rows.map((row) => row.join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${
      variant === EXPORT_VARIANTS.BOOK_OVERVIEW ? "book-overview" : "transactions"
    }-${book.libraryNumber}.csv"`
  );
  return res.status(200).send(`\uFEFF${csv}`);
}
function pickInt(row: Record<string, any>, aliases: readonly string[]): number | undefined {
  const value = pickCol(row, aliases);
  if (!truthy(value)) return undefined;
  const parsed = parseInt(String(value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
