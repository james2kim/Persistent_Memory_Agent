import { useRef } from 'react';

interface FileUploadProps {
  onUpload: (file: File) => void;
  disabled: boolean;
}

export function FileUpload({ onUpload, disabled }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    onUpload(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="upload-area">
      <label>Upload Document (PDF, Word, Markdown, Text — up to 100 MB):</label>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.md,.txt"
        disabled={disabled}
      />
      <button
        className="secondary"
        onClick={handleUpload}
        disabled={disabled}
      >
        Upload
      </button>
    </div>
  );
}
