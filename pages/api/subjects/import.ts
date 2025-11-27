import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { parse } from "csv-parse/sync";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

const normalizeKey = (k: string) =>
  String(k || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const truthy = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const type = toStr(req.body?.type).toLowerCase() as "generic" | "specific";
  const csvText = toStr(req.body?.csvText);
  if (!csvText) return res.status(400).json({ error: "csvText is required" });
  if (!type || (type !== "generic" && type !== "specific")) {
    return res.status(400).json({ error: "type must be 'generic' or 'specific'" });
  }

  try {
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, any>[];

    if (!records.length) return res.status(400).json({ error: "CSV has no data rows" });

    let created = 0;
    let updated = 0;

    for (const row of records) {
      const normalized: Record<string, any> = {};
      for (const key of Object.keys(row)) {
        normalized[normalizeKey(key)] = row[key];
      }

      const name = toStr(normalized["name"]);
      if (!truthy(name)) continue;

      const description = toStr(normalized["description"]) || null;

      if (type === "generic") {
        const existing = await prisma.genericSubjectMaster.findUnique({ where: { name } });
        if (existing) {
          await prisma.genericSubjectMaster.update({
            where: { id: existing.id },
            data: { description },
          });
          updated++;
        } else {
          await prisma.genericSubjectMaster.create({ data: { name, description } });
          created++;
        }
      } else {
        const category = toStr(normalized["category"]) || null;
        const existing = await prisma.tagMaster.findUnique({ where: { name } });
        if (existing) {
          await prisma.tagMaster.update({
            where: { id: existing.id },
            data: { description, category },
          });
          updated++;
        } else {
          await prisma.tagMaster.create({ data: { name, description, category } });
          created++;
        }
      }
    }

    return res.status(200).json({ ok: true, created, updated });
  } catch (e) {
    console.error("import subjects error", e);
    return res.status(500).json({ error: "Failed to import subjects" });
  }
}
