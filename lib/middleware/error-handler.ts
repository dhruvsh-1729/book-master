// lib/middleware/error-handler.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ApiError } from '../utils/api-helpers';

export const withErrorHandler = (
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('API Error:', error);
      
      if (error instanceof ApiError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }
      
      return res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  };
};
