import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

const exportGeneric = async () => {
  const rows = await prisma.genericSubjectMaster.findMany({
    orderBy: [{ name: "asc" }],
    select: { name: true, description: true },
  });
  const header = ["name", "description"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const name = (row.name || "").replace(/"/g, '""');
    const desc = (row.description || "").replace(/"/g, '""');
    lines.push(`"${name}","${desc}"`);
  }
  return lines.join("\n");
};

const exportSpecific = async () => {
  const rows = await prisma.tagMaster.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { name: true, description: true, category: true },
  });
  const header = ["name", "category", "description"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const name = (row.name || "").replace(/"/g, '""');
    const category = (row.category || "").replace(/"/g, '""');
    const desc = (row.description || "").replace(/"/g, '""');
    lines.push(`"${name}","${category}","${desc}"`);
  }
  return lines.join("\n");
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const type = toStr(req.query.type).toLowerCase() as "generic" | "specific";
  if (!type || (type !== "generic" && type !== "specific")) {
    return res.status(400).json({ error: "type must be 'generic' or 'specific'" });
  }

  try {
    const csv = type === "generic" ? await exportGeneric() : await exportSpecific();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${type}-subjects.csv`);
    return res.status(200).send(csv);
  } catch (e) {
    console.error("export subjects error", e);
    return res.status(500).json({ error: "Failed to export subjects" });
  }
}
