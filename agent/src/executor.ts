import { execSync } from "child_process";
import { readFileSync, mkdirSync, existsSync, cpSync } from "fs";
import { join, resolve } from "path";
import matter from "gray-matter";

const SKILLS_CACHE_DIR = "/tmp/eigenskills";

// Local registry path for development (set SKILL_REGISTRY_LOCAL=/path/to/registry/skills)
const LOCAL_REGISTRY_PATH = process.env.SKILL_REGISTRY_LOCAL;

// Remote registry for production
const REGISTRY_REPO =
  process.env.SKILL_REGISTRY_REPO ??
  "https://github.com/38d3b7/eigenskills.git";

const SAFE_SKILL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

function validateSkillId(id: string): string {
  if (!SAFE_SKILL_ID_RE.test(id)) {
    throw new Error(
      `Invalid skill ID "${id}": must be alphanumeric with hyphens/underscores, 1-63 chars`
    );
  }
  return id;
}

export interface ExecutionStep {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecutionResult {
  output: string;
  steps: ExecutionStep[];
  skillId: string;
}

/**
 * Fetch a skill folder from local registry or remote git repo.
 * In development, set SKILL_REGISTRY_LOCAL to use local files.
 * In production, uses git sparse-checkout to pull only the specific skill.
 */
function fetchSkillFolder(skillId: string): string {
  validateSkillId(skillId);
  const skillDir = join(SKILLS_CACHE_DIR, skillId);

  // Return cached skill if already fetched
  if (existsSync(skillDir)) {
    return skillDir;
  }

  mkdirSync(SKILLS_CACHE_DIR, { recursive: true });

  // Development mode: copy from local registry
  if (LOCAL_REGISTRY_PATH) {
    const localSkillPath = resolve(LOCAL_REGISTRY_PATH, skillId);
    if (!existsSync(localSkillPath)) {
      throw new Error(
        `Skill "${skillId}" not found in local registry at ${localSkillPath}`
      );
    }
    cpSync(localSkillPath, skillDir, { recursive: true });
    return skillDir;
  }

  // Production mode: clone from git
  const repoDir = join(SKILLS_CACHE_DIR, "_repo");
  if (!existsSync(repoDir)) {
    execSync(
      `git clone --depth 1 --filter=blob:none --sparse "${REGISTRY_REPO}" "${repoDir}"`,
      { stdio: "pipe" }
    );
  }

  execSync(
    `cd "${repoDir}" && git sparse-checkout add "registry/skills/${skillId}"`,
    { stdio: "pipe" }
  );

  const sourcePath = join(repoDir, "registry", "skills", skillId);
  if (!existsSync(sourcePath)) {
    throw new Error(`Skill folder not found after checkout: ${skillId}`);
  }

  cpSync(sourcePath, skillDir, { recursive: true });
  return skillDir;
}

/**
 * Build a sandboxed environment containing only the vars the skill declared.
 */
function buildSandboxedEnv(requiresEnv: string[]): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME ?? "/root",
    LANG: "en_US.UTF-8",
  };

  for (const key of requiresEnv) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  return env;
}

/**
 * Execute a skill with sandboxed environment variables.
 */
export async function executeSkill(
  skillId: string,
  userInput: string
): Promise<ExecutionResult> {
  const skillDir = fetchSkillFolder(skillId);
  const skillMdPath = join(skillDir, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found for ${skillId}`);
  }

  const skillMdContent = readFileSync(skillMdPath, "utf-8");
  const { data: frontmatter } = matter(skillMdContent);

  const requiresEnv: string[] = frontmatter.requires_env ?? [];
  const sandboxedEnv = buildSandboxedEnv(requiresEnv);
  const executionSteps: Array<{ run: string }> = frontmatter.execution ?? [];

  const steps: ExecutionStep[] = [];
  let lastOutput = "";

  if (executionSteps.length > 0) {
    for (const step of executionSteps) {
      const command = step.run
        .replace(/\{\{input\}\}/g, JSON.stringify(userInput))
        .replace(/\{\{output\}\}/g, "/tmp/skill-output.txt");

      const result = runCommand(command, skillDir, sandboxedEnv);
      steps.push(result);
      lastOutput = result.stdout;
    }
  } else {
    // No execution manifest — run as a simple echo for now
    // In production, this would send to EigenAI to plan commands
    const result = runCommand(
      `echo "Skill ${skillId} has no execution manifest. Input: ${JSON.stringify(userInput)}"`,
      skillDir,
      sandboxedEnv
    );
    steps.push(result);
    lastOutput = result.stdout;
  }

  return {
    output: lastOutput.trim(),
    steps,
    skillId,
  };
}

function runCommand(
  command: string,
  cwd: string,
  env: Record<string, string>
): ExecutionStep {
  try {
    const stdout = execSync(command, {
      cwd,
      env,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
    });

    return { command, stdout: stdout ?? "", stderr: "", exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    return {
      command,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}
