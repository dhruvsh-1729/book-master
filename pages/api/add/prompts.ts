import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  ensureAddPromptTemplates,
  updateAddPromptTemplates,
} from "@/lib/services/prompt-template.service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  if (req.method === "GET") {
    try {
      const prompts = await ensureAddPromptTemplates(prisma);
      return res.status(200).json({ prompts });
    } catch (error) {
      console.error("GET /add/prompts error", error);
      return res.status(500).json({ error: "Failed to load add prompts" });
    }
  }

  if (req.method === "PUT") {
    try {
      const updates = Array.isArray(req.body?.prompts) ? req.body.prompts : [];
      const prompts = await updateAddPromptTemplates(
        prisma,
        updates.map((prompt: any) => ({
          key: String(prompt?.key || ""),
          promptText: String(prompt?.promptText || ""),
        }))
      );
      return res.status(200).json({ prompts });
    } catch (error) {
      console.error("PUT /add/prompts error", error);
      return res.status(500).json({ error: "Failed to update add prompts" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
