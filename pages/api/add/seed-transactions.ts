import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  createDeepSeekJsonCompletion,
  DEEPSEEK_MODEL,
  hasDeepSeekKey,
  parseJsonObjectFromAi,
} from "@/lib/services/deepseek.service";
import { normalizeSubjectName, normalizeWhitespace } from "@/lib/subjects/normalization";
import {
  ensureAddPromptTemplates,
  promptMapFromRows,
} from "@/lib/services/prompt-template.service";

export const config = {
  maxDuration: 120,
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

type SectionInput = {
  localId: string;
  pageStart?: number;
  pageEnd?: number;
  text: string;
};

const MAX_SECTIONS = 24;
const SECTION_TEXT_LIMIT = 7000;
const MAX_AI_TOKENS = 7200;

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "book",
  "chapter",
  "from",
  "have",
  "into",
  "page",
  "pages",
  "paragraph",
  "summary",
  "that",
  "the",
  "their",
  "there",
  "these",
  "this",
  "with",
]);

const clip = (value: unknown, maxLength: number) => {
  const normalized = normalizeWhitespace(String(value || ""));
  return normalized ? normalized.slice(0, maxLength) : "";
};

const extractJsonArray = (value: unknown) => (Array.isArray(value) ? value : []);

const tokenize = (value: string) =>
  Array.from(
    new Set(
      normalizeSubjectName(value)
        .split(/[^a-z0-9\u0900-\u097f\u0a80-\u0aff]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  );

const getFirstSentence = (text: string) => {
  const normalized = normalizeWhitespace(text);
  const sentence = normalized.split(/(?<=[.!?।])\s+/)[0] || normalized;
  return sentence.slice(0, 110);
};

const getLastSentence = (text: string) => {
  const normalized = normalizeWhitespace(text);
  const sentences = normalized.split(/(?<=[.!?।])\s+/).filter(Boolean);
  return (sentences[sentences.length - 1] || normalized).slice(0, 280);
};

const normalizeSuggestion = (
  input: any,
  subjectsByName: Map<string, any>,
  type: "generic" | "specific"
) => {
  const name = normalizeSubjectName(String(input?.name || ""));
  if (!name) return null;
  const existing = subjectsByName.get(name);
  return {
    name: existing?.name || name,
    subjectId: type === "generic" ? existing?.id || null : existing?.id || null,
    tagId: type === "specific" ? existing?.id || null : null,
    description: existing?.description || null,
    category: type === "specific" ? existing?.category || input?.category || null : null,
    reason: clip(input?.reason || "Suggested from the extracted text.", 240),
    source: existing ? "existing" : "new",
    selected: input?.selected !== false,
  };
};

const rankSubjects = (subjects: any[], text: string, limit: number) => {
  const lower = text.toLowerCase();
  const sourceTokens = new Set(tokenize(text));

  return subjects
    .map((subject) => {
      const name = normalizeSubjectName(subject.name);
      const tokens = tokenize([subject.name, subject.description || "", subject.category || ""].join(" "));
      let score = lower.includes(name) ? 30 : 0;
      for (const token of tokens) {
        if (sourceTokens.has(token)) score += 5;
      }
      score += Math.min(subject._count?.summaryTransactions || 0, 20) * 0.15;
      return { ...subject, score };
    })
    .filter((subject) => subject.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
};

const fallbackTransaction = (section: SectionInput, genericCandidates: any[], specificCandidates: any[]) => {
  const tokens = tokenize(section.text).slice(0, 8);
  const generic = genericCandidates.slice(0, 3).map((subject) => ({
    name: subject.name,
    subjectId: subject.id,
    reason: "Matched against the extracted text.",
    source: "existing",
    selected: true,
  }));
  const specific = specificCandidates.slice(0, 4).map((tag) => ({
    name: tag.name,
    subjectId: tag.id,
    tagId: tag.id,
    category: tag.category || null,
    reason: "Matched against the extracted text.",
    source: "existing",
    selected: true,
  }));

  return {
    localId: section.localId,
    title: getFirstSentence(section.text) || `Pages ${section.pageStart || ""}-${section.pageEnd || ""}`.trim(),
    keywords: tokens.join(", "),
    summary: clip(section.text, 900),
    conclusion: getLastSentence(section.text),
    informationRating: "",
    genericSubjects: generic,
    specificSubjects: specific,
  };
};

const candidateList = (subjects: any[]) =>
  subjects
    .map((subject) => {
      const category = subject.category ? ` [${subject.category}]` : "";
      return `- ${subject.name}${category}`;
    })
    .join("\n");

const buildPrompt = ({
  sections,
  genericCandidates,
  specificCandidates,
  prompts,
}: {
  sections: SectionInput[];
  genericCandidates: any[];
  specificCandidates: any[];
  prompts: Map<string, string>;
}) => `
Return strict json only.

You are creating editable summary transaction drafts from extracted PDF text.

Use these database-managed field prompts for each section:

Title:
${prompts.get("add_pdf_title")}

Keywords:
${prompts.get("add_pdf_keywords")}

Summary:
${prompts.get("add_pdf_summary")}

Conclusion:
${prompts.get("add_pdf_conclusion")}

Information rating:
${prompts.get("add_pdf_rating")}

Generic subjects:
${prompts.get("add_pdf_generic_subjects")}

Specific subjects:
${prompts.get("add_pdf_specific_subjects")}

Global rules:
- prefer existing subject names exactly when they fit;
- use short lowercase names for new subjects;
- keep every subject suggestion selected by default;
- do not invent facts not present in the extracted text.

JSON schema:
{
  "transactions": [
    {
      "localId": "string",
      "title": "string",
      "keywords": "string",
      "summary": "string",
      "conclusion": "string",
      "informationRating": "A|A+|I|I+|",
      "genericSubjects": [{"name": "string", "reason": "string"}],
      "specificSubjects": [{"name": "string", "category": "string|null", "reason": "string"}]
    }
  ]
}

Existing generic subject candidates:
${genericCandidates.length ? candidateList(genericCandidates) : "(none)"}

Existing specific subject candidates:
${specificCandidates.length ? candidateList(specificCandidates) : "(none)"}

Sections:
${sections
  .map(
    (section) => `
localId: ${section.localId}
pages: ${section.pageStart || ""}-${section.pageEnd || ""}
text:
${section.text}
`
  )
  .join("\n---\n")}
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    const rawSections = Array.isArray(req.body?.sections) ? req.body.sections : [];
    const sections: SectionInput[] = rawSections
      .slice(0, MAX_SECTIONS)
      .map((section: any, index: number) => ({
        localId: String(section?.localId || `section-${index + 1}`),
        pageStart: Number(section?.pageStart) || undefined,
        pageEnd: Number(section?.pageEnd) || undefined,
        text: clip(section?.text, SECTION_TEXT_LIMIT),
      }))
      .filter((section: SectionInput) => section.text.length > 20);

    if (!sections.length) {
      return res.status(400).json({ error: "Add at least one PDF split with extracted text" });
    }

    const combinedText = sections.map((section) => section.text).join("\n");
    const [allGenericSubjects, allSpecificSubjects] = await Promise.all([
      prisma.genericSubjectMaster.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          _count: { select: { summaryTransactions: true } },
        },
        orderBy: [{ name: "asc" }],
      }),
      prisma.tagMaster.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          _count: { select: { summaryTransactions: true } },
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
    ]);

    const genericCandidates = rankSubjects(allGenericSubjects, combinedText, 70);
    const specificCandidates = rankSubjects(allSpecificSubjects, combinedText, 90);
    const genericByName = new Map(allGenericSubjects.map((subject) => [normalizeSubjectName(subject.name), subject]));
    const specificByName = new Map(allSpecificSubjects.map((subject) => [normalizeSubjectName(subject.name), subject]));
    const promptRows = await ensureAddPromptTemplates(prisma);
    const promptMap = promptMapFromRows(promptRows);

    const fallback = {
      transactions: sections.map((section) =>
        fallbackTransaction(
          section,
          rankSubjects(allGenericSubjects, section.text, 3),
          rankSubjects(allSpecificSubjects, section.text, 4)
        )
      ),
      meta: {
        usedFallback: true,
        model: hasDeepSeekKey() ? DEEPSEEK_MODEL : "heuristic-only",
      },
    };

    if (!hasDeepSeekKey()) {
      return res.status(200).json(fallback);
    }

    try {
      const response = await createDeepSeekJsonCompletion({
        messages: [
          {
            role: "system",
            content: promptMap.get("add_pdf_system") || "Respond with valid json only.",
          },
          {
            role: "user",
            content: buildPrompt({ sections, genericCandidates, specificCandidates, prompts: promptMap }),
          },
        ],
        maxTokens: Math.min(MAX_AI_TOKENS, 1000 + sections.length * 520),
        temperature: 0.2,
      });

      const parsed = parseJsonObjectFromAi(response.content);
      const parsedTransactions = extractJsonArray(parsed?.transactions);

      const transactions = sections.map((section) => {
        const match = parsedTransactions.find((item: any) => String(item?.localId) === section.localId) || {};
        const fallbackDraft = fallbackTransaction(
          section,
          rankSubjects(allGenericSubjects, section.text, 3),
          rankSubjects(allSpecificSubjects, section.text, 4)
        );
        const genericSubjects = extractJsonArray(match?.genericSubjects)
          .map((item) => normalizeSuggestion(item, genericByName, "generic"))
          .filter(Boolean)
          .slice(0, 8);
        const specificSubjects = extractJsonArray(match?.specificSubjects)
          .map((item) => normalizeSuggestion(item, specificByName, "specific"))
          .filter(Boolean)
          .slice(0, 10);

        return {
          ...fallbackDraft,
          title: clip(match?.title, 180) || fallbackDraft.title,
          keywords: clip(match?.keywords, 280) || fallbackDraft.keywords,
          summary: clip(match?.summary, 1800) || fallbackDraft.summary,
          conclusion: clip(match?.conclusion, 900) || fallbackDraft.conclusion,
          informationRating: ["A", "A+", "I", "I+"].includes(String(match?.informationRating || ""))
            ? String(match.informationRating)
            : fallbackDraft.informationRating,
          genericSubjects: genericSubjects.length ? genericSubjects : fallbackDraft.genericSubjects,
          specificSubjects: specificSubjects.length ? specificSubjects : fallbackDraft.specificSubjects,
        };
      });

      return res.status(200).json({
        transactions,
        meta: {
          usedFallback: false,
          model: response.model || DEEPSEEK_MODEL,
          usage: response.usage,
        },
      });
    } catch (error) {
      console.error("DeepSeek PDF draft fallback", error);
      return res.status(200).json(fallback);
    }
  } catch (error) {
    console.error("POST /add/seed-transactions error", error);
    return res.status(500).json({ error: "Failed to generate transaction drafts" });
  }
}
