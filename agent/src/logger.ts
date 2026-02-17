import { signMessage, getAgentAddress } from "./wallet.js";

export interface LogEntry {
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
  agentAddress: string;
  signature: string;
}

const log: LogEntry[] = [];

export async function addLogEntry(
  type: string,
  data: Record<string, unknown>
): Promise<LogEntry> {
  const timestamp = new Date().toISOString();
  const agentAddress = getAgentAddress();

  const payload = JSON.stringify({ timestamp, type, data, agentAddress });
  const signature = await signMessage(payload);

  const entry: LogEntry = {
    timestamp,
    type,
    data,
    agentAddress,
    signature,
  };

  log.push(entry);

  // Keep log from growing unbounded (last 1000 entries)
  if (log.length > 1000) {
    log.splice(0, log.length - 1000);
  }

  return entry;
}

export function getHistory(): LogEntry[] {
  return [...log];
}
