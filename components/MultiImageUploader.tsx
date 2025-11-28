import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { MediaImage } from '../types';

interface MultiImageUploaderProps {
  label?: string;
  value?: MediaImage[];
  onChange: (images: MediaImage[]) => void;
  uploadFolder?: string;
  helpText?: string;
}

const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({
  label = 'Images',
  value = [],
  onChange,
  uploadFolder,
  helpText,
}) => {
  const [images, setImages] = useState<MediaImage[]>(value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setImages(value || []);
  }, [value]);

  const openFileDialog = () => fileInputRef.current?.click();

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: MediaImage[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('image', file);
        if (uploadFolder) formData.append('folder', uploadFolder);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (!response.ok || !data?.url) {
          throw new Error(data?.error || 'Upload failed');
        }
        uploaded.push({ url: data.url, publicId: data.publicId });
      }
      const next = [...images, ...uploaded];
      setImages(next);
      onChange(next);
    } catch (e: any) {
      setError(e?.message || 'Unable to upload image(s)');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={openFileDialog}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          disabled={uploading}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? 'Uploading...' : 'Add images'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          uploadFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {helpText && <p className="text-xs text-gray-500">{helpText}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.length === 0 && (
          <div className="col-span-full">
            <div className="flex flex-col items-center justify-center h-32 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500">
              <ImageIcon className="h-8 w-8 mb-2" />
              <p className="text-sm font-medium">No images yet</p>
              <p className="text-xs text-gray-400">Add one or more images</p>
            </div>
          </div>
        )}
        {images.map((img, idx) => (
          <div key={`${img.url}-${idx}`} className="relative group">
            <img src={img.url} alt={`Upload ${idx + 1}`} className="h-32 w-full object-cover rounded-md border border-gray-200" />
            <button
              type="button"
              onClick={() => removeImage(idx)}
              className="absolute top-2 right-2 rounded-full bg-white/90 p-1 text-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition"
              aria-label="Remove image"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiImageUploader;
