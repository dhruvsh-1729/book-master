// pages/api/books/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getUserIdFromRequest } from '../../../lib/auth';
import { BookRepository } from '../../../lib/repositories/book.repository';
import { BookService } from '../../../lib/services/book.service';
import { CacheService } from '../../../lib/services/cache.service';
import { withErrorHandler } from '../../../lib/middleware/error-handler';
import { parseQueryParam, parseIntParam, buildPaginationResponse, ApiError } from '../../../lib/utils/api-helpers';
import prisma from '../../../lib/prisma';

const bookRepo = new BookRepository(prisma);
const cacheService = new CacheService();
const bookService = new BookService(bookRepo, cacheService);

export default withErrorHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  switch (req.method) {
    case 'GET': {
      const page = parseIntParam(req.query.page, 1, 1);
      const limit = parseIntParam(req.query.limit, 10, 1, 100);
      const search = parseQueryParam(req.query.search);
      
      const filters = {
        userId,
        search: search || undefined
      };

      const { books, total } = await bookService.getBooks(filters, page, limit);
      
      return res.status(200).json({
        books,
        pagination: buildPaginationResponse(page, limit, total)
      });
    }

    case 'POST': {
      const { libraryNumber, bookName, ...rest } = req.body;
      
      if (!libraryNumber || !bookName) {
        throw new ApiError(400, 'Library number and book name are required', 'MISSING_FIELDS');
      }

      const book = await bookService.createBook({
        ...req.body,
        userId
      });

      return res.status(201).json(book);
    }

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      throw new ApiError(405, `Method ${req.method} Not Allowed`, 'METHOD_NOT_ALLOWED');
  }
});