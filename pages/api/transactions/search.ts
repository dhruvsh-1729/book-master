// pages/api/transactions/search.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { searchCache } from '@/lib/cache';
import { getUserIdFromRequest } from '@/lib/auth';

interface FilterConfig {
  field: string;
  operator: 'contains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number;
  caseSensitive?: boolean;
}

type SubjectMatchType = 'AND' | 'OR';
type SubjectSearchMode = 'text' | 'exact';
type SubjectTextOperator = 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'word';
interface SubjectTextFilter {
  text: string;
  operator?: SubjectTextOperator;
}

interface SubjectFilterInput {
  mode?: SubjectSearchMode;
  matchType?: SubjectMatchType;
  selectedIds?: string[];
  searchText?: string;
  searchTextFilters?: SubjectTextFilter[];
  searchTexts?: string[];
  operator?: SubjectTextOperator;
  caseSensitive?: boolean;
}

interface SearchParams {
  page?: number;
  pageSize?: number;
  filters?: FilterConfig[];
  bookIds?: string[];
  genericSubjectIds?: string[];
  specificTagIds?: string[];
  globalSearch?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  genericSubjectFilter?: SubjectFilterInput;
  specificTagFilter?: SubjectFilterInput;
  userId?: string;
}

function getCacheKey(params: SearchParams): string {
  return JSON.stringify(params);
}

const PARAGRAPH_LANG_KEYS = ['english', 'hindi', 'gujarati', 'sanskrit'];

function buildParagraphSearchFilter(
  text: string,
  splitIntoWords = true
): Prisma.SummaryTransactionWhereInput {
  const terms = splitIntoWords
    ? text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean)
    : [text.trim()].filter(Boolean);

  if (!terms.length) return {};

  const conditions = terms.map((term) => ({
    OR: PARAGRAPH_LANG_KEYS.map((lang) => ({
      relevantParagraph: {
        path: [lang],
        string_contains: term,
      } as any,
    })),
  }));

  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

function buildFieldFilter(filter: FilterConfig): any {
  const { field, operator, value, caseSensitive = false } = filter;
  const stringValue = String(value);
  const mode = caseSensitive ? undefined : 'insensitive';

  if (field === 'relevantParagraph') {
    return buildParagraphSearchFilter(stringValue, true);
  }

  const wordSearchFields = new Set(['title', 'remark', 'footNote']);
  if (wordSearchFields.has(field)) {
    const words = stringValue
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (!words.length) return {};
    return {
      AND: words.map((word) => ({
        [field]: { contains: word, mode },
      })),
    };
  }

  switch (operator) {
    case 'contains':
      return { [field]: { contains: stringValue, mode } };
    case 'equals':
      return { [field]: { equals: stringValue, mode } };
    case 'notEquals':
      return { [field]: { not: { equals: stringValue, mode } } };
    case 'startsWith':
      return { [field]: { startsWith: stringValue, mode } };
    case 'endsWith':
      return { [field]: { endsWith: stringValue, mode } };
    case 'gt':
      return { [field]: { gt: value } };
    case 'lt':
      return { [field]: { lt: value } };
    case 'gte':
      return { [field]: { gte: value } };
    case 'lte':
      return { [field]: { lte: value } };
    default:
      return {};
  }
}

function buildGlobalSearchFilter(searchTerm: string): any {
  const mode = 'insensitive';
  const paragraphCondition = buildParagraphSearchFilter(searchTerm, false);
  const paragraphClauses =
    paragraphCondition && Object.keys(paragraphCondition).length > 0 ? [paragraphCondition] : [];
  return {
    OR: [
      { title: { contains: searchTerm, mode } },
      { informationRating: { contains: searchTerm, mode } },
      { remark: { contains: searchTerm, mode } },
      { footNote: { contains: searchTerm, mode } },
      { keywords: { contains: searchTerm, mode } },
      { summary: { contains: searchTerm, mode } },
      { conclusion: { contains: searchTerm, mode } },
      { pageNo: { contains: searchTerm, mode } },
      { paragraphNo: { contains: searchTerm, mode } },
      ...paragraphClauses,
    ],
  };
}
function buildStringFilter(
  operator: SubjectTextOperator,
  value: string,
  caseSensitive?: boolean
): Prisma.StringFilter {
  const mode = caseSensitive ? undefined : 'insensitive';
  switch (operator) {
    case 'startsWith':
      return { startsWith: value, mode };
    case 'endsWith':
      return { endsWith: value, mode };
    case 'equals':
      return { equals: value, mode };
    default:
      return { contains: value, mode };
  }
}

