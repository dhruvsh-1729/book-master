import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import { extractPdfTextPages } from "@/lib/pdf-text-extraction";

export const config = {
  runtime: "nodejs",
  maxDuration: 120,
  api: {
    bodyParser: false,
    sizeLimit: "150mb",
  },
};

const MAX_FILE_SIZE = 150 * 1024 * 1024;

type ExtractPdfResponse =
  | {
      pageCount: number;
      pages: Array<{ pageNumber: number; text: string; error?: string }>;
      text: string;
      hasTextLayer: boolean;
      manualTextRecommended: boolean;
      pageErrors: Array<{ pageNumber: number; error: string }>;
    }
  | { error: string };

async function parseForm(req: NextApiRequest): Promise<File> {
  const form = formidable({ multiples: false, maxFileSize: MAX_FILE_SIZE });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);

      const fileAny = (files.pdf || files.file) as File | File[] | undefined;
      const file = Array.isArray(fileAny) ? fileAny[0] : fileAny;
      if (!file) return reject(new Error("PDF file is required."));

      const originalName = file.originalFilename || "";
      const looksLikePdf =
        file.mimetype === "application/pdf" || /\.pdf$/i.test(originalName);
      if (!looksLikePdf) return reject(new Error("Only PDF files can be extracted."));

      resolve(file);
    });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ExtractPdfResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const file = await parseForm(req);
    const pdfBytes = new Uint8Array(await fs.readFile(file.filepath));
    const result = await extractPdfTextPages(pdfBytes);

    return res.status(200).json({
      ...result,
      manualTextRecommended: !result.hasTextLayer,
    });
  } catch (error) {
    console.error("POST /api/add/extract-pdf error", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to extract text from this PDF.",
    });
  }
}
