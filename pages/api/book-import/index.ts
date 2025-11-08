import type { NextApiRequest, NextApiResponse } from "next";
import { parse } from "csv-parse/sync";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";

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
  relevantParagraph: ["relevantParagraph", "Relevant Paragraph", "Paragraph (JSON/Text)", "Relevant Para", "Excerpts"],
  paragraphNo: ["paragraphNo", "Paragraph No", "Para No"],
  pageNo: ["pageNo", "Page No", "Page"],
  informationRating: ["informationRating", "Information Rating", "Rating"],
  itemRemark: ["remark", "Remarks", "Item Remark", "Txn Remark", "Remark"],
  summary: ["summary", "Summary"],
  conclusion: ["conclusion", "Conclusion"],
  genericSubjectName: ["genericSubject", "Generic Subject", "Subject (Generic)"],
  specificTagName: ["specificSubject", "Specific Subject", "Tag", "Specific Tag", "Specific"],
  tagCategory: ["category", "Tag Category", "Specific Category"],
} as const;

const EXPORT_HEADERS = [
  { key: "libraryNumber", label: "Sr No.", source: "book" },
  { key: "bookName", label: "Book Name", source: "book" },
  { key: "bookSummary", label: "Book Summary", source: "book" },
  { key: "pageNumbers", label: "Page Numbers", source: "book" },
  { key: "grade", label: "Grade", source: "book" },
  { key: "remark", label: "Book Remark", source: "book" },
  { key: "edition", label: "Edition", source: "book" },
  { key: "publisherName", label: "Publisher Name", source: "book" },
  { key: "srNo", label: "Sr No", source: "transaction" },
  { key: "title", label: "Title", source: "transaction" },
  { key: "keywords", label: "Keywords", source: "transaction" },
  { key: "relevantParagraph", label: "Relevant Paragraph", source: "transaction" },
  { key: "paragraphNo", label: "Paragraph No", source: "transaction" },
  { key: "pageNo", label: "Page No", source: "transaction" },
  { key: "informationRating", label: "Information Rating", source: "transaction" },
  { key: "itemRemark", label: "Txn Remark", source: "transaction" },
  { key: "summary", label: "Summary", source: "transaction" },
  { key: "conclusion", label: "Conclusion", source: "transaction" },
  { key: "genericSubjectName", label: "Generic Subject", source: "transaction-extra" },
  { key: "specificTagName", label: "Specific Subject", source: "transaction-extra" },
  { key: "tagCategory", label: "Specific Category", source: "transaction-extra" },
];

const truthy = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
const normalizeHeaderKey = (k: unknown) =>
  String(k ?? "")
    .replace(/^[\uFEFF]/, "")
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

const pickCol = (row: Record<string, any>, aliases?: readonly string[]) => {
  const list = asAliasList(aliases);
  for (const key of list) {
    if (key in row && truthy(row[key])) return String(row[key]).trim();
  }
  return undefined;
};

