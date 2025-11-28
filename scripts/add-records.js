#!/usr/bin/env node
 

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Column aliases — tweak to your headers if needed.
 */
const COLS = {
  // BookMaster fields (from FIRST data row ONLY)
  libraryNumber: ['Sr No.'],
  bookName: ['bookName', 'Book Name', 'Title', 'Book', 'Generic Subject'],
  bookSummary: ['bookSummary', 'Book Summary', 'Summary (Book)', 'Book_Summary'],
  pageNumbers: ['pageNumbers', 'Pages', 'Page Numbers', 'Total Pages'],
  grade: ['grade', 'Grade', 'Class'],
  remark: ['remark', 'Remarks', 'Book Remark'],
  edition: ['edition', 'Edition'],
  publisherName: ['publisherName', 'Publisher', 'Publisher Name'],

  // SummaryTransaction fields (per-row)
  srNo: ['srNo', 'Sr No', 'SR No', 'S.No', 'Sr', 'Index', 'Sr No.'],
  title: ['title', 'Title', 'Topic'],
  keywords: ['keywords', 'Keywords', 'Keyword'],
  relevantParagraph: ['relevantParagraph', 'Relevant Paragraph', 'Paragraph (JSON/Text)', 'Relevant Para', 'Excerpts'],
  paragraphNo: ['paragraphNo', 'Paragraph No', 'Para No'],
  pageNo: ['pageNo', 'Page No', 'Page'],
  informationRating: ['informationRating', 'Information Rating', 'Rating'],
  itemRemark: ['remark', 'Remarks', 'Item Remark', 'Txn Remark', 'Remark'], // separate from book-level remark usage
  summary: ['summary', 'Summary'],
  conclusion: ['conclusion', 'Conclusion'],

  // Subjects
  genericSubjectName: ['genericSubject', 'Generic Subject', 'Subject (Generic)'],
  specificTagName: ['specificSubject', 'Specific Subject', 'Tag', 'Specific'],
  tagCategory: ['category', 'Tag Category', 'Specific Category'], // optional
};

/** ENV */
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required.');
  process.exit(1);
}

/** Helpers */
const truthy = (v) => v !== undefined && v !== null && String(v).trim() !== '';

const normalizeHeaderKey = (k) =>
  String(k || '')
    .replace(/^\uFEFF/, '') // strip BOM
    .replace(/\s+/g, ' ')   // collapse spaces
    .trim();

function normalizeRowKeys(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    const nk = normalizeHeaderKey(key);
    out[nk] = row[key];
  }
  return out;
}

function asAliasList(aliases) {
  if (!aliases) return [];              // tolerate undefined/null
  if (Array.isArray(aliases)) return aliases;
  return [aliases];
}

function pickCol(row, aliases) {
  const list = asAliasList(aliases);
  for (const key of list) {
    if (key in row && truthy(row[key])) return String(row[key]).trim();
  }
  return undefined;
}

