
// lib/auth.ts - Authentication middleware
import jwt from 'jsonwebtoken';
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthenticatedRequest extends NextApiRequest {
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export const requireAuth = async (
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      name: user.name || undefined
    };
    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Helper function to get user ID from request
export const getUserIdFromRequest = (req: NextApiRequest): string | null => {
  try {
    const token = req.cookies.token;
    if (!token) return null;

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded.userId;
  } catch (error) {
    return null;
  }
};