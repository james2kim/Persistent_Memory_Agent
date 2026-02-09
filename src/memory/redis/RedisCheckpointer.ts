import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointTuple,
  CheckpointMetadata,
} from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { PendingWrite } from '@langchain/langgraph-checkpoint';
import type { RedisClientType } from 'redis';
import { RedisSessionStoreClass } from './RedisSessionStore';
import type { SessionState } from '../../schemas/types';

export class RedisCheckpointer extends BaseCheckpointSaver {
  private store: RedisSessionStoreClass;
  private client: RedisClientType;
  private keyPrefix: string;

  constructor(store: RedisSessionStoreClass, keyPrefix = 'checkpoint:') {
    super();
    this.store = store;
    this.client = store.getClient();
    this.keyPrefix = keyPrefix;
  }

  private getThreadId(config: RunnableConfig): string {
    return (config.configurable?.thread_id as string) ?? 'default';
  }

  private key(threadId: string, checkpointId?: string): string {
    if (checkpointId) {
      return `${this.keyPrefix}${threadId}:${checkpointId}`;
    }
    return `${this.keyPrefix}${threadId}:latest`;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = this.getThreadId(config);
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;

    const raw = await this.client.get(this.key(threadId, checkpointId));
    if (!raw) return undefined;

    const data = JSON.parse(raw);
    return {
      config,
      checkpoint: data.checkpoint,
      metadata: data.metadata,
      parentConfig: data.parentConfig,
    };
  }

  async *list(
    config: RunnableConfig,
    _options?: { limit?: number }
  ): AsyncGenerator<CheckpointTuple> {
    // Only return latest checkpoint since we don't store history
    const tuple = await this.getTuple(config);
    if (tuple) {
      yield tuple;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const threadId = this.getThreadId(config);
    const data = { checkpoint, metadata, parentConfig: config };

    // Only store latest checkpoint
    await this.client.set(this.key(threadId), JSON.stringify(data));

    // Sync to SessionStore - extract state from channel_values
    const channelValues = checkpoint.channel_values as Record<string, unknown>;
    const sessionState: SessionState = {
      messages: (channelValues.messages as SessionState['messages']) ?? [],
      taskState: (channelValues.taskState as SessionState['taskState']) ?? { attempts: 0 },
      updatedAt: new Date().toISOString(),
      summary: (channelValues.summary as string) ?? '',
      tool_calls: channelValues.tool_calls as SessionState['tool_calls'],
      response: channelValues.response as SessionState['response'],
      sessionId: (channelValues.sessionId as string) ?? threadId,
      userId: (channelValues.userId as string) ?? '',
    };
    await this.store.writeSession(threadId, sessionState);

    return { ...config, configurable: { ...config.configurable, checkpoint_id: checkpoint.id } };
  }

  async putWrites(
    _config: RunnableConfig,
    _writes: PendingWrite[],
    _taskId: string
  ): Promise<void> {
    // No-op: we don't need pending write recovery, only latest state matters
  }

  async deleteThread(threadId: string): Promise<void> {
    const pattern = `${this.keyPrefix}${threadId}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}
