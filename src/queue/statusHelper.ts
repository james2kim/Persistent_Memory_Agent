import { getFileProcessingQueue } from './queues.js';
import type { FileProcessingJobResult, FileProcessingProgress } from './jobTypes.js';

export interface JobStatusResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: FileProcessingJobResult;
  error?: string;
  progress?: FileProcessingProgress;
}

/**
 * Get job status from BullMQ, with userId authorization check.
 */
export async function getJobStatus(jobId: string, userId: string): Promise<JobStatusResponse | null> {
  const queue = getFileProcessingQueue();
  const job = await queue.getJob(jobId);

  if (!job) return null;

  // Authorization: ensure the job belongs to this user
  if (job.data.userId !== userId) return null;

  const state = await job.getState();

  switch (state) {
    case 'completed':
      return {
        status: 'completed',
        result: job.returnvalue,
      };

    case 'failed':
      return {
        status: 'failed',
        error: job.failedReason ?? 'Unknown error',
      };

    case 'active':
      return {
        status: 'processing',
        progress: (job.progress as FileProcessingProgress) || undefined,
      };

    case 'waiting':
    case 'waiting-children':
    case 'delayed':
    case 'prioritized':
      return {
        status: 'queued',
      };

    default:
      return { status: 'queued' };
  }
}
