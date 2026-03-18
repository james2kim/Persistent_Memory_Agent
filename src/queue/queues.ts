import { Queue } from 'bullmq';
import { getConnectionConfig } from './connection.js';
import type { FileProcessingJobData, FileProcessingJobResult } from './jobTypes.js';

export const FILE_PROCESSING_QUEUE = 'file-processing';

let queue: Queue | null = null;

export function getFileProcessingQueue(): Queue<FileProcessingJobData, FileProcessingJobResult> {
  if (queue) return queue as Queue<FileProcessingJobData, FileProcessingJobResult>;

  queue = new Queue(FILE_PROCESSING_QUEUE, {
    connection: getConnectionConfig(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 86_400 },   // 24 hours
      removeOnFail: { age: 604_800 },      // 7 days
    },
  });

  return queue as Queue<FileProcessingJobData, FileProcessingJobResult>;
}
