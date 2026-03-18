import { getFileProcessingQueue } from './queues.js';
import { startFileProcessingWorker, stopFileProcessingWorker } from './workers.js';

export { getFileProcessingQueue } from './queues.js';
export { getJobStatus } from './statusHelper.js';
export type { JobStatusResponse } from './statusHelper.js';
export type { FileProcessingJobData, FileProcessingJobResult, FileProcessingProgress } from './jobTypes.js';

export async function initializeQueues(): Promise<void> {
  const queue = getFileProcessingQueue();
  await queue.waitUntilReady();
  console.log('[queue] File processing queue ready');

  const worker = startFileProcessingWorker();
  await worker.waitUntilReady();
  console.log('[queue] File processing worker ready');
}

export async function shutdownQueues(): Promise<void> {
  console.log('[queue] Shutting down...');
  await stopFileProcessingWorker();

  const queue = getFileProcessingQueue();
  await queue.close();

  console.log('[queue] Shutdown complete');
}
