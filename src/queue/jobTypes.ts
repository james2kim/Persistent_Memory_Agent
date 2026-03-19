export interface FileProcessingJobData {
  userId: string;
  gcsPath: string;
  filename: string;
  fileId: string;
  enqueuedAt: string;
}

export interface FileProcessingJobResult {
  documentId: string;
  chunkCount: number;
  filename: string;
  title: string;
}

export interface FileProcessingProgress {
  stage: 'downloading' | 'extracting_text' | 'embedding' | 'summarizing' | 'cleaning_up' | 'completed';
  detail?: string;
}
