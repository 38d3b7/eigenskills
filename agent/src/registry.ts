export interface Skill {
  id: string;
  description: string;
  version: string;
  author: string;
  contentHash: string;
  requiresEnv: string[];
  hasExecutionManifest: boolean;
}

interface Registry {
  skills: Skill[];
}

let cachedRegistry: Registry | null = null;
let lastFetch = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const REGISTRY_URL =
  process.env.SKILL_REGISTRY_URL ??
  "https://raw.githubusercontent.com/38d3b7/eigenskills/main/registry/registry.json";

export async function fetchRegistry(): Promise<Registry> {
  const now = Date.now();
  if (cachedRegistry && now - lastFetch < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  console.log(`Fetching skill registry from ${REGISTRY_URL}`);
  const response = await fetch(REGISTRY_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch registry: ${response.status} ${response.statusText}`);
  }

  cachedRegistry = (await response.json()) as Registry;
  lastFetch = now;
  console.log(`Registry loaded: ${cachedRegistry.skills.length} skill(s)`);
  return cachedRegistry;
}

/**
 * Returns skills filtered to those the user can actually run,
 * based on which env vars are available in the current environment.
 */
export function getAvailableSkills(skills: Skill[]): Skill[] {
  return skills.filter((skill) => {
    if (skill.requiresEnv.length === 0) return true;
    return skill.requiresEnv.every((envVar) => !!process.env[envVar]);
  });
}

export async function listSkills(): Promise<Skill[]> {
  const registry = await fetchRegistry();
  return getAvailableSkills(registry.skills);
}

export async function getSkill(id: string): Promise<Skill | undefined> {
  const registry = await fetchRegistry();
  return registry.skills.find((s) => s.id === id);
}
