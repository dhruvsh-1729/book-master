import { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { ApiError } from '../utils/api-helpers';

export interface TransactionFilters {
  userId?: string;
  bookId?: string;
  genericSubjectId?: string;
  specificSubjectId?: string;
  search?: string;
  informationRating?: string;
}

export interface TransactionCreateData {
  bookId: string;
  userId: string;
  srNo: number;
  genericSubjectId?: string;
  specificSubjectId?: string;
  title?: string;
  keywords?: string;
  relevantParagraph?: any;
  paragraphNo?: string;
  pageNo?: string;
  informationRating?: string;
  remark?: string;
}

export class TransactionRepository extends BaseRepository {
  private readonly defaultIncludes = {
    book: {
      select: {
        id: true,
        bookName: true,
        libraryNumber: true
      }
    },
    genericSubject: {
      select: {
        id: true,
        name: true
      }
    },
    specificSubject: {
      select: {
        id: true,
        name: true
      }
    }
  } satisfies Prisma.SummaryTransactionInclude;

  async findMany(filters: TransactionFilters, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const where = this.buildWhereClause(filters);

    const [transactions, total] = await this.prisma.$transaction([
      this.prisma.summaryTransaction.findMany({
        where,
        include: this.defaultIncludes,
        skip,
        take: limit,
        orderBy: [
          { bookId: 'asc' },
          { srNo: 'asc' }
        ]
      }),
      this.prisma.summaryTransaction.count({ where })
    ]);

    return { transactions, total };
  }

  async findById(id: string, userId?: string) {
    const where: Prisma.SummaryTransactionWhereInput = { id };
    if (userId) {
      where.userId = userId;
    }

    const transaction = await this.prisma.summaryTransaction.findFirst({
      where,
      include: {
        ...this.defaultIncludes,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!transaction) {
      throw new ApiError(404, 'Transaction not found', 'TRANSACTION_NOT_FOUND');
    }

    return transaction;
  }

  async create(data: TransactionCreateData) {
    // Verify book ownership
    const book = await this.prisma.bookMaster.findFirst({
      where: {
        id: data.bookId,
        userId: data.userId
      }
    });

    if (!book) {
      throw new ApiError(404, 'Book not found or access denied', 'BOOK_ACCESS_DENIED');
    }

    // Check for duplicate srNo
    const existing = await this.prisma.summaryTransaction.findFirst({
      where: {
        bookId: data.bookId,
        srNo: data.srNo
      }
    });

    if (existing) {
      throw new ApiError(400, 'Serial number already exists for this book', 'DUPLICATE_SR_NO');
    }

    return await this.prisma.summaryTransaction.create({
      data,
      include: this.defaultIncludes
    });
  }

  async update(id: string, userId: string, data: Partial<TransactionCreateData>) {
    // Verify ownership
    const existing = await this.findById(id, userId);

    // If srNo is being updated, check for duplicates
    if (data.srNo !== undefined && data.srNo !== existing.srNo) {
      const duplicate = await this.prisma.summaryTransaction.findFirst({
        where: {
          bookId: existing.bookId,
          srNo: data.srNo,
          id: { not: id }
        }
      });

      if (duplicate) {
        throw new ApiError(400, 'Serial number already exists for this book', 'DUPLICATE_SR_NO');
      }
    }

    return await this.prisma.summaryTransaction.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      },
      include: this.defaultIncludes
    });
  }

  async delete(id: string, userId: string) {
    // Verify ownership
    await this.findById(id, userId);

    await this.prisma.summaryTransaction.delete({
      where: { id }
    });
  }

  async findByBookId(bookId: string, userId: string, page: number, limit: number, search?: string) {
    // Verify book ownership
    const book = await this.prisma.bookMaster.findFirst({
      where: {
        id: bookId,
        userId
      },
      select: {
        id: true,
        bookName: true,
        libraryNumber: true
      }
    });

    if (!book) {
      throw new ApiError(404, 'Book not found', 'BOOK_NOT_FOUND');
    }

    const filters: TransactionFilters = {
      bookId,
      userId,
      search
    };

    const result = await this.findMany(filters, page, limit);
    return { ...result, book };
  }

  private buildWhereClause(filters: TransactionFilters): Prisma.SummaryTransactionWhereInput {
    const where: Prisma.SummaryTransactionWhereInput = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.bookId) where.bookId = filters.bookId;
    if (filters.genericSubjectId) where.genericSubjectId = filters.genericSubjectId;
    if (filters.specificSubjectId) where.specificSubjectId = filters.specificSubjectId;
    if (filters.informationRating) where.informationRating = filters.informationRating;

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { keywords: { contains: filters.search, mode: 'insensitive' } },
        { remark: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    return where;
  }
}