import type { Skill } from "./registry.js";
import { getAgentAddress, signMessage } from "./wallet.js";

const GRANT_API =
  process.env.EIGENAI_GRANT_API ?? "https://determinal-api.eigenarcade.com";
const MODEL = "gpt-oss-120b-f16";

// Cached grant credentials (message + signature + walletAddress)
let cachedGrant: {
  message: string;
  signature: string;
  walletAddress: string;
} | null = null;

/**
 * Get grant authentication credentials.
 *
 * Priority:
 * 1. User-provided grant credentials (env vars from setup)
 * 2. TEE wallet grant (fetches message and signs with agent wallet)
 *
 * The grant credentials are cached for subsequent requests.
 */
async function getGrantAuth(): Promise<{
  message: string;
  signature: string;
  walletAddress: string;
}> {
  if (cachedGrant) {
    return cachedGrant;
  }

  // Check for user-provided grant credentials first
  const userGrantMessage = process.env.EIGENAI_GRANT_MESSAGE;
  const userGrantSignature = process.env.EIGENAI_GRANT_SIGNATURE;
  const userWalletAddress = process.env.EIGENAI_WALLET_ADDRESS;

  if (userGrantMessage && userGrantSignature && userWalletAddress) {
    console.log(`Using user-provided grant for ${userWalletAddress}`);
    cachedGrant = {
      message: userGrantMessage,
      signature: userGrantSignature,
      walletAddress: userWalletAddress,
    };
    return cachedGrant;
  }

  // Fall back to TEE wallet grant
  const address = getAgentAddress();
  if (address === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "No grant credentials available: EIGENAI_GRANT_* env vars not set and TEE wallet not available (MNEMONIC not set)"
    );
  }

  console.log(`Fetching grant message for TEE wallet ${address}...`);
  const messageRes = await fetch(`${GRANT_API}/message?address=${address}`);

  if (!messageRes.ok) {
    const errorText = await messageRes.text();
    throw new Error(
      `Failed to get grant message: ${messageRes.status} ${errorText}`
    );
  }

  const { message } = await messageRes.json();
  console.log("Signing grant message with TEE wallet...");
  const signature = await signMessage(message);

  cachedGrant = { message, signature, walletAddress: address };
  console.log("TEE wallet grant authentication cached");
  return cachedGrant;
}

/**
 * Check if the wallet has an active grant with available tokens.
 * Uses user-provided wallet address if available, otherwise TEE wallet.
 */
export async function checkGrantStatus(): Promise<{
  hasGrant: boolean;
  tokenCount: number;
  walletAddress: string;
}> {
  // Use user-provided wallet if available, otherwise TEE wallet
  const address = process.env.EIGENAI_WALLET_ADDRESS ?? getAgentAddress();
  const res = await fetch(`${GRANT_API}/checkGrant?address=${address}`);
  if (!res.ok) {
    return { hasGrant: false, tokenCount: 0, walletAddress: address };
  }
  const data = await res.json();
  return {
    hasGrant: data.hasGrant ?? false,
    tokenCount: data.tokenCount ?? 0,
    walletAddress: address,
  };
}

export interface RoutingResult {
  skillIds: string[];
  signature: string;
  requestMessages: Array<{ role: string; content: string }>;
  responseChoices: Array<{ message: { role: string; content: string | null } }>;
}

export async function routeTask(
  task: string,
  availableSkills: Skill[],
  _retryCount: number = 0
): Promise<RoutingResult> {
  // Get grant authentication (user-provided or TEE wallet)
  const grant = await getGrantAuth();
  const walletAddress = grant.walletAddress;

  const skillList = availableSkills
    .map((s) => `- ${s.id}: ${s.description}`)
    .join("\n");

  const systemPrompt = `You are a skill router. Given a user's task and a list of available skills, select the best skill(s) to execute. Use the select_skills tool to return your selection.

Available skills:
${skillList}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  const body = {
    model: MODEL,
    seed: 42,
    max_tokens: 500,
    messages,
    // Grant authentication fields
    grantMessage: grant.message,
    grantSignature: grant.signature,
    walletAddress,
    // Tool calling for structured skill selection
    tools: [
      {
        type: "function" as const,
        function: {
          name: "select_skills",
          description:
            "Select one or more skills to execute for this task, in order",
          parameters: {
            type: "object",
            properties: {
              skill_ids: {
                type: "array",
                items: { type: "string" },
                description: "Ordered list of skill IDs to execute",
              },
            },
            required: ["skill_ids"],
          },
        },
      },
    ],
    tool_choice: "auto",
  };

  const response = await fetch(`${GRANT_API}/api/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // If grant is invalid or expired, clear cache and retry once
    if (response.status === 401 || response.status === 403) {
      if (_retryCount >= 1) {
        throw new Error(`EigenAI grant auth failed after retry: ${response.status} ${errorText}`);
      }
      console.warn("Grant auth failed, clearing cache and retrying...");
      cachedGrant = null;
      return routeTask(task, availableSkills, _retryCount + 1);
    }
    throw new Error(`EigenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const signature: string = data.signature ?? "";
  const choice = data.choices?.[0];

  let skillIds: string[] = [];

  if (choice?.message?.tool_calls?.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    try {
      const args = JSON.parse(toolCall.function.arguments);
      skillIds = args.skill_ids ?? [];
    } catch {
      console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
    }
  } else if (choice?.message?.content) {
    // Fallback: try to extract skill IDs from free text
    const validIds = new Set(availableSkills.map((s) => s.id));
    skillIds = Array.from(validIds).filter((id) =>
      choice.message.content.includes(id)
    );
  }

  // Validate that returned skill IDs actually exist
  const validIds = new Set(availableSkills.map((s) => s.id));
  skillIds = skillIds.filter((id) => validIds.has(id));

  if (skillIds.length === 0) {
    console.warn("EigenAI did not select any valid skills for task:", task);
  }

  return {
    skillIds,
    signature,
    requestMessages: messages,
    responseChoices: data.choices ?? [],
  };
}
