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

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return res.status(400).json({ error: "User ID is required" });

  if (req.method === "PUT") {
    try {
      const { role, defaultGenericSubjectIds, defaultSpecificTagIds } = req.body ?? {};

      const normalizedRole = role ? String(role) : undefined;
      const genericIds: string[] = Array.isArray(defaultGenericSubjectIds)
        ? defaultGenericSubjectIds.map((v: any) => String(v)).filter(Boolean)
        : [];
      const specificIds: string[] = Array.isArray(defaultSpecificTagIds)
        ? defaultSpecificTagIds.map((v: any) => String(v)).filter(Boolean)
        : [];

      await prisma.$transaction(async (tx) => {
        if (normalizedRole) {
          await tx.user.update({
            where: { id },
            data: { role: normalizedRole },
          });
        }

        if (defaultGenericSubjectIds !== undefined) {
          await tx.userDefaultGenericSubject.deleteMany({ where: { userId: id } });
          if (genericIds.length) {
            await tx.userDefaultGenericSubject.createMany({
              data: genericIds.map((gid) => ({ userId: id, genericSubjectId: gid })),
            });
          }
        }

        if (defaultSpecificTagIds !== undefined) {
          await tx.userDefaultSpecificTag.deleteMany({ where: { userId: id } });
          if (specificIds.length) {
            await tx.userDefaultSpecificTag.createMany({
              data: specificIds.map((tid) => ({ userId: id, tagId: tid })),
            });
          }
        }
      });

      const updated = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          defaultGenericSubjects: { include: { genericSubject: true } },
          defaultSpecificTags: { include: { tag: true } },
        },
      });

      return res.status(200).json({
        ...updated,
        defaultGenericSubjects: (updated?.defaultGenericSubjects || []).map((row) => row.genericSubject),
        defaultSpecificTags: (updated?.defaultSpecificTags || []).map((row) => row.tag),
      });
    } catch (e) {
      console.error("PUT /admin/users/[id] error", e);
      return res.status(500).json({ error: "Failed to update user" });
    }
  }

  res.setHeader("Allow", ["PUT"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
