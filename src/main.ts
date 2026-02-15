import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import crypto from 'crypto';
import { RedisSessionStore } from './stores/RedisSessionStore';
import { RedisCheckpointer } from './memory/RedisCheckpointer';
import { getUserId } from './config';
import { buildWorkflow } from './agent/graph';

const getFormattedAnswerToUserinput = async (
  userQuery: string,
  app: ReturnType<typeof buildWorkflow>,
  sessionId: string
) => {
  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: userQuery,
    createdAt: new Date().toISOString(),
  };

  try {
    const result = await app.invoke(
      {
        messages: [userMessage],
        userQuery: userQuery,
      },
      { configurable: { thread_id: sessionId } }
    );
    return result;
  } catch (err) {
    console.error('Error running agent:', err);
    throw err;
  }
};

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Persistent Memory Study Agent        ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Connecting to Redis...');
  await RedisSessionStore.connect();
  const checkpointer = new RedisCheckpointer(RedisSessionStore);
  const userId = getUserId();
  const { sessionId } = await RedisSessionStore.getOrCreateSession(userId);
  const app = buildWorkflow(checkpointer);

  console.log(`✓ Session initialized`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Session ID: ${sessionId}\n`);
  console.log('Type your message and press Enter. Type "exit" or "quit" to stop.\n');

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('You: ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('\nGoodbye! Session saved.\n');
        await RedisSessionStore.disconnect();
        rl.close();
        process.exit(0);
      }

      try {
        console.log('\n[Processing...]\n');
        const result = await getFormattedAnswerToUserinput(trimmed, app, sessionId);
        console.log('Agent:', result?.response ?? '[No response generated]');
        console.log('');
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
