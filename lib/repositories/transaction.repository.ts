import { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { ApiError } from '../utils/api-helpers';

export interface TransactionFilters {
  userId?: string;
  bookId?: string;
  genericSubjectIds?: string[];
  specificSubjectIds?: string[];
  search?: string;
  informationRating?: string;
}

export interface TransactionCreateData {
  bookId: string;
  userId: string;
  srNo: number;
  genericSubjectIds?: string[];
  specificSubjectIds?: string[];
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
    genericSubjects: {
      include: { genericSubject: true }
    },
    specificSubjects: {
      include: { tag: true }
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

    return { transactions: transactions.map((tx) => this.mapTransaction(tx)), total };
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

    return this.mapTransaction(transaction);
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

    const genericIds = Array.from(new Set(data.genericSubjectIds || []));
    const specificIds = Array.from(new Set(data.specificSubjectIds || []));

    const created = await this.prisma.summaryTransaction.create({
      data: {
        bookId: data.bookId,
        userId: data.userId,
        srNo: data.srNo,
        title: data.title ?? null,
        keywords: data.keywords ?? null,
        relevantParagraph: data.relevantParagraph ?? null,
        paragraphNo: data.paragraphNo ?? null,
        pageNo: data.pageNo ?? null,
        informationRating: data.informationRating ?? null,
        remark: data.remark ?? null,
        genericSubjects: genericIds.length
          ? {
              create: genericIds.map((id) => ({
                genericSubject: { connect: { id } }
              }))
            }
          : undefined,
        specificSubjects: specificIds.length
          ? {
              create: specificIds.map((id) => ({
                tag: { connect: { id } }
              }))
            }
          : undefined
      },
      include: this.defaultIncludes
    });

    return this.mapTransaction(created);
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

    const genericIds = data.genericSubjectIds ? Array.from(new Set(data.genericSubjectIds)) : undefined;
    const specificIds = data.specificSubjectIds ? Array.from(new Set(data.specificSubjectIds)) : undefined;

    const updatePayload: Prisma.SummaryTransactionUpdateInput = {
      updatedAt: new Date(),
      ...(data.srNo !== undefined ? { srNo: data.srNo } : {}),
      title: data.title ?? undefined,
      keywords: data.keywords ?? undefined,
      relevantParagraph: data.relevantParagraph ?? undefined,
      paragraphNo: data.paragraphNo ?? undefined,
      pageNo: data.pageNo ?? undefined,
      informationRating: data.informationRating ?? undefined,
      remark: data.remark ?? undefined,
      ...(genericIds !== undefined
        ? {
            genericSubjects: {
              deleteMany: {},
              ...(genericIds.length
                ? {
                    create: genericIds.map((gid) => ({
                      genericSubject: { connect: { id: gid } }
                    }))
                  }
                : {})
            }
          }
        : {}),
      ...(specificIds !== undefined
        ? {
            specificSubjects: {
              deleteMany: {},
              ...(specificIds.length
                ? {
                    create: specificIds.map((sid) => ({
                      tag: { connect: { id: sid } }
                    }))
                  }
                : {})
            }
          }
        : {})
    };

    const updated = await this.prisma.summaryTransaction.update({
      where: { id },
      data: updatePayload,
      include: this.defaultIncludes
    });

    return this.mapTransaction(updated);
  }

  async delete(id: string, userId: string) {
    // Verify ownership
    await this.findById(id, userId);

    await this.prisma.$transaction([
      this.prisma.summaryTransactionGenericSubject.deleteMany({ where: { summaryTransactionId: id } }),
      this.prisma.summaryTransactionSpecificTag.deleteMany({ where: { summaryTransactionId: id } }),
      this.prisma.summaryTransaction.delete({ where: { id } })
    ]);
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
    if (filters.genericSubjectIds?.length) {
      where.genericSubjects = {
        some: { genericSubjectId: { in: filters.genericSubjectIds } }
      };
    }
    if (filters.specificSubjectIds?.length) {
      where.specificSubjects = {
        some: { tagId: { in: filters.specificSubjectIds } }
      };
    }
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

  private mapTransaction(transaction: any) {
    return {
      ...transaction,
      genericSubjects: (transaction.genericSubjects || [])
        .map((link: any) => link.genericSubject)
        .filter(Boolean),
      specificSubjects: (transaction.specificSubjects || [])
        .map((link: any) => link.tag)
        .filter(Boolean)
    };
  }
}
