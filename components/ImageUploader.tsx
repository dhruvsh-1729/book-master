import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Crop as CropIcon, Image as ImageIcon, Trash2, Upload, X } from 'lucide-react';
import 'react-easy-crop/react-easy-crop.css';

export interface ImageValue {
  url?: string | null;
  publicId?: string | null;
}

interface ImageUploaderProps {
  label?: string;
  value?: ImageValue | null;
  onChange: (value: ImageValue | null) => void;
  aspect?: number;
  uploadFolder?: string;
  helpText?: string;
}

const createImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported in this browser');

  canvas.width = crop.width;
  canvas.height = crop.height;

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      'image/jpeg',
      0.9
    );
  });
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  label = 'Image',
  value,
  onChange,
  aspect = 4 / 3,
  uploadFolder,
  helpText,
}) => {
  const [preview, setPreview] = useState<ImageValue | null>(value ?? null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('image.jpg');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPreview(value ?? null);
  }, [value]);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setImageSrc(reader.result as string);
      setModalOpen(true);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
      setSelectedName(file.name || 'image.jpg');
    });
    reader.readAsDataURL(file);
  };

  const uploadCropped = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      const formData = new FormData();
      formData.append('image', blob, selectedName);
      if (uploadFolder) formData.append('folder', uploadFolder);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'Upload failed');
      }
      const nextValue = { url: data.url as string, publicId: data.publicId as string | null };
      setPreview(nextValue);
      onChange(nextValue);
      setModalOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Unable to upload image');
    } finally {
      setUploading(false);
      setImageSrc(null);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onChange(null);
  };

  const placeholder = useMemo(
    () => (
      <div className="flex flex-col items-center justify-center h-40 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500">
        <ImageIcon className="h-8 w-8 mb-2" />
        <p className="text-sm font-medium">Add an image</p>
        <p className="text-xs text-gray-400">JPG, PNG, WebP</p>
      </div>
    ),
    []
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {preview?.url && (
          <div className="flex items-center gap-3">
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              View full image
            </a>
            <button type="button" onClick={handleRemove} className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1">
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        )}
      </div>

      <div
        className="relative cursor-pointer overflow-hidden rounded-md border border-gray-200 bg-white hover:border-blue-400 transition"
        onClick={openFileDialog}
      >
        {preview?.url ? (
          <img src={preview.url} alt="Selected" className="h-48 w-full object-contain bg-gray-50" />
        ) : (
          placeholder
        )}
        <div className="absolute inset-0 flex items-end justify-end p-2 bg-gradient-to-t from-black/30 via-black/10 to-transparent opacity-0 hover:opacity-100 transition">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
            <Upload className="h-3 w-3" />
            Upload / Replace
          </span>
        </div>
      </div>

      {helpText && <p className="text-xs text-gray-500">{helpText}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {modalOpen && imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 text-gray-800">
                <CropIcon className="h-4 w-4" />
                <span className="text-sm font-semibold">Crop Image</span>
              </div>
              <button onClick={() => setModalOpen(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close cropper">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative h-[420px] bg-gray-900">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                cropShape="rect"
                showGrid
              />
            </div>
            <div className="flex flex-col gap-3 border-t bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-48 accent-blue-600"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setImageSrc(null);
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={uploadCropped}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {uploading ? 'Uploading...' : 'Save Image'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
