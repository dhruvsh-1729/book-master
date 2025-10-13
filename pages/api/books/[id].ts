// pages/api/books/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getUserIdFromRequest } from '../../../lib/auth';
import { BookRepository } from '../../../lib/repositories/book.repository';
import { BookService } from '../../../lib/services/book.service';
import { CacheService } from '../../../lib/services/cache.service';
import { withErrorHandler } from '../../../lib/middleware/error-handler';
import { parseQueryParam, ApiError } from '../../../lib/utils/api-helpers';
import prisma from '../../../lib/prisma';

const bookRepo = new BookRepository(prisma);
const cacheService = new CacheService();
const bookService = new BookService(bookRepo, cacheService);

export default withErrorHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  const id = parseQueryParam(req.query.id);
  if (!id) {
    throw new ApiError(400, 'Book ID is required', 'MISSING_ID');
  }

  switch (req.method) {
    case 'GET': {
      const includeTransactions = req.query.includeTransactions === 'true';
      const book = await bookService.getBookById(id, userId, includeTransactions);
      res.status(200).json(book);
      return;
    }

    case 'PUT': {
      const book = await bookService.updateBook(id, userId, req.body);
      res.status(200).json(book);
      return;
    }

    case 'DELETE': {
      await bookService.deleteBook(id, userId);
      res.status(204).end();
      return;
    }

    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      throw new ApiError(405, `Method ${req.method} Not Allowed`, 'METHOD_NOT_ALLOWED');
  }
});