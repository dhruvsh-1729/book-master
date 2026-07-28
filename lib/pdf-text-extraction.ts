type PdfPageText = {
  pageNumber: number;
  text: string;
  error?: string;
};

export type PdfTextExtractionResult = {
  pageCount: number;
  pages: PdfPageText[];
  text: string;
  hasTextLayer: boolean;
  pageErrors: Array<{ pageNumber: number; error: string }>;
  textTruncated: boolean;
  skippedTextPages: number;
};

const MIN_VALID_LETTER_COUNT = 40;
const DEFAULT_MAX_TEXT_BYTES = 2_500_000;
const DEFAULT_MAX_PAGE_TEXT_CHARS = 12_000;

let canvasModulePromise: Promise<typeof import("@napi-rs/canvas")> | null = null;

async function loadCanvasModule() {
  if (!canvasModulePromise) {
    canvasModulePromise = import("@napi-rs/canvas");
  }
  return canvasModulePromise;
}

async function ensureGetBuiltinModule() {
  const proc = process as any;
  let ok = false;

  try {
    const builtin = proc.getBuiltinModule?.("module");
    ok = typeof builtin?.createRequire === "function";
  } catch {
    ok = false;
  }

  if (ok) return;

  const imported = await import("node:module").catch(() => import("module"));
  const moduleNs: any = (imported as any).createRequire ? imported : (imported as any).default;

  if (typeof moduleNs?.createRequire !== "function") {
    throw new Error("Node createRequire is unavailable for PDF parsing.");
  }

  proc.getBuiltinModule = (name: string) => {
    if (name === "module") return moduleNs;
    return moduleNs;
  };
}

async function ensureDomLikeGlobals() {
  const globalAny = globalThis as any;
  if (globalAny.DOMMatrix && globalAny.Path2D && globalAny.ImageData) return;

  const canvas = await loadCanvasModule();
  if (!globalAny.DOMMatrix && canvas.DOMMatrix) globalAny.DOMMatrix = canvas.DOMMatrix;
  if (!globalAny.Path2D && canvas.Path2D) globalAny.Path2D = canvas.Path2D;
  if (!globalAny.ImageData && canvas.ImageData) globalAny.ImageData = canvas.ImageData;
}

async function importPdfJs() {
  await ensureGetBuiltinModule();
  await ensureDomLikeGlobals();

  try {
    const pdfModule: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = pdfModule?.default || pdfModule;
    if (pdfjs?.getDocument) return pdfjs;
  } catch {
    // Fall back to the non-legacy build below.
  }

  const pdfModule: any = await import("pdfjs-dist/build/pdf.mjs");
  const pdfjs = pdfModule?.default || pdfModule;
  if (pdfjs?.getDocument) return pdfjs;

  throw new Error("PDF parser is not available in this environment.");
}

function normalizeTextItems(items: any[]) {
  return items
    .map((item) => {
      const str = typeof item?.str === "string" ? item.str : "";
      return item?.hasEOL ? `${str}\n` : `${str} `;
    })
    .join("")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function hasMeaningfulText(text: string) {
  const letterCount = (text.match(/\p{L}/gu) || text.match(/[A-Za-z]/g) || []).length;
  return letterCount >= MIN_VALID_LETTER_COUNT;
}

export async function extractPdfTextPages(
  pdfBytes: Uint8Array,
  opts?: {
    metadataOnly?: boolean;
    maxTextBytes?: number;
    maxPageTextChars?: number;
  },
): Promise<PdfTextExtractionResult> {
  const pdfjs = await importPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageCount = Number(pdf.numPages) || 0;
  const pages: PdfPageText[] = [];
  const pageErrors: Array<{ pageNumber: number; error: string }> = [];
  const metadataOnly = opts?.metadataOnly === true;
  const maxTextBytes = Math.max(0, opts?.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES);
  const maxPageTextChars = Math.max(0, opts?.maxPageTextChars ?? DEFAULT_MAX_PAGE_TEXT_CHARS);
  let textBytes = 0;
  let textTruncated = false;
  let skippedTextPages = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (metadataOnly || textBytes >= maxTextBytes) {
        pages.push({ pageNumber, text: "" });
        skippedTextPages += 1;
        if (!metadataOnly) textTruncated = true;
        continue;
      }

      let page: any | null = null;
      try {
        page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        let text = normalizeTextItems(textContent.items || []);
        if (maxPageTextChars && text.length > maxPageTextChars) {
          text = text.slice(0, maxPageTextChars).trimEnd();
          textTruncated = true;
        }

        const nextBytes = Buffer.byteLength(text, "utf8");
        if (textBytes + nextBytes > maxTextBytes) {
          const remaining = Math.max(0, maxTextBytes - textBytes);
          text = remaining ? text.slice(0, remaining).trimEnd() : "";
          textTruncated = true;
        }

        textBytes += Buffer.byteLength(text, "utf8");
        pages.push({
          pageNumber,
          text,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to extract page text.";
        pageErrors.push({ pageNumber, error: message });
        pages.push({ pageNumber, text: "", error: message });
      } finally {
        page?.cleanup?.();
      }
    }
  } finally {
    pdf?.cleanup?.();
    pdf?.destroy?.();
    loadingTask?.destroy?.();
  }

  const text = pages
    .map((page) => (page.text ? `--- Page ${page.pageNumber} ---\n${page.text}` : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    pageCount,
    pages,
    text,
    hasTextLayer: hasMeaningfulText(text),
    pageErrors,
    textTruncated,
    skippedTextPages,
  };
}
