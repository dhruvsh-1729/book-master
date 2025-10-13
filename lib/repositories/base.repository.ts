// lib/repositories/base.repository.ts
import { PrismaClient } from '@prisma/client';
import { handlePrismaError } from '../utils/prisma-helpers';

export abstract class BaseRepository {
  constructor(protected prisma: PrismaClient) {}
  
  protected handleError(error: any) {
    return handlePrismaError(error);
  }
}
