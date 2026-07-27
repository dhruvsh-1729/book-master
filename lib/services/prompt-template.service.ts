import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AddPromptTemplateKey =
  | "add_pdf_system"
  | "add_pdf_title"
  | "add_pdf_keywords"
  | "add_pdf_summary"
  | "add_pdf_conclusion"
  | "add_pdf_rating"
  | "add_pdf_generic_subjects"
  | "add_pdf_specific_subjects";

export type AddPromptTemplate = {
  key: AddPromptTemplateKey;
  label: string;
  description: string;
  promptText: string;
};

export const DEFAULT_ADD_PROMPTS: AddPromptTemplate[] = [
  {
    key: "add_pdf_system",
    label: "System Prompt",
    description: "Overall instruction for the DeepSeek request used by the PDF add flow.",
    promptText:
      "You generate structured JSON for book summary transaction drafts from extracted PDF text. Return valid JSON only, follow the requested schema exactly, and do not include markdown.",
  },
  {
    key: "add_pdf_title",
    label: "Title",
    description: "Controls how each summary transaction title is generated.",
    promptText:
      "Create one concise, specific title for this split. Prefer the main concept, event, argument, or section heading. Keep it under 18 words and avoid generic titles like summary or chapter.",
  },
  {
    key: "add_pdf_keywords",
    label: "Keywords",
    description: "Controls the comma-separated keywords field.",
    promptText:
      "Generate 5 to 10 useful comma-separated keywords. Prefer names, places, concepts, institutions, and recurring terms present in the extracted text.",
  },
  {
    key: "add_pdf_summary",
    label: "Summary",
    description: "Controls the summary field.",
    promptText:
      "Write a factual summary of the split in clear prose. Preserve important claims and context from the text. Do not invent facts. Aim for 120 to 220 words unless the split is very short.",
  },
  {
    key: "add_pdf_conclusion",
    label: "Conclusion",
    description: "Controls the conclusion field.",
    promptText:
      "Write a short conclusion that captures the implication, outcome, or editorial takeaway of this split. Keep it grounded in the extracted text.",
  },
  {
    key: "add_pdf_rating",
    label: "Information Rating",
    description: "Controls the informationRating value.",
    promptText:
      "Choose informationRating as A, A+, I, I+, or empty string. Use A/A+ for strong factual or reference value, I/I+ for interpretive or insight-heavy material, and empty string if unsure.",
  },
  {
    key: "add_pdf_generic_subjects",
    label: "Generic Subjects",
    description: "Controls broad subject suggestions.",
    promptText:
      "Suggest broad umbrella generic subjects. Prefer existing candidate names exactly when they fit. Use short lowercase names for new subjects. Avoid vague subjects like miscellaneous.",
  },
  {
    key: "add_pdf_specific_subjects",
    label: "Specific Subjects",
    description: "Controls granular subject/tag suggestions.",
    promptText:
      "Suggest precise specific subjects or tags for granular indexing. Prefer existing candidate names exactly when they fit. For new subjects, use short lowercase names and add a concise category when useful.",
  },
];

const DEFAULTS_BY_KEY = new Map(DEFAULT_ADD_PROMPTS.map((prompt) => [prompt.key, prompt]));
const DEFAULT_KEYS = DEFAULT_ADD_PROMPTS.map((prompt) => prompt.key);

export async function ensureAddPromptTemplates(db: DbClient) {
  const existingRows = await db.aiPromptTemplate.findMany({
    where: { key: { in: DEFAULT_KEYS } },
    orderBy: [{ createdAt: "asc" }],
  });

  const existingByKey = new Map<string, any>();
  for (const row of existingRows) {
    if (!existingByKey.has(row.key)) existingByKey.set(row.key, row);
  }

  const missing = DEFAULT_ADD_PROMPTS.filter((prompt) => !existingByKey.has(prompt.key));
  for (const prompt of missing) {
    const created = await db.aiPromptTemplate.create({
      data: {
        key: prompt.key,
        label: prompt.label,
        description: prompt.description,
        promptText: prompt.promptText,
      },
    });
    existingByKey.set(created.key, created);
  }

  return DEFAULT_ADD_PROMPTS.map((prompt) => {
    const row = existingByKey.get(prompt.key);
    return {
      id: row?.id,
      key: prompt.key,
      label: row?.label || prompt.label,
      description: row?.description || prompt.description,
      promptText: row?.promptText || prompt.promptText,
      createdAt: row?.createdAt,
      updatedAt: row?.updatedAt,
    };
  });
}

export async function updateAddPromptTemplates(
  db: DbClient,
  updates: Array<{ key: string; promptText: string }>
) {
  await ensureAddPromptTemplates(db);

  for (const update of updates) {
    const defaultPrompt = DEFAULTS_BY_KEY.get(update.key as AddPromptTemplateKey);
    if (!defaultPrompt) continue;
    const promptText = String(update.promptText || "").trim();
    if (!promptText) continue;

    await db.aiPromptTemplate.updateMany({
      where: { key: defaultPrompt.key },
      data: {
        label: defaultPrompt.label,
        description: defaultPrompt.description,
        promptText,
      },
    });
  }

  return ensureAddPromptTemplates(db);
}

export function promptMapFromRows(rows: Array<{ key: string; promptText: string }>) {
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.key, row.promptText);
  for (const prompt of DEFAULT_ADD_PROMPTS) {
    if (!map.has(prompt.key)) map.set(prompt.key, prompt.promptText);
  }
  return map;
}
