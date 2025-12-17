// pages/api/transactions/search.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { searchCache } from '@/lib/cache';
import { getUserIdFromRequest } from '@/lib/auth';

interface FilterConfig {
  field: string;
  operator: 'contains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'word' | 'gt' | 'lt' | 'gte' | 'lte';
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

const GLOBAL_SEARCH_FIELDS = [
  'title',
  'informationRating',
  'remark',
  'footNote',
  'keywords',
  'summary',
  'conclusion',
  'pageNo',
  'paragraphNo',
];

const normalizeParagraphTexts = (value: any, caseSensitive = false): string[] => {
  if (!value) return [];
  if (typeof value === 'string') {
    const val = value.trim();
    if (!val) return [];
    return [caseSensitive ? val : val.toLowerCase()];
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => {
        const val = (v as string).trim();
        return caseSensitive ? val : val.toLowerCase();
      });
  }
  return [];
};

const paragraphMatchesFilter = (paragraph: any, filter: FilterConfig): boolean => {
  const texts = normalizeParagraphTexts(paragraph, filter.caseSensitive);
  if (!texts.length) return false;
  const searchRaw = String(filter.value ?? '').trim();
  if (!searchRaw) return false;
  const searchValue = filter.caseSensitive ? searchRaw : searchRaw.toLowerCase();

  const containsWord = (word: string) => texts.some((text) => text.includes(word));

  switch (filter.operator) {
    case 'startsWith':
      return texts.some((text) => text.startsWith(searchValue));
    case 'endsWith':
      return texts.some((text) => text.endsWith(searchValue));
    case 'equals':
      return texts.some((text) => text === searchValue);
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      // Not meaningful for paragraph text; treat as no match
      return false;
    case 'word':
    case 'contains':
    default: {
      const words = searchValue.split(/\s+/).filter(Boolean);
      if (!words.length) return false;
      return words.every((word) => containsWord(word));
    }
  }
};

const stringContains = (value: any, term: string): boolean => {
  if (value === null || value === undefined) return false;
  const normalized = String(value).toLowerCase();
  return normalized.includes(term);
};

const matchesGlobalSearch = (transaction: any, searchTerm: string): boolean => {
  const term = searchTerm.toLowerCase();
  const baseMatch = GLOBAL_SEARCH_FIELDS.some((field) => stringContains((transaction as any)[field], term));
  if (baseMatch) return true;
  const paragraphTexts = normalizeParagraphTexts(transaction.relevantParagraph, false);
  return paragraphTexts.some((text) => text.includes(term));
};

function buildFieldFilter(filter: FilterConfig): any {
  const { field, operator, value, caseSensitive = false } = filter;
  const stringValue = String(value);
  const mode = caseSensitive ? undefined : 'insensitive';
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
  const paragraphFilters: FilterConfig[] = [];
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
      if (filter.field === 'relevantParagraph') {
        paragraphFilters.push(filter);
        return;
      }
      andConditions.push(buildFieldFilter(filter));
    });
  }

  const globalSearchTerm = globalSearch.trim();
  const useManualGlobalSearch = Boolean(globalSearchTerm);

  // Global search across selected fields
  if (!useManualGlobalSearch && globalSearchTerm) {
    andConditions.push(buildGlobalSearchFilter(globalSearchTerm));
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
  const requiresPostFilter = paragraphFilters.length > 0 || useManualGlobalSearch;
  const queryOptions: Prisma.SummaryTransactionFindManyArgs = {
    where: whereClause,
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
  };

  let transactions: any[] = [];
  let totalCount = 0;

  if (requiresPostFilter) {
    const baseTransactions = await prisma.summaryTransaction.findMany(queryOptions);
    const filtered = baseTransactions.filter((tx) => {
      if (paragraphFilters.length > 0) {
        const allMatch = paragraphFilters.every((pf) => paragraphMatchesFilter(tx.relevantParagraph, pf));
        if (!allMatch) return false;
      }
      if (useManualGlobalSearch && globalSearchTerm) {
        if (!matchesGlobalSearch(tx, globalSearchTerm)) return false;
      }
      return true;
    });
    totalCount = filtered.length;
    transactions = filtered.slice(skip, skip + pageSize);
  } else {
    const [rows, count] = await Promise.all([
      prisma.summaryTransaction.findMany({
        ...queryOptions,
        skip,
        take: pageSize,
      }),
      prisma.summaryTransaction.count({ where: whereClause }),
    ]);
    transactions = rows;
    totalCount = count;
  }

    // Transform data for frontend
    const transformedTransactions = transactions.map((transaction) => ({
      ...transaction,
      images: transaction.images || [],
      genericSubjects: transaction.genericSubjects.map((gs: any) => gs.genericSubject),
      specificTags: transaction.specificSubjects.map((st: any) => st.tag),
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
