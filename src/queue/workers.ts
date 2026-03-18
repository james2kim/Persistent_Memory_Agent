import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { getConnectionConfig } from './connection.js';
import { FILE_PROCESSING_QUEUE } from './queues.js';
import { processGcsFile } from '../ingest/processGcsFile.js';
import type { FileProcessingJobData, FileProcessingJobResult, FileProcessingProgress } from './jobTypes.js';

let worker: Worker | null = null;

export function startFileProcessingWorker(): Worker<FileProcessingJobData, FileProcessingJobResult> {
  if (worker) return worker as Worker<FileProcessingJobData, FileProcessingJobResult>;

  worker = new Worker(
    FILE_PROCESSING_QUEUE,
    async (job: Job<FileProcessingJobData, FileProcessingJobResult>) => {
      console.log(`[worker:file-processing] Processing job ${job.id} — ${job.data.filename}`);

      const result = await processGcsFile({
        userId: job.data.userId,
        gcsPath: job.data.gcsPath,
        filename: job.data.filename,
        onProgress: (stage, detail) => {
          const progress: FileProcessingProgress = { stage, detail };
          job.updateProgress(progress);
        },
      });

      return result;
    },
    {
      connection: getConnectionConfig(),
      concurrency: 2,
      lockDuration: 300_000, // 5 minutes for large files
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker:file-processing] Job ${job?.id} completed — ${job?.returnvalue?.filename}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker:file-processing] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[worker:file-processing] Worker error:', err.message);
  });

  return worker as Worker<FileProcessingJobData, FileProcessingJobResult>;
}

export async function stopFileProcessingWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