function normalizeSubjectFilter(
  filter?: SubjectFilterInput,
  fallbackIds: string[] = []
): SubjectFilterInput | undefined {
  if (filter) return filter;
  if (fallbackIds.length === 0) return undefined;
  return {
    mode: 'exact',
    matchType: 'OR',
    selectedIds: fallbackIds,
  };
}

function buildSubjectFilterConditions(
  filter: SubjectFilterInput | undefined,
  type: 'generic' | 'specific'
): Prisma.SummaryTransactionWhereInput[] {
  if (!filter) return [];

  const relationField = type === 'generic' ? 'genericSubjects' : 'specificSubjects';
  const nestedField = type === 'generic' ? 'genericSubject' : 'tag';
  const idField = type === 'generic' ? 'genericSubjectId' : 'tagId';
  const hasText =
    (filter.searchTextFilters && filter.searchTextFilters.length > 0) ||
    (filter.searchTexts && filter.searchTexts.length > 0) ||
    (filter.searchText && filter.searchText.trim().length > 0);
  const mode = filter.mode || (hasText ? 'text' : 'exact');

  if (mode === 'exact') {
    const ids = (filter.selectedIds || []).filter(Boolean);
    if (!ids.length) return [];
    if ((filter.matchType || 'OR') === 'AND') {
      return ids.map((id) => ({
        [relationField]: {
          some: {
            [idField]: id,
          },
        },
      }));
    }
    return [
      {
        [relationField]: {
          some: {
            [idField]: { in: ids },
          },
        },
      },
    ];
  }

  const textEntries: Array<{ text: string; operator: SubjectTextOperator }> = [];

  if (filter.searchTextFilters && filter.searchTextFilters.length) {
    filter.searchTextFilters.forEach((entry) => {
      if (!entry.text) return;
      textEntries.push({
        text: entry.text.trim(),
        operator: entry.operator || filter.operator || 'contains',
      });
    });
  } else {
    const baseOperator = filter.operator || 'contains';
    (filter.searchTexts || []).forEach((text) => {
      const trimmed = text.trim();
      if (trimmed) textEntries.push({ text: trimmed, operator: baseOperator });
    });
    if (filter.searchText && filter.searchText.trim()) {
      textEntries.push({ text: filter.searchText.trim(), operator: baseOperator });
    }
  }

  const normalizedTextEntries = textEntries.filter((entry) => entry.text);

  if (!normalizedTextEntries.length) return [];

  const textConditions = normalizedTextEntries
    .map((entry) => {
      const operator = entry.operator || 'contains';
      if (operator === 'word') {
        const words = entry.text.split(/\s+/).filter(Boolean);
        if (!words.length) return null;
        return {
          [relationField]: {
            some: {
              [nestedField]: {
                AND: words.map((word) => ({
                  name: { contains: word, mode: filter.caseSensitive ? undefined : 'insensitive' },
                })),
              },
            },
          },
        };
      }
      return {
        [relationField]: {
          some: {
            [nestedField]: {
              name: buildStringFilter(operator, entry.text, filter.caseSensitive),
            },
          },
        },
      };
    })
    .filter(Boolean) as Prisma.SummaryTransactionWhereInput[];

  if (!textConditions.length) return [];

  const textMatchType = filter.matchType || 'AND';
  if (textMatchType === 'AND') {
    return textConditions;
  }

  return [
    {
      OR: textConditions,
    },
  ];
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const body: SearchParams = req.body;
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const {
      page = 1,
      pageSize = 20,
      filters = [],
      bookIds = [],
      genericSubjectIds = [],
      specificTagIds = [],
      globalSearch = '',
      sortBy = 'srNo',
      sortOrder = 'asc',
      genericSubjectFilter,
      specificTagFilter,
    } = body;

    // Validate pagination parameters
    if (page < 1) {
      return res.status(400).json({ error: 'Page must be greater than 0' });
    }

    if (pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ error: 'Page size must be between 1 and 100' });
    }

    // Check cache
    const cacheKey = getCacheKey({ ...body, userId });
    const cachedResult = searchCache.get(cacheKey);
    if (cachedResult) {
      return res.status(200).json({ ...cachedResult, cached: true });
    }

    // Build where clause
  const andConditions: Prisma.SummaryTransactionWhereInput[] = [];
  andConditions.push({ userId });

  // Restrict search to subject/tag filters only
  const subjectTagFilters = [
    ...buildSubjectFilterConditions(
      normalizeSubjectFilter(genericSubjectFilter, genericSubjectIds),
      'generic'
    ),
    ...buildSubjectFilterConditions(
      normalizeSubjectFilter(specificTagFilter, specificTagIds),
      'specific'
    ),
  ];
  if (subjectTagFilters.length > 0) {
    andConditions.push(...subjectTagFilters);
  }

  // Field filters (limited to key text fields)
  const allowedFields = new Set(['title', 'informationRating', 'remark', 'footNote', 'relevantParagraph']);
  if (filters && filters.length) {
    filters.forEach((filter) => {
      if (!allowedFields.has(filter.field)) return;
      if (filter.field === 'informationRating') {
        const val = String(filter.value ?? '').trim();
        if (val.toLowerCase() === 'null' || val === '') {
          andConditions.push({ informationRating: null });
        } else {
          andConditions.push({ informationRating: val });
        }
        return;
      }
      andConditions.push(buildFieldFilter(filter));
    });
  }

  // Global search across selected fields
  if (globalSearch && globalSearch.trim()) {
    andConditions.push(buildGlobalSearchFilter(globalSearch.trim()));
  }

  // Build final where clause (only subject-based filters)
  const whereClause: Prisma.SummaryTransactionWhereInput =
    andConditions.length > 0
      ? {
          AND: andConditions,
        }
      : {
          AND: [{ userId }],
        };
    const skip = (page - 1) * pageSize;

    // Validate sortBy field
    const validSortFields = ['srNo', 'title', 'createdAt', 'updatedAt', 'pageNo'];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'srNo';

    // Execute queries in parallel
    const [transactions, totalCount] = await Promise.all([
      prisma.summaryTransaction.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        orderBy: { [finalSortBy]: sortOrder },
        include: {
          book: {
            include: {
              editor: true,
            },
          },
          genericSubjects: {
            include: {
              genericSubject: true,
            },
          },
          specificSubjects: {
            include: {
              tag: true,
            },
          },
          images: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.summaryTransaction.count({ where: whereClause }),
    ]);

    // Transform data for frontend
    const transformedTransactions = transactions.map(transaction => ({
      ...transaction,
      images: transaction.images || [],
      genericSubjects: transaction.genericSubjects.map(gs => gs.genericSubject),
      specificTags: transaction.specificSubjects.map(st => st.tag),
    }));

    const result = {
      transactions: transformedTransactions,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNext: page < Math.ceil(totalCount / pageSize),
        hasPrev: page > 1,
      },
    };

    // Cache result
    searchCache.set(cacheKey, result);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Transaction search error:', error);
    return res.status(500).json({
      error: 'Failed to search transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const currentUserId = getUserIdFromRequest(req);
    if (!currentUserId) return res.status(401).json({ error: 'Authentication required' });
    const whereClause = { userId: currentUserId };

    const [books, genericSubjects, tags] = await Promise.all([
      prisma.bookMaster.findMany({
        where: whereClause,
        select: {
          id: true,
          bookName: true,
          libraryNumber: true,
        },
        orderBy: { bookName: 'asc' },
      }),
      prisma.genericSubjectMaster.findMany({
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.tagMaster.findMany({
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return res.status(200).json({
      books,
      genericSubjects,
      tags,
    });
  } catch (error) {
    console.error('Filter options error:', error);
    return res.status(500).json({
      error: 'Failed to fetch filter options',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Route to appropriate handler
  switch (req.method) {
    case 'POST':
      return handlePost(req, res);
    case 'GET':
      return handleGet(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
      return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}
