import { readFileSync } from 'node:fs';
import snowflake, {
  type Binds,
  type Connection,
  type ConnectionOptions,
} from 'snowflake-sdk';

// Snowflake SDK is chatty by default; dial it down.
snowflake.configure({ logLevel: 'WARN' });

type GlobalWithSnowflake = typeof globalThis & {
  __snowflakeConnection?: Promise<Connection>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function loadPrivateKey(): string {
  const inline = process.env.SNOWFLAKE_PRIVATE_KEY;
  if (inline) return inline.replace(/\\n/g, '\n');

  const path = process.env.SNOWFLAKE_PRIVATE_KEY_PATH;
  if (!path) {
    throw new Error(
      'Snowflake key-pair auth: set SNOWFLAKE_PRIVATE_KEY (inline PEM) or SNOWFLAKE_PRIVATE_KEY_PATH (file path).',
    );
  }
  return readFileSync(path, 'utf8');
}

async function createConnection(): Promise<Connection> {
  const options: ConnectionOptions = {
    account: requiredEnv('SNOWFLAKE_ACCOUNT'),
    username: requiredEnv('SNOWFLAKE_USERNAME'),
    authenticator: 'SNOWFLAKE_JWT',
    privateKey: loadPrivateKey(),
    privateKeyPass: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    role: process.env.SNOWFLAKE_ROLE,
  };

  const conn = snowflake.createConnection(options);
  await new Promise<void>((resolve, reject) => {
    conn.connect((err) => (err ? reject(err) : resolve()));
  });
  return conn;
}

function getConnection(): Promise<Connection> {
  const cache = globalThis as GlobalWithSnowflake;
  if (!cache.__snowflakeConnection) {
    cache.__snowflakeConnection = createConnection().catch((err) => {
      // Don't cache a broken connection — next call should retry.
      delete cache.__snowflakeConnection;
      throw err;
    });
  }
  return cache.__snowflakeConnection;
}

export async function execute<T = Record<string, unknown>>(
  sqlText: string,
  binds?: Binds,
): Promise<T[]> {
  const conn = await getConnection();
  return new Promise<T[]>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) reject(err);
        else resolve((rows ?? []) as T[]);
      },
    });
  });
}
