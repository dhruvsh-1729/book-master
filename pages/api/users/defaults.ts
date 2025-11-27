import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const [generic, specific] = await Promise.all([
      prisma.userDefaultGenericSubject.findMany({
        where: { userId },
        include: { genericSubject: true },
      }),
      prisma.userDefaultSpecificTag.findMany({
        where: { userId },
        include: { tag: true },
      }),
    ]);

    return res.status(200).json({
      genericSubjects: generic.map((row) => row.genericSubject).filter(Boolean),
      specificTags: specific.map((row) => row.tag).filter(Boolean),
    });
  } catch (e) {
    console.error("GET /users/defaults error", e);
    return res.status(500).json({ error: "Failed to load defaults" });
  }
}
