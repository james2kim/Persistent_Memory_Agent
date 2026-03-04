import knex, { Knex } from 'knex';

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (isProduction && fallback && value === fallback) {
    throw new Error(`${name} must be set explicitly in production (cannot use default)`);
  }
  return value;
}

const dbConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: requireEnv('DB_HOST', 'localhost'),
    port: Number(requireEnv('DB_PORT', '5432')),
    user: requireEnv('DB_USER', 'postgres'),
    password: requireEnv('DB_PASSWORD', 'postgres'),
    database: requireEnv('DB_NAME', 'ragdb'),
    ...(isProduction && { ssl: { rejectUnauthorized: true } }),
  },
  pool: { min: 0, max: 10 },
};

export const db = knex(dbConfig);
