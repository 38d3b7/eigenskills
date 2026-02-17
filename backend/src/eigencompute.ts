import { execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const EIGENCOMPUTE_PRIVATE_KEY = process.env.EIGENCOMPUTE_PRIVATE_KEY ?? "";
const EIGENCOMPUTE_ENVIRONMENT = process.env.EIGENCOMPUTE_ENVIRONMENT ?? "sepolia";
const AGENT_IMAGE_REF = process.env.AGENT_IMAGE_REF ?? "eigenskills/agent:latest";

const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;

/**
 * Validate a string before it is interpolated into a shell command.
 * Allows only alphanumeric characters, hyphens, underscores, and dots.
 */
function validateShellInput(input: string, label: string): string {
  if (!SAFE_NAME_RE.test(input)) {
    throw new Error(
      `Invalid ${label}: must start with alphanumeric, contain only [a-zA-Z0-9_.-], and be 1-63 chars`
    );
  }
  return input;
}

export interface EnvVar {
  key: string;
  value: string;
  isPublic: boolean;
}

export interface DeployResult {
  appId: string;
  walletAddressEth: string;
  walletAddressSol: string;
  instanceIp: string;
  dockerDigest: string;
}

/**
 * Construct a .env file from user-provided env vars.
 * Appends _PUBLIC suffix for public variables.
 * Uses a private temp directory with restricted permissions.
 */
function buildEnvFile(envVars: EnvVar[]): string {
  const lines: string[] = [];

  for (const { key, value, isPublic } of envVars) {
    const envKey = isPublic && !key.endsWith("_PUBLIC") ? `${key}_PUBLIC` : key;
    lines.push(`${envKey}=${value}`);
  }

  const secureDir = mkdtempSync(join(tmpdir(), "eigenskills-"));
  chmodSync(secureDir, 0o700);
  const filepath = join(secureDir, "env");
  writeFileSync(filepath, lines.join("\n") + "\n", { mode: 0o600 });
  return filepath;
}

/**
 * Get exec options with environment variables for ecloud CLI.
 * The oclif-based ecloud CLI reads ECLOUD_PRIVATE_KEY for auth.
 */
function getExecOptions(timeoutMs: number = 60000, extraEnv: Record<string, string> = {}) {
  return {
    encoding: "utf-8" as const,
    timeout: timeoutMs,
    env: {
      ...process.env,
      ECLOUD_PRIVATE_KEY: EIGENCOMPUTE_PRIVATE_KEY,
      ...extraEnv,
    },
  };
}

/**
 * Execute a shell command with sanitized error messages.
 * Prevents private keys from leaking in error output.
 */
function execWithSanitizedErrors(
  command: string,
  options: Parameters<typeof execSync>[1]
): string {
  try {
    return execSync(command, options) as string;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const sanitized = message.replace(/--private-key\s+\S+/g, "--private-key [REDACTED]");
    throw new Error(sanitized);
  }
}

/**
 * Deploy a new agent instance to EigenCompute.
 *
 * In production, this would call the EigenCompute REST API directly.
 * For now, it shells out to the ecloud CLI.
 */
export async function deployAgent(
  name: string,
  envVars: EnvVar[]
): Promise<DeployResult> {
  const safeName = validateShellInput(name, "agent name");

  if (!EIGENCOMPUTE_PRIVATE_KEY) {
    throw new Error(
      "EIGENCOMPUTE_PRIVATE_KEY is not set. " +
      "Create backend/.env with your ecloud private key. " +
      "Get your key from: ecloud auth login"
    );
  }

  const envFilePath = buildEnvFile(envVars);

  try {
    const command = [
      "ecloud compute app deploy",
      `--image-ref ${AGENT_IMAGE_REF}`,
      `--env-file ${envFilePath}`,
      `--environment ${EIGENCOMPUTE_ENVIRONMENT}`,
      "--log-visibility public",
      "--resource-usage-monitoring enable",
      "--instance-type g1-standard-4t",
      "--skip-profile",
      `--name ${safeName}`,
    ].join(" ");

    console.log(`Deploying agent: ${safeName}`);
    console.log(`Image: ${AGENT_IMAGE_REF}`);

    const execOpts = getExecOptions(300000);
    const output = execWithSanitizedErrors(`echo N | ${command}`, execOpts);

    // Parse deployment output for app details.
    // ecloud output labels vary between versions -- try multiple patterns.
    const appIdMatch = output.match(/App ID:\s*(\S+)/i)
      ?? output.match(/\bID:\s*(0x[a-fA-F0-9]+)/i);
    const ethMatch = output.match(/EVM Address:\s*(0x[a-fA-F0-9]+)/i)
      ?? output.match(/Ethereum:\s*(0x[a-fA-F0-9]+)/i);
    const solMatch = output.match(/Solana Address:\s*(\S+)/i)
      ?? output.match(/Solana:\s*(\S+)/i);
    const ipMatch = output.match(/\bIP:\s*(\d+\.\d+\.\d+\.\d+)/i);
    const digestMatch = output.match(/Docker Digest:\s*(\S+)/i);

    return {
      appId: appIdMatch?.[1] ?? "",
      walletAddressEth: ethMatch?.[1] ?? "",
      walletAddressSol: solMatch?.[1] ?? "",
      instanceIp: ipMatch?.[1] ?? "",
      dockerDigest: digestMatch?.[1] ?? "",
    };
  } finally {
    try {
      unlinkSync(envFilePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export interface AppInfo {
  instanceIp: string;
  dockerDigest: string;
  walletAddressEth: string;
  walletAddressSol: string;
}

// Cache for getAppInfo to avoid hammering the ecloud API on repeated polls.
// Maps appId -> { data, fetchedAt }
const appInfoCache = new Map<string, { data: AppInfo; fetchedAt: number; failed?: boolean }>();
const INFO_CACHE_TTL_MS = 30_000;
const INFO_FAIL_COOLDOWN_MS = 60_000;

/**
 * Fetch live app details from EigenCompute via `ecloud compute app info`.
 *
 * The deploy output does not always include Instance IP — it only becomes
 * available after provisioning completes, so we query it separately.
 *
 * Results are cached to avoid 429 rate-limit errors from rapid polling.
 */
export async function getAppInfo(appId: string): Promise<AppInfo> {
  const safeAppId = validateShellInput(appId, "app ID");
  const cached = appInfoCache.get(safeAppId);
  if (cached) {
    const age = Date.now() - cached.fetchedAt;
    if (!cached.failed && age < INFO_CACHE_TTL_MS) return cached.data;
    if (cached.failed && age < INFO_FAIL_COOLDOWN_MS) throw new Error("Skipping app info fetch (cooldown after previous failure)");
  }

  try {
    const command = [
      "ecloud compute app info",
      safeAppId,
      `--environment ${EIGENCOMPUTE_ENVIRONMENT}`,
    ].join(" ");

    const output = execWithSanitizedErrors(command, getExecOptions(30000));

    // ecloud app info output format (actual):
    //   IP:             34.138.252.98
    //   EVM Address:    0xecf5...  (path: m/44'/60'/0'/0/0)
    //   Solana Address: 6kcV4...   (path: m/44'/501'/0'/0')
    //   Docker Digest:  sha256:... (may not always appear)
    const ipMatch = output.match(/\bIP:\s*(\d+\.\d+\.\d+\.\d+)/i);
    const digestMatch = output.match(/Docker Digest:\s*(\S+)/i);
    const ethMatch = output.match(/EVM Address:\s*(0x[a-fA-F0-9]+)/i);
    const solMatch = output.match(/Solana Address:\s*(\S+)/i);

    const data: AppInfo = {
      instanceIp: ipMatch?.[1] ?? "",
      dockerDigest: digestMatch?.[1] ?? "",
      walletAddressEth: ethMatch?.[1] ?? "",
      walletAddressSol: solMatch?.[1] ?? "",
    };

    appInfoCache.set(safeAppId, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    appInfoCache.set(safeAppId, {
      data: { instanceIp: "", dockerDigest: "", walletAddressEth: "", walletAddressSol: "" },
      fetchedAt: Date.now(),
      failed: true,
    });
    throw err;
  }
}

/**
 * Upgrade an existing agent's env vars.
 */
export async function upgradeAgent(
  appId: string,
  envVars: EnvVar[]
): Promise<void> {
  const safeAppId = validateShellInput(appId, "app ID");
  const envFilePath = buildEnvFile(envVars);

  try {
    const command = [
      "ecloud compute app upgrade",
      safeAppId,
      `--env-file ${envFilePath}`,
      `--environment ${EIGENCOMPUTE_ENVIRONMENT}`,
      `--image-ref ${AGENT_IMAGE_REF}`,
    ].join(" ");

    execWithSanitizedErrors(`echo N | ${command}`, getExecOptions(300000));
  } finally {
    try {
      unlinkSync(envFilePath);
    } catch {
      // ignore
    }
  }
}

/**
 * Stop an agent (preserves wallet + IP).
 */
export async function stopAgent(appId: string): Promise<void> {
  const safeAppId = validateShellInput(appId, "app ID");
  const command = [
    "ecloud compute app stop",
    safeAppId,
    `--environment ${EIGENCOMPUTE_ENVIRONMENT}`,
  ].join(" ");

  execWithSanitizedErrors(`echo N | ${command}`, getExecOptions(60000));
}

/**
 * Start a stopped agent.
 */
export async function startAgent(appId: string): Promise<void> {
  const safeAppId = validateShellInput(appId, "app ID");
  const command = [
    "ecloud compute app start",
    safeAppId,
    `--environment ${EIGENCOMPUTE_ENVIRONMENT}`,
  ].join(" ");

  execWithSanitizedErrors(`echo N | ${command}`, getExecOptions(60000));
}

/**
 * Terminate an agent (IRREVERSIBLE — wallet destroyed).
 */
export async function terminateAgent(appId: string): Promise<void> {
  const safeAppId = validateShellInput(appId, "app ID");
  const command = [
    "ecloud compute app terminate",
    safeAppId,
    `--environment ${EIGENCOMPUTE_ENVIRONMENT}`,
  ].join(" ");

  execWithSanitizedErrors(`echo N | ${command}`, getExecOptions(60000));
}
