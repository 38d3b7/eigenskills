# EigenSkills

A verifiable agent platform built on EigenCompute. Users deploy their own AI agent into a Trusted Execution Environment, configure encrypted API keys, and interact with a curated skill registry — all with cryptographic proof.

## Project Structure

```
eigenskills2/
├── agent/                  # Agent container (deployed per-user into TEE)
│   ├── src/
│   │   ├── index.ts        # Express HTTP server
│   │   ├── wallet.ts       # TEE wallet (viem)
│   │   ├── router.ts       # EigenAI skill routing (grant auth + tool calling)
│   │   ├── executor.ts     # Sandboxed skill execution
│   │   ├── registry.ts     # Skill registry client
│   │   └── logger.ts       # Signed execution log
│   ├── Dockerfile
│   └── package.json
│
├── backend/                # Orchestration backend
│   ├── src/
│   │   ├── index.ts        # Express server + API routes
│   │   ├── auth.ts         # SIWE authentication
│   │   ├── db.ts           # SQLite database (user-agent mapping)
│   │   └── eigencompute.ts # EigenCompute API client
│   └── package.json
│
├── frontend/               # Next.js web app
│   ├── src/
│   │   ├── app/            # App router pages
│   │   ├── components/     # ConnectWallet, AgentSetup, Dashboard
│   │   └── lib/            # API client, wallet helpers
│   └── package.json
│
├── registry/               # Skill registry (https://github.com/38d3b7/eigenskills)
│   ├── skills/             # Curated skill folders (SKILL.md + scripts)
│   ├── registry.json       # Auto-generated index
│   ├── scripts/            # Registry generator
│   └── .github/workflows/  # GitHub Action for index generation
│
└── docs/                   # Documentation
    ├── eigenskills-build-plan.md
    ├── eigenai-reference.md
    └── eigencompute-reference.md
```

## Development Setup (EigenCompute)

Before deploying agents to EigenCompute, complete these one-time setup steps.

### 1. Install the ecloud CLI

```bash
# macOS
brew install layr-labs/tap/ecloud

# Or download from https://github.com/layr-labs/eigenx-cli/releases
```

### 2. Authenticate

```bash
ecloud auth login
```

### 3. Subscribe to billing

```bash
ecloud billing subscribe
# Opens payment portal — new customers get $100 free credit
```

### 4. Fund your wallet with Sepolia ETH

EigenCompute deployment transactions happen on **Ethereum Sepolia** (not Base Sepolia).

```bash
# Get your ecloud wallet address
ecloud auth whoami

# Visit a Sepolia faucet and request ETH:
# - https://sepoliafaucet.com
# - https://www.alchemy.com/faucets/ethereum-sepolia
# - https://faucet.quicknode.com/ethereum/sepolia
```

### 5. Build and push the agent Docker image

EigenCompute pulls from Docker Hub, so you must push the agent image before deploying.

```bash
# Login to Docker Hub
docker login

# Build for linux/amd64 (required for TEE)
cd agent
docker build --platform linux/amd64 -t YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest .

# Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest
```

Then update `backend/.env`:

```bash
AGENT_IMAGE_REF=YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest
```

### 6. Set environment (optional)

```bash
# Default is sepolia (testnet)
export ECLOUD_ENV=sepolia

# For production (requires mainnet ETH)
export ECLOUD_ENV=mainnet-alpha
```

### Chains Reference

| Environment | Chain | Use |
|-------------|-------|-----|
| `sepolia` | Ethereum Sepolia (chain ID 11155111) | Development and testing |
| `mainnet-alpha` | Ethereum Mainnet (chain ID 1) | Production |

### EigenAI Authentication

The agent automatically authenticates to EigenAI using **grant-based wallet signature**. No API key is required — the agent uses its TEE-derived wallet to sign a grant message.

- **Grant API:** `https://determinal-api.eigenarcade.com`
- See [EigenAI Reference](eigenai-reference.md) for details on the grant auth flow

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- npm
- Python 3 (for skills)
- MetaMask browser extension (for frontend)

### Agent (local dev)

```bash
cd agent
npm install
npm run dev
# Runs on http://localhost:3000
```

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
# Runs on http://localhost:3002
```

Configure `backend/.env`:

```bash
# Your ecloud wallet private key (from: ecloud auth whoami)
EIGENCOMPUTE_PRIVATE_KEY=your_private_key_here

# Docker image pushed to Docker Hub
AGENT_IMAGE_REF=YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest

# Environment
EIGENCOMPUTE_ENVIRONMENT=sepolia
FRONTEND_URL=http://localhost:3000
PORT=3002
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

## Agent Lifecycle

Agents go through these states:

| State | Description |
|-------|-------------|
| `deploying` | Agent is being provisioned on EigenCompute |
| `running` | Agent is active and accepting tasks |
| `stopped` | Agent is paused but can be restarted (same wallet) |
| `terminated` | Agent is destroyed — wallet and keys are lost forever |

### Updating Agent Code

After changing anything in `agent/`, you must rebuild and redeploy:

```bash
# 1. Rebuild the Docker image
cd agent
docker build --platform linux/amd64 -t YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest .

# 2. Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest

# 3. Terminate old agent (from Dashboard UI)
# 4. Deploy new agent (picks up the new image)
```

**Important:** Each new agent gets a **new wallet address**. You must activate the EigenAI grant for the new wallet at https://eigenarcade.com before the agent can use EigenAI.

### Why Terminate and Redeploy?

EigenCompute does not support in-place image updates. The only way to deploy new code is:
1. Terminate the old agent
2. Deploy a fresh agent with the updated image

The new agent will have a different wallet address, so any funds in the old wallet will be lost. Always withdraw funds before terminating.

## Troubleshooting

### "fetch failed" or connection refused

The agent container crashed or is unreachable. Common causes:
- Agent code threw an error during startup
- Skill execution failed (e.g., git clone to wrong repo URL)
- Network issues with EigenCompute instance

**Fix:** Check the agent logs, rebuild the Docker image with fixes, and redeploy.

### Old code still running after changes

You changed `agent/` code but the deployed agent hasn't picked it up.

**Fix:** You must rebuild and push the Docker image, then terminate and redeploy:
```bash
cd agent
docker build --platform linux/amd64 -t YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest .
docker push YOUR_DOCKERHUB_USERNAME/eigenskills-agent:latest
# Then terminate + deploy from the Dashboard
```

### Terminated agent still showing in Dashboard

After terminating, the Dashboard should switch to the deploy view. If it doesn't:

**Fix:** Refresh the page. The backend now correctly detects terminated agents and shows the deploy screen.

### EigenAI returns 401/403 after redeploying

Each agent has a unique wallet. When you deploy a new agent, it gets a new wallet address.

**Fix:** Activate the grant for the new agent's wallet address at https://eigenarcade.com.

## Architecture

See [docs/eigenskills-build-plan.md](eigenskills-build-plan.md) for the full architecture and build plan.

## Reference

- [EigenAI Reference](eigenai-reference.md) — API, models, tool calling, signature verification
- [EigenCompute Reference](eigencompute-reference.md) — Dockerfile, CLI, env vars, deploy flow
