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
├── registry/               # Skill registry
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

## Architecture

See [docs/eigenskills-build-plan.md](eigenskills-build-plan.md) for the full architecture and build plan.

## Reference

- [EigenAI Reference](eigenai-reference.md) — API, models, tool calling, signature verification
- [EigenCompute Reference](eigencompute-reference.md) — Dockerfile, CLI, env vars, deploy flow
