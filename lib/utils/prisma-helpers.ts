// lib/utils/prisma-helpers.ts
import { Prisma } from '@prisma/client';
import { ApiError } from './api-helpers';

export const handlePrismaError = (error: any): ApiError => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new ApiError(400, 'Duplicate entry exists', 'DUPLICATE_ENTRY');
      case 'P2025':
        return new ApiError(404, 'Record not found', 'NOT_FOUND');
      case 'P2003':
        return new ApiError(400, 'Foreign key constraint failed', 'FK_CONSTRAINT');
      default:
        return new ApiError(500, 'Database error occurred', 'DB_ERROR');
    }
  }
  return new ApiError(500, 'Internal server error', 'INTERNAL_ERROR');
};