// pages/api/transactions/clear-cache.ts
import { NextApiRequest, NextApiResponse } from 'next';

// This would need to be shared if you want cross-file cache access
// For now, this is a simple endpoint to understand the pattern
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // In a real implementation, you'd clear the cache here
    // For distributed systems, consider Redis instead of in-memory cache
    return res.status(200).json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Clear cache error:', error);
    return res.status(500).json({ error: 'Failed to clear cache' });
  }
}