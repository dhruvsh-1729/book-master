import { Prisma, BookMaster } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { ApiError } from '../utils/api-helpers';

export interface BookFilters {
  userId?: string;
  search?: string;
  libraryNumber?: string;
  publisherName?: string;
  grade?: string;
  genericTagIds?: string[];
  specificTagIds?: string[];
}

export interface BookCreateData {
  libraryNumber: string;
  bookName: string;
  bookSummary?: string;
  pageNumbers?: string;
  grade?: string;
  remark?: string;
  edition?: string;
  publisherName?: string;
  userId: string;
  editors?: Array<{ name: string; role?: string }>;
  genericTags?: string[];
  specificTags?: string[];
}

export class BookRepository extends BaseRepository {
  private readonly defaultIncludes = {
    user: {
      select: {
        id: true,
        name: true,
        email: true
      }
    },
    _count: {
      select: {
        summaryTransactions: true
      }
    }
  } satisfies Prisma.BookMasterInclude;

  private readonly detailIncludes = {
    ...this.defaultIncludes,
    editors: true,
    genericTags: {
      include: {
        genericSubject: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      }
    },
    specificTags: {
      include: {
        tag: {
          select: {
            id: true,
            name: true,
            category: true
          }
        }
      }
    }
  } satisfies Prisma.BookMasterInclude;

  async findMany(
    filters: BookFilters,
    page: number,
    limit: number,
    includeDetails = false
  ) {
    const skip = (page - 1) * limit;
    const where = this.buildWhereClause(filters);
    
    const [books, total] = await this.prisma.$transaction([
      this.prisma.bookMaster.findMany({
        where,
        include: includeDetails ? this.detailIncludes : this.defaultIncludes,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.bookMaster.count({ where })
    ]);

    return { books, total };
  }

  async findById(id: string, userId?: string, includeTransactions = false) {
    const where: Prisma.BookMasterWhereInput = { id };
    if (userId) where.userId = userId;

    const book = await this.prisma.bookMaster.findFirst({
      where,
      include: {
        ...this.detailIncludes,
        ...(includeTransactions && {
          summaryTransactions: {
            include: {
              genericSubject: true,
              specificSubject: true
            },
            orderBy: { srNo: 'asc' as const }
          }
        })
      }
    });

    if (!book) {
      throw new ApiError(404, 'Book not found', 'BOOK_NOT_FOUND');
    }

    return book;
  }

  async create(data: BookCreateData) {
    const { editors, genericTags, specificTags, ...bookData } = data;

    // Check for duplicate library number
    const existing = await this.prisma.bookMaster.findFirst({
      where: {
        libraryNumber: bookData.libraryNumber,
        userId: bookData.userId
      }
    });

    if (existing) {
      throw new ApiError(400, 'Library number already exists', 'DUPLICATE_LIBRARY_NUMBER');
    }

    return await this.prisma.$transaction(async (tx) => {
      // Create book
      const book = await tx.bookMaster.create({
        data: bookData
      });

      // Create related entities in parallel
      const promises = [];

      if (editors?.length) {
        promises.push(
          tx.bookEditor.createMany({
            data: editors.map(e => ({
              bookId: book.id,
              name: e.name,
              role: e.role || 'Editor'
            }))
          })
        );
      }

      if (genericTags?.length) {
        promises.push(
          tx.bookGenericTag.createMany({
            data: genericTags.map(tagId => ({
              bookId: book.id,
              genericSubjectId: tagId
            })),
          })
        );
      }

      if (specificTags?.length) {
        promises.push(
          tx.bookSpecificTag.createMany({
            data: specificTags.map(tagId => ({
              bookId: book.id,
              tagId
            })),
          })
        );
      }

      await Promise.all(promises);

      // Return complete book
      return await tx.bookMaster.findUnique({
        where: { id: book.id },
        include: this.detailIncludes
      });
    });
  }

  async update(id: string, userId: string, data: Partial<BookCreateData>) {
    // Verify ownership
    await this.findById(id, userId);

    const { editors, genericTags, specificTags, ...bookData } = data;

    return await this.prisma.$transaction(async (tx) => {
      // Update book
      const book = await tx.bookMaster.update({
        where: { id },
        data: {
          ...bookData,
          updatedAt: new Date()
        }
      });

      const promises = [];

      // Update editors if provided
      if (editors !== undefined) {
        promises.push(
          tx.bookEditor.deleteMany({ where: { bookId: id } }),
          editors.length > 0 
            ? tx.bookEditor.createMany({
                data: editors.map(e => ({
                  bookId: id,
                  name: e.name,
                  role: e.role || 'Editor'
                }))
              })
            : Promise.resolve()
        );
      }

      // Update generic tags if provided
      if (genericTags !== undefined) {
        promises.push(
          tx.bookGenericTag.deleteMany({ where: { bookId: id } }),
          genericTags.length > 0
            ? tx.bookGenericTag.createMany({
                data: genericTags.map(tagId => ({
                  bookId: id,
                  genericSubjectId: tagId
                })),
              })
            : Promise.resolve()
        );
      }

      // Update specific tags if provided
      if (specificTags !== undefined) {
        promises.push(
          tx.bookSpecificTag.deleteMany({ where: { bookId: id } }),
          specificTags.length > 0
            ? tx.bookSpecificTag.createMany({
                data: specificTags.map(tagId => ({
                  bookId: id,
                  tagId
                })),
              })
            : Promise.resolve()
        );
      }

      await Promise.all(promises);

      // Return updated book
      return await tx.bookMaster.findUnique({
        where: { id },
        include: this.detailIncludes
      });
    });
  }

  async delete(id: string, userId: string) {
    // Verify ownership
    await this.findById(id, userId);

    return await this.prisma.$transaction(async (tx) => {
      // Delete all related entities
      await Promise.all([
        tx.bookEditor.deleteMany({ where: { bookId: id } }),
        tx.bookGenericTag.deleteMany({ where: { bookId: id } }),
        tx.bookSpecificTag.deleteMany({ where: { bookId: id } }),
        tx.summaryTransaction.deleteMany({ where: { bookId: id } })
      ]);

      // Delete the book
      await tx.bookMaster.delete({ where: { id } });
    });
  }

  private buildWhereClause(filters: BookFilters): Prisma.BookMasterWhereInput {
    const where: Prisma.BookMasterWhereInput = {};

    if (filters.userId) where.userId = filters.userId;

    if (filters.search) {
      where.OR = [
        { bookName: { contains: filters.search, mode: 'insensitive' } },
        { libraryNumber: { contains: filters.search, mode: 'insensitive' } },
        { bookSummary: { contains: filters.search, mode: 'insensitive' } },
        { publisherName: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.libraryNumber) {
      where.libraryNumber = filters.libraryNumber;
    }

    if (filters.publisherName) {
      where.publisherName = { contains: filters.publisherName, mode: 'insensitive' };
    }

    if (filters.grade) {
      where.grade = filters.grade;
    }

    if (filters.genericTagIds?.length) {
      where.genericTags = {
        some: {
          genericSubjectId: { in: filters.genericTagIds }
        }
      };
    }

    if (filters.specificTagIds?.length) {
      where.specificTags = {
        some: {
          tagId: { in: filters.specificTagIds }
        }
      };
    }

    return where;
  }
}