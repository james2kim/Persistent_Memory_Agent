import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CONFIG_PATH = path.join(process.env.HOME ?? '.', '.memory-agent.json');

interface Config {
  userId: string;
}

export function getUserId(): string {
  // Allow override for testing/evals
  if (process.env.EVAL_USER_ID) {
    return process.env.EVAL_USER_ID;
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const config: Config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.userId;
  }

  const userId = crypto.randomUUID();
  saveConfig({ userId });
  return userId;
}

export function getConfig(): Config {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }

  const config: Config = { userId: crypto.randomUUID() };
  saveConfig(config);
  return config;
}

function saveConfig(config: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
