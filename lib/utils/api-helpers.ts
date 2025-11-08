// lib/utils/api-helpers.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const parseQueryParam = (
  value: string | string[] | undefined,
  fallback = ''
): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] || fallback;
  return fallback;
};

export const parseIntParam = (
  value: string | string[] | undefined,
  fallback: number,
  min?: number,
  max?: number
): number => {
  const num = parseInt(parseQueryParam(value, String(fallback)));
  if (isNaN(num)) return fallback;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
};

export const buildPaginationResponse = (
  page: number,
  limit: number,
  total: number
) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
  hasNext: page * limit < total,
  hasPrev: page > 1
});