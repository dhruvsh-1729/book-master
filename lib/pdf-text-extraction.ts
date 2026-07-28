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
};

const MIN_VALID_LETTER_COUNT = 40;

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

export async function extractPdfTextPages(pdfBytes: Uint8Array): Promise<PdfTextExtractionResult> {
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

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      let page: any | null = null;
      try {
        page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pages.push({
          pageNumber,
          text: normalizeTextItems(textContent.items || []),
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
  };
}