function pickInt(row, aliases) {
  const v = pickCol(row, aliases);
  if (!truthy(v)) return undefined;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function maybeParseJSON(v) {
  if (!truthy(v)) return null;
  const s = String(v).trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return s; // keep as string
  try {
    return JSON.parse(s);
  } catch {
    return s; // keep original text if it fails to parse
  }
}

function splitMultiValues(value) {
  if (!truthy(value)) return [];
  return String(value)
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const normalizeText = (value) =>
  value && typeof value === 'string'
    ? value
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
    : '';

async function main() {
  const csvPath = path.resolve(process.cwd(), 'index.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Could not find ${csvPath}. Place index.csv next to this script.`);
    process.exit(1);
  }

  const buf = fs.readFileSync(csvPath);
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // extra BOM guard

  // Parse with header row
  let records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });

  if (!records.length) {
    console.error('❌ CSV has no data rows.');
    process.exit(1);
  }

  // Normalize keys on every row (fixes BOM/spacing/case weirdness)
  records = records.map(normalizeRowKeys);

  // Optional debug: show available headers
  if (process.env.DEBUG_HEADERS) {
    console.log('🧭 Headers seen:', Object.keys(records[0]));
  }

  // Ensure user
  const hardcodedEmail = 'dhruvshdarshansh@gmail.com';
  let user = await prisma.user.findUnique({ where: { email: hardcodedEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: hardcodedEmail, name: 'Dhruv' },
    });
    console.log(`👤 Created user: ${user.email}`);
  } else {
    console.log(`👤 Using user: ${user.email}`);
  }

  // STEP 1: BookMaster from FIRST data row only
  const first = records[0];

  const bookData = {
    libraryNumber: pickCol(first, COLS.libraryNumber),
    bookName: pickCol(first, COLS.bookName),
    bookSummary: pickCol(first, COLS.bookSummary) || null,
    pageNumbers: pickCol(first, COLS.pageNumbers) || null,
    grade: pickCol(first, COLS.grade) || null,
    remark: pickCol(first, COLS.remark) || null,
    edition: pickCol(first, COLS.edition) || null,
    publisherName: pickCol(first, COLS.publisherName) || null,
  };

  if (!truthy(bookData.libraryNumber) || !truthy(bookData.bookName)) {
    console.error('❌ Missing required BookMaster fields (libraryNumber, bookName) in the first data row.');
    console.error('🔎 First row values:', first);
    process.exit(1);
  }

  let book = await prisma.bookMaster.findUnique({
    where: { libraryNumber: bookData.libraryNumber },
  });

  if (book) {
    book = await prisma.bookMaster.update({
      where: { id: book.id },
      data: { ...bookData, userId: user.id },
    });
    console.log(`📚 BookMaster exists; updated: ${book.libraryNumber} — ${book.bookName}`);
  } else {
    book = await prisma.bookMaster.create({
      data: { ...bookData, userId: user.id },
    });
    console.log(`📚 Created BookMaster: ${book.libraryNumber} — ${book.bookName}`);
  }

  // STEP 2: From line 3 onward, only create SummaryTransaction rows pointing to the same book
  let created = 0;
  let skipped = 0;
  let lastTitle = '';
  let lastGenericNames = [];
  let lastSpecificNames = [];

  const seenKeys = new Set();

  for (let i = 1; i < records.length; i++) {
    const row = records[i];

    // Transaction fields
    const srNo = pickInt(row, COLS.srNo);
    let title = pickCol(row, COLS.title);
    if (truthy(title)) lastTitle = title;
    else if (lastTitle) title = lastTitle;

    let genericNames = splitMultiValues(pickCol(row, COLS.genericSubjectName));
    if (genericNames.length) lastGenericNames = genericNames;
    else if (lastGenericNames.length) genericNames = [...lastGenericNames];

    let specificNames = splitMultiValues(pickCol(row, COLS.specificTagName));
    if (specificNames.length) lastSpecificNames = specificNames;
    else if (lastSpecificNames.length) specificNames = [...lastSpecificNames];

  const srNoValue = Number.isFinite(srNo) ? srNo : null;
  const normalizedTitleKey = normalizeText(title || '');
  const dedupeKey = `${srNoValue ?? 'nosr'}::${normalizedTitleKey || `row-${i + 1}`}`;

    if (seenKeys.has(dedupeKey)) {
      console.log(`↩️  Skipping duplicate row ${i + 1} within file (srNo/title match).`);
      skipped++;
      continue;
    }
    seenKeys.add(dedupeKey);

    const keywords = pickCol(row, COLS.keywords) || null;
    const relevantParagraph = maybeParseJSON(pickCol(row, COLS.relevantParagraph));
    const paragraphNo = pickCol(row, COLS.paragraphNo) || null;
    const pageNo = pickCol(row, COLS.pageNo) || null;
    const informationRating = pickCol(row, COLS.informationRating) || null;
    const itemRemark = pickCol(row, COLS.itemRemark) || null;
    const summary = pickCol(row, COLS.summary) || null;
    const conclusion = pickCol(row, COLS.conclusion) || null;
    const tagCategory = pickCol(row, COLS.tagCategory) || null;

    // Minimal validity check
    // if (!truthy(title) && (srNo === undefined || srNo === null)) {
    //   skipped++;
    //   continue;
    // }

    const baseData = {
      srNo: srNoValue ?? 0,
      title: truthy(title) ? title : null,
      keywords,
      relevantParagraph: relevantParagraph ?? null,
      paragraphNo,
      pageNo,
      informationRating,
      remark: itemRemark,
      summary,
      conclusion,
      bookId: book.id,
      userId: user.id,
    };

    let existing = null;
    if (srNoValue !== null) {
      existing = await prisma.summaryTransaction.findFirst({
        where: { bookId: book.id, userId: user.id, srNo: srNoValue },
      });
    } else if (truthy(title)) {
      existing = await prisma.summaryTransaction.findFirst({
        where: { bookId: book.id, userId: user.id, title: title },
      });
    }

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

      const genericRelationData = genericRecords.length
        ? {
            deleteMany: {},
            create: genericRecords.map((record) => ({
              genericSubject: { connect: { id: record.id } },
            })),
          }
        : { deleteMany: {} };

      const specificRelationData = specificRecords.length
        ? {
            deleteMany: {},
            create: specificRecords.map((record) => ({
              tag: { connect: { id: record.id } },
            })),
          }
        : { deleteMany: {} };

      if (existing) {
        await prisma.summaryTransaction.update({
          where: { id: existing.id },
          data: {
            ...baseData,
            genericSubjects: genericRelationData,
            specificSubjects: specificRelationData,
          },
        });
        console.log(`♻️  Updated existing transaction (srNo: ${srNoValue ?? 'n/a'}, title: ${title || lastTitle || 'n/a'})`);
      } else {
        await prisma.summaryTransaction.create({
          data: {
            ...baseData,
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
      }
    } catch (err) {
      console.error(`⚠️ Failed to create SummaryTransaction for CSV row ${i + 2}:`, err.message || err);
      skipped++;
    }
  }

  console.log(`\n✅ Done. SummaryTransaction created: ${created}, skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