const pickInt = (row: Record<string, any>, aliases?: readonly string[]) => {
  const value = pickCol(row, aliases);
  if (!truthy(value)) return undefined;
  const parsed = parseInt(String(value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toStr = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "");

const splitMultiValues = (raw?: string) => {
  if (!truthy(raw)) return [];
  return String(raw)
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const joinMultiValues = (values: (string | null | undefined)[]) =>
  values.filter(Boolean).map((v) => String(v)).join("; ");

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  if (req.method === "POST") {
    return handleImport(req, res, userId);
  }

  if (req.method === "GET") {
    return handleExport(req, res, userId);
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

async function handleImport(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const csvText = typeof req.body?.csvText === "string" ? req.body.csvText : undefined;
  if (!csvText) return res.status(400).json({ error: "csvText is required" });

  let records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, any>[];

  if (!records.length) return res.status(400).json({ error: "CSV has no data rows" });

  records = records.map(normalizeRowKeys);
  const first = records[0];

  const libraryNumber = pickCol(first, COLS.libraryNumber);
  const bookName = pickCol(first, COLS.bookName);

  if (!truthy(libraryNumber) || !truthy(bookName)) {
    return res.status(400).json({ error: "libraryNumber and bookName are required in the first row" });
  }

  const bookData = {
    libraryNumber: libraryNumber as string,
    bookName: bookName as string,
    bookSummary: pickCol(first, COLS.bookSummary) ?? null,
    pageNumbers: pickCol(first, COLS.pageNumbers) ?? null,
    grade: pickCol(first, COLS.grade) ?? null,
    remark: pickCol(first, COLS.remark) ?? null,
    edition: pickCol(first, COLS.edition) ?? null,
    publisherName: pickCol(first, COLS.publisherName) ?? null,
  };

  let book = await prisma.bookMaster.findFirst({
    where: { libraryNumber: bookData.libraryNumber as string, userId },
  });

  if (book) {
    book = await prisma.bookMaster.update({
      where: { id: book.id },
      data: { ...bookData, userId },
    });
  } else {
    book = await prisma.bookMaster.create({
      data: { ...bookData, userId },
    });
  }

  let created = 0;
  let skipped = 0;
  let lastTitle = "";
  let lastGeneric: string[] = [];
  let lastSpecific: string[] = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const srNo = pickInt(row, COLS.srNo);

    let title = pickCol(row, COLS.title);
    if (truthy(title)) lastTitle = title as string;
    else if (lastTitle) title = lastTitle;

    let genericNames = splitMultiValues(pickCol(row, COLS.genericSubjectName));
    if (genericNames.length) lastGeneric = genericNames;
    else if (lastGeneric.length) genericNames = [...lastGeneric];

    let specificNames = splitMultiValues(pickCol(row, COLS.specificTagName));
    if (specificNames.length) lastSpecific = specificNames;
    else if (lastSpecific.length) specificNames = [...lastSpecific];

    const tagCategory = pickCol(row, COLS.tagCategory) ?? null;
    const keywords = pickCol(row, COLS.keywords) ?? null;
    const relevantParagraph = maybeParseJSON(pickCol(row, COLS.relevantParagraph));
    const paragraphNo = pickCol(row, COLS.paragraphNo) ?? null;
    const pageNo = pickCol(row, COLS.pageNo) ?? null;
    const informationRating = pickCol(row, COLS.informationRating) ?? null;
    const itemRemark = pickCol(row, COLS.itemRemark) ?? null;
    const summary = pickCol(row, COLS.summary) ?? null;
    const conclusion = pickCol(row, COLS.conclusion) ?? null;

    try {
      const genericRecords = genericNames.length
        ? await Promise.all(
            genericNames.map((name) =>
              prisma.genericSubjectMaster.upsert({
                where: { name },
                update: {},
                create: { name },
              })
            )
          )
        : [];

      const specificRecords = specificNames.length
        ? await Promise.all(
            specificNames.map((name) =>
              prisma.tagMaster.upsert({
                where: { name },
                update: tagCategory ? { category: tagCategory } : {},
                create: { name, category: tagCategory },
              })
            )
          )
        : [];

      await prisma.summaryTransaction.create({
        data: {
          srNo: Number.isFinite(srNo) ? (srNo as number) : 0,
          title: truthy(title) ? (title as string) : null,
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
      created++;
    } catch (error) {
      console.error(`Failed to create SummaryTransaction for row ${i + 2}`, error);
      skipped++;
    }
  }

  return res.status(200).json({
    bookId: book.id,
    stats: { created, skipped },
  });
}

async function handleExport(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const bookId = toStr(req.query.bookId).trim();
  if (!bookId) return res.status(400).json({ error: "bookId is required" });

  const genericSubjectId = toStr(req.query.genericSubjectId).trim();
  const specificSubjectId = toStr(req.query.specificSubjectId).trim();
  const search = toStr(req.query.search).trim();

  const book = await prisma.bookMaster.findFirst({ where: { id: bookId, userId } });
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
    },
    orderBy: [{ srNo: "asc" }, { createdAt: "asc" }],
  });

  const header = EXPORT_HEADERS.map((col) => col.label);
  const rows: string[][] = [header];

  const firstRow = EXPORT_HEADERS.map((col) => {
    if (col.source === "book") {
      return escapeCsv((book as any)[col.key] ?? "");
    }
    return "";
  });
  rows.push(firstRow);

  if (transactions.length) {
    transactions.forEach((tx) => {
      const genericNames = (tx.genericSubjects || [])
        .map((link: any) => link.genericSubject?.name ?? null)
        .filter(Boolean);
      const specificNames = (tx.specificSubjects || [])
        .map((link: any) => link.tag?.name ?? null)
        .filter(Boolean);
      const specificCategories = (tx.specificSubjects || [])
        .map((link: any) => link.tag?.category ?? null)
        .filter(Boolean);

      const row = EXPORT_HEADERS.map((col) => {
        if (col.source === "book") return "";
        if (col.key === "genericSubjectName") return escapeCsv(joinMultiValues(genericNames));
        if (col.key === "specificTagName") return escapeCsv(joinMultiValues(specificNames));
        if (col.key === "tagCategory") return escapeCsv(joinMultiValues(specificCategories));
        if (col.key === "itemRemark") return escapeCsv(tx.remark ?? "");
        if (col.key === "relevantParagraph") {
          const value = tx.relevantParagraph;
          if (!value) return "";
          if (typeof value === "string") return escapeCsv(value);
          return escapeCsv(JSON.stringify(value));
        }
        return escapeCsv((tx as any)[col.key] ?? "");
      });
      rows.push(row);
    });
  }

  const csv = rows.map((row) => row.join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="book-export-${book.libraryNumber}.csv"`);
  return res.status(200).send(`\uFEFF${csv}`);
}
