import { Prisma, BookMaster } from "@prisma/client";
import { BaseRepository } from "./base.repository";
import { ApiError } from "../utils/api-helpers";

export interface BookFilters {
  userId?: string;
  search?: string;
  libraryNumber?: string;
  publisherName?: string;
  grade?: string;

  /** New schema: filter through transactions relation */
  genericSubjectIds?: string[];
  specificSubjectIds?: string[];
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
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;

  /** Related rows to create */
  editors?: Array<{ name: string; role?: string }>;
}

export class BookRepository extends BaseRepository {
  private readonly defaultIncludes: Prisma.BookMasterInclude = {
    user: { select: { id: true, name: true, email: true } },
    _count: {
      select: {
        /** relation name in schema */
        transactions: true,
        editor: true,
      },
    },
  };

  private readonly detailIncludes: Prisma.BookMasterInclude = {
    ...this.defaultIncludes,
    /** relation name is `editor` in BookMaster */
    editor: true,
    /** relation name is `transactions` in BookMaster */
    transactions: {
      include: {
        /** relation names inside SummaryTransaction */
        genericSubjects: { include: { genericSubject: true } },
        specificSubjects: { include: { tag: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { srNo: "asc" },
    },
  };

  /* ============================ FIND MANY ============================ */
  async findMany(
    filters: BookFilters,
    page: number,
    limit: number,
    includeDetails = false
  ) {
    const skip = Math.max(0, (page - 1) * limit);
    const where = this.buildWhereClause(filters);

    const [books, total] = await this.prisma.$transaction([
      this.prisma.bookMaster.findMany({
        where,
        include: includeDetails ? this.detailIncludes : this.defaultIncludes,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.bookMaster.count({ where }),
    ]);

    return { books, total };
  }

  /* ============================ FIND BY ID ============================ */
  async findById(
    id: string,
    userId?: string,
    includeTransactions = false
  ) {
    const where: Prisma.BookMasterWhereInput = { id };
    if (userId) where.userId = userId;

    const book = await this.prisma.bookMaster.findFirst({
      where,
      include: includeTransactions
        ? this.detailIncludes
        : {
            ...this.defaultIncludes,
            editor: true, // handy basic details even when not loading transactions
          },
    });

    if (!book) {
      throw new ApiError(404, "Book not found", "BOOK_NOT_FOUND");
    }
    return book;
  }

  /* ============================ CREATE ============================ */
  async create(data: BookCreateData) {
    const { editors, ...bookData } = data;

    return await this.prisma.$transaction(async (tx) => {
      const book = await tx.bookMaster.create({ data: bookData });

      if (editors?.length) {
        await tx.bookEditor.createMany({
          data: editors.map((e) => ({
            bookId: book.id,
            name: e.name,
            role: e.role || "Editor",
          })),
        });
      }

      return await tx.bookMaster.findUnique({
        where: { id: book.id },
        include: this.detailIncludes,
      });
    });
  }

  /* ============================ UPDATE ============================ */
  async update(id: string, userId: string, data: Partial<BookCreateData>) {
    // ownership + existence
    await this.findById(id, userId);

    const { editors, ...bookData } = data;

    return await this.prisma.$transaction(async (tx) => {
      await tx.bookMaster.update({
        where: { id },
        data: { ...bookData, updatedAt: new Date() },
      });

      // replace editors if provided
      if (editors !== undefined) {
        await tx.bookEditor.deleteMany({ where: { bookId: id } });
        if (editors.length) {
          await tx.bookEditor.createMany({
            data: editors.map((e) => ({
              bookId: id,
              name: e.name,
              role: e.role || "Editor",
            })),
          });
        }
      }

      return await tx.bookMaster.findUnique({
        where: { id },
        include: this.detailIncludes,
      });
    });
  }

  /* ============================ DELETE ============================ */
  async delete(id: string, userId: string) {
    await this.findById(id, userId);

    await this.prisma.$transaction(async (tx) => {
      const txIds = await tx.summaryTransaction.findMany({
        where: { bookId: id },
        select: { id: true },
      });
      const summaryIds = txIds.map((t) => t.id);

      if (summaryIds.length) {
        await tx.summaryTransactionSpecificTag.deleteMany({ where: { summaryTransactionId: { in: summaryIds } } });
        await tx.summaryTransactionGenericSubject.deleteMany({ where: { summaryTransactionId: { in: summaryIds } } });
      }

      await Promise.all([
        tx.bookEditor.deleteMany({ where: { bookId: id } }),
        tx.summaryTransaction.deleteMany({ where: { bookId: id } }),
      ]);

      await tx.bookMaster.delete({ where: { id } });
    });
  }

  /* ============================ WHERE BUILDER ============================ */
  private buildWhereClause(filters: BookFilters): Prisma.BookMasterWhereInput {
    const where: Prisma.BookMasterWhereInput = {};

    if (filters.userId) where.userId = filters.userId;

    if (filters.search) {
      where.OR = [
        { bookName: { contains: filters.search, mode: "insensitive" } },
        { libraryNumber: { contains: filters.search, mode: "insensitive" } },
        { bookSummary: { contains: filters.search, mode: "insensitive" } },
        { publisherName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.libraryNumber) {
      where.libraryNumber = filters.libraryNumber;
    }

    if (filters.publisherName) {
      where.publisherName = { contains: filters.publisherName, mode: "insensitive" };
    }

    if (filters.grade) {
      where.grade = filters.grade;
    }

    const transactionFilters: Prisma.SummaryTransactionWhereInput = {};
    if (filters.genericSubjectIds?.length) {
      transactionFilters.genericSubjects = {
        some: { genericSubjectId: { in: filters.genericSubjectIds } },
      };
    }
    if (filters.specificSubjectIds?.length) {
      transactionFilters.specificSubjects = {
        some: { tagId: { in: filters.specificSubjectIds } },
      };
    }
    if (Object.keys(transactionFilters).length) {
      where.transactions = { some: transactionFilters };
    }

    return where;
  }
}
