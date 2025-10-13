// lib/middleware/validation.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ApiError } from '../utils/api-helpers';

export const validateRequest = (schema: any) => {
  return (handler: any) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        const validated = await schema.parseAsync(req.body);
        req.body = validated;
        return handler(req, res);
      } catch (error: any) {
        throw new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
      }
    };
  };
};