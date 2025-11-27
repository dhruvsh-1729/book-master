import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";

const ensureAdmin = async (req: NextApiRequest) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || (user.role || "user") !== "admin") return null;
  return user;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await ensureAdmin(req);
  if (!admin) return res.status(403).json({ error: "Admin access required" });

  if (req.method === "GET") {
    try {
      const users = await prisma.user.findMany({
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          defaultGenericSubjects: {
            include: { genericSubject: true },
          },
          defaultSpecificTags: {
            include: { tag: true },
          },
        },
      });

      const mapped = users.map((u) => ({
        ...u,
        defaultGenericSubjects: u.defaultGenericSubjects.map((row) => row.genericSubject).filter(Boolean),
        defaultSpecificTags: u.defaultSpecificTags.map((row) => row.tag).filter(Boolean),
      }));

      return res.status(200).json({ users: mapped });
    } catch (e) {
      console.error("GET /admin/users error", e);
      return res.status(500).json({ error: "Failed to load users" });
    }
  }

  res.setHeader("Allow", ["GET"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
