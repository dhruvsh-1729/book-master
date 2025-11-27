// pages/api/upload.ts - Image upload to Cloudinary
import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs/promises";
import path from "path";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

export const config = {
  api: { bodyParser: false, sizeLimit: "25mb" },
};

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "book-assets";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true,
});

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

const toStr = (v: unknown): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";

function buildBaseId(originalName?: string | null) {
  const base = String(originalName || "image")
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "image"}-${Date.now()}`;
}

async function parseForm(req: NextApiRequest): Promise<{ file: File; folder: string }> {
  const form = formidable({ multiples: false, maxFileSize: 25 * 1024 * 1024 });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      try {
        const folderField = toStr(fields.folder);
        const folder = folderField.trim() || CLOUDINARY_FOLDER;

        const fileAny = (files.image || files.file) as File | File[] | undefined;
        const file = Array.isArray(fileAny) ? fileAny[0] : fileAny;
        if (!file) return reject(new Error("Missing image file"));

        if (file.mimetype && !allowedMimeTypes.includes(file.mimetype)) {
          return reject(new Error("Unsupported image type"));
        }

        resolve({ file, folder });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function uploadImageToCloudinary(buffer: Buffer, folder: string, filename?: string) {
  const publicIdBase = buildBaseId(filename);
  const publicId = `${folder}/${publicIdBase}`;

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        overwrite: false,
        resource_type: "image",
        access_mode: "public",
      },
      (error, res) => (error || !res ? reject(error ?? new Error("Unknown Cloudinary error")) : resolve(res)),
    );
    upload.end(buffer);
  });

  return { publicId: result.public_id, url: result.secure_url, version: result.version };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(500).json({ error: "Cloudinary is not configured" });
  }

  try {
    const { file, folder } = await parseForm(req);
    const buffer = await fs.readFile(file.filepath);
    const { publicId, url, version } = await uploadImageToCloudinary(
      buffer,
      folder,
      file.originalFilename || undefined,
    );

    return res.status(200).json({ ok: true, url, publicId, version });
  } catch (e: any) {
    console.error("upload image error:", e);
    return res.status(500).json({ error: e?.message || "Failed to upload image" });
  }
}
