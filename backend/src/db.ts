import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, "..", "data");
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(join(DB_DIR, "eigenskills.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_address TEXT NOT NULL REFERENCES users(address),
    app_id TEXT,
    ecloud_name TEXT,
    name TEXT NOT NULL,
    wallet_address_eth TEXT,
    wallet_address_sol TEXT,
    instance_ip TEXT,
    status TEXT DEFAULT 'deploying',
    docker_digest TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_address);
`);

// Migration: add ecloud_name column if it doesn't exist (for existing DBs)
try {
  db.exec(`ALTER TABLE agents ADD COLUMN ecloud_name TEXT`);
} catch {
  // Column already exists, ignore
}

export interface Agent {
  id: number;
  user_address: string;
  app_id: string | null;
  ecloud_name: string | null;
  name: string;
  wallet_address_eth: string | null;
  wallet_address_sol: string | null;
  instance_ip: string | null;
  status: string;
  docker_digest: string | null;
  created_at: string;
  updated_at: string;
}

export function ensureUser(address: string): void {
  db.prepare("INSERT OR IGNORE INTO users (address) VALUES (?)").run(
    address.toLowerCase()
  );
}

export function createAgent(
  userAddress: string,
  name: string
): number {
  const result = db
    .prepare(
      "INSERT INTO agents (user_address, name) VALUES (?, ?)"
    )
    .run(userAddress.toLowerCase(), name);
  return Number(result.lastInsertRowid);
}

const ALLOWED_AGENT_COLUMNS = new Set([
  "app_id",
  "ecloud_name",
  "wallet_address_eth",
  "wallet_address_sol",
  "instance_ip",
  "status",
  "docker_digest",
]);

export function updateAgent(
  id: number,
  fields: Partial<
    Pick<
      Agent,
      | "app_id"
      | "ecloud_name"
      | "wallet_address_eth"
      | "wallet_address_sol"
      | "instance_ip"
      | "status"
      | "docker_digest"
    >
  >
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      if (!ALLOWED_AGENT_COLUMNS.has(key)) {
        throw new Error(`Invalid column name: ${key}`);
      }
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values
  );
}

export function getAgentByUser(userAddress: string): Agent | undefined {
  return db
    .prepare("SELECT * FROM agents WHERE user_address = ? ORDER BY id DESC LIMIT 1")
    .get(userAddress.toLowerCase()) as Agent | undefined;
}

export function getAgentById(id: number): Agent | undefined {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as
    | Agent
    | undefined;
}

export default db;
