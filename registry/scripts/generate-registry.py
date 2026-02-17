#!/usr/bin/env python3
"""
Scans registry/skills/ for valid SKILL.md files, validates frontmatter,
computes content hashes, and generates registry/registry.json.
"""

import hashlib
import json
import os
import sys

import yaml

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "..", "skills")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "registry.json")

REQUIRED_FIELDS = ["name", "description", "version", "author"]


def compute_content_hash(skill_dir: str) -> str:
    """Compute SHA-256 hash of all files in a skill directory."""
    hasher = hashlib.sha256()

    for root, _dirs, files in sorted(os.walk(skill_dir)):
        for filename in sorted(files):
            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, skill_dir)
            hasher.update(rel_path.encode("utf-8"))
            with open(filepath, "rb") as f:
                hasher.update(f.read())

    return f"sha256:{hasher.hexdigest()}"


def parse_skill_md(skill_dir: str):
    """Parse SKILL.md frontmatter from a skill directory."""
    skill_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.exists(skill_md):
        print(f"  WARNING: No SKILL.md found in {skill_dir}", file=sys.stderr)
        return None

    with open(skill_md, "r") as f:
        content = f.read()

    if not content.startswith("---"):
        print(f"  ERROR: SKILL.md missing frontmatter in {skill_dir}", file=sys.stderr)
        return None

    parts = content.split("---", 2)
    if len(parts) < 3:
        print(f"  ERROR: Invalid frontmatter format in {skill_dir}", file=sys.stderr)
        return None

    try:
        frontmatter = yaml.safe_load(parts[1])
    except yaml.YAMLError as e:
        print(f"  ERROR: YAML parse error in {skill_dir}: {e}", file=sys.stderr)
        return None

    if not isinstance(frontmatter, dict):
        print(f"  ERROR: Frontmatter is not a dict in {skill_dir}", file=sys.stderr)
        return None

    for field in REQUIRED_FIELDS:
        if field not in frontmatter:
            print(
                f"  ERROR: Missing required field '{field}' in {skill_dir}",
                file=sys.stderr,
            )
            return None

    return frontmatter


def main():
    skills = []
    errors = 0

    skills_dir = os.path.abspath(SKILLS_DIR)
    if not os.path.isdir(skills_dir):
        print(f"Skills directory not found: {skills_dir}", file=sys.stderr)
        sys.exit(1)

    for entry in sorted(os.listdir(skills_dir)):
        skill_dir = os.path.join(skills_dir, entry)
        if not os.path.isdir(skill_dir):
            continue

        print(f"Processing: {entry}")
        frontmatter = parse_skill_md(skill_dir)
        if frontmatter is None:
            errors += 1
            continue

        content_hash = compute_content_hash(skill_dir)
        requires_env = frontmatter.get("requires_env", [])
        has_execution = "execution" in frontmatter

        skills.append(
            {
                "id": frontmatter["name"],
                "description": frontmatter["description"].strip(),
                "version": frontmatter["version"],
                "author": frontmatter["author"],
                "contentHash": content_hash,
                "requiresEnv": requires_env if requires_env else [],
                "hasExecutionManifest": has_execution,
            }
        )

    if errors > 0:
        print(f"\n{errors} skill(s) failed validation", file=sys.stderr)
        sys.exit(1)

    registry = {"skills": skills}
    output_path = os.path.abspath(OUTPUT_FILE)

    with open(output_path, "w") as f:
        json.dump(registry, f, indent=2)
        f.write("\n")

    print(f"\nGenerated {output_path} with {len(skills)} skill(s)")


if __name__ == "__main__":
    main()
