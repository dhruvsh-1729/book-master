// lib/services/book.service.ts
import { BookRepository, BookFilters, BookCreateData } from '../repositories/book.repository';
import { CacheService } from './cache.service';

export class BookService {
  constructor(
    private bookRepo: BookRepository,
    private cache: CacheService
  ) {}

  async getBooks(filters: BookFilters, page: number, limit: number) {
    const cacheKey = `books:${JSON.stringify(filters)}:${page}:${limit}`;
    
    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.bookRepo.findMany(filters, page, limit);
    
    // Cache for 5 minutes
    await this.cache.set(cacheKey, result, 300);
    
    return result;
  }

  async getBookById(id: string, userId?: string, includeTransactions = false) {
    const cacheKey = `book:${id}:${userId}:${includeTransactions}`;
    
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const book = await this.bookRepo.findById(id, userId, includeTransactions);
    
    // Cache for 10 minutes
    await this.cache.set(cacheKey, book, 600);
    
    return book;
  }

  async createBook(data: BookCreateData) {
    const book = await this.bookRepo.create(data);
    
    // Invalidate relevant caches
    await this.cache.invalidatePattern(`books:*`);
    
    return book;
  }

  async updateBook(id: string, userId: string, data: Partial<BookCreateData>) {
    const book = await this.bookRepo.update(id, userId, data);
    
    // Invalidate relevant caches
    await this.cache.invalidatePattern(`book:${id}:*`);
    await this.cache.invalidatePattern(`books:*`);
    
    return book;
  }

  async deleteBook(id: string, userId: string) {
    await this.bookRepo.delete(id, userId);
    
    // Invalidate relevant caches
    await this.cache.invalidatePattern(`book:${id}:*`);
    await this.cache.invalidatePattern(`books:*`);
    await this.cache.invalidatePattern(`transactions:*`);
  }
}