const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3002";

export interface EnvVar {
  key: string;
  value: string;
  isPublic: boolean;
}

export interface AgentInfo {
  name: string;
  status: string;
  appId: string | null;
  walletAddressEth: string | null;
  walletAddressSol: string | null;
  instanceIp: string | null;
  dockerDigest: string | null;
  createdAt: string;
}

export interface TaskResult {
  result: string;
  skillsUsed: string[];
  routingSignature: string;
  agentSignature: string;
  agentAddress: string;
}

function getHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function verifyAuth(
  message: string,
  signature: string
): Promise<{ address: string; token: string; hasAgent: boolean }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!res.ok) throw new Error("Auth verification failed");
  return res.json();
}

export async function deployAgent(
  token: string,
  name: string,
  envVars: EnvVar[]
): Promise<{ agentId: number; appId: string; walletAddress: string; instanceIp: string }> {
  const res = await fetch(`${BACKEND_URL}/api/agents/deploy`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({ name, envVars }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Deploy failed");
  }
  return res.json();
}

export async function upgradeAgent(
  token: string,
  envVars: EnvVar[]
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/agents/upgrade`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({ envVars }),
  });
  if (!res.ok) throw new Error("Upgrade failed");
}

export async function stopAgent(token: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/agents/stop`, {
    method: "POST",
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error("Stop failed");
}

export async function startAgent(token: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/agents/start`, {
    method: "POST",
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error("Start failed");
}

export async function terminateAgent(token: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/agents/terminate`, {
    method: "POST",
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error("Terminate failed");
}

export async function getAgentInfo(
  token: string
): Promise<AgentInfo | null> {
  const res = await fetch(`${BACKEND_URL}/api/agents/info`, {
    headers: getHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to get agent info");
  return res.json();
}

export async function submitTask(
  token: string,
  task: string
): Promise<TaskResult> {
  const res = await fetch(`${BACKEND_URL}/api/agents/task`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({ task }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Task submission failed");
  }
  return res.json();
}
