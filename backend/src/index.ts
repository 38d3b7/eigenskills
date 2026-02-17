import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  verifySiwe,
  createSessionToken,
  requireAuth,
  getUserAddress,
} from "./auth.js";
import {
  ensureUser,
  createAgent,
  updateAgent,
  getAgentByUser,
} from "./db.js";
import {
  deployAgent,
  upgradeAgent,
  stopAgent,
  startAgent,
  terminateAgent,
  getAppInfo,
  type EnvVar,
} from "./eigencompute.js";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  })
);

const PORT = parseInt(process.env.PORT ?? "3002", 10);

// POST /api/auth/verify — verify SIWE signature, return session token
app.post("/api/auth/verify", async (req, res) => {
  try {
    const { message, signature } = req.body;
    if (!message || !signature) {
      res.status(400).json({ error: "Missing message or signature" });
      return;
    }

    const address = await verifySiwe(message, signature);
    ensureUser(address);

    const token = createSessionToken(address);
    const agent = getAgentByUser(address);

    // Only consider active (non-terminated) agents
    const hasActiveAgent = !!agent && agent.status !== "terminated";
    res.json({ address, token, hasAgent: hasActiveAgent });
  } catch (error) {
    console.error("SIWE verification error:", error);
    res.status(401).json({ error: "Invalid signature" });
  }
});

// POST /api/agents/deploy — deploy a new agent for the user
app.post("/api/agents/deploy", requireAuth, async (req, res) => {
  try {
    const userAddress = getUserAddress(req);
    const { envVars, name } = req.body as {
      envVars: EnvVar[];
      name: string;
    };

    if (!name || !envVars) {
      res.status(400).json({ error: "Missing name or envVars" });
      return;
    }

    // Ensure user exists in DB (handles case where DB was reset)
    ensureUser(userAddress);

    // Check if user already has an agent
    const existing = getAgentByUser(userAddress);
    if (existing && existing.status !== "terminated") {
      res.status(409).json({
        error: "You already have an active agent. Terminate it first.",
      });
      return;
    }

    // Create agent record
    const agentId = createAgent(userAddress, name);

    // Deploy to EigenCompute
    // The ecloud_name is the friendly name passed to --name; the hex app_id is canonical
    const ecloudName = `eigenskills-${userAddress.slice(2, 10)}`;
    const result = await deployAgent(ecloudName, envVars);

    // The deploy output does not include Instance IP or sometimes
    // Docker Digest. Fetch them via `ecloud compute app info`.
    let { instanceIp, dockerDigest, walletAddressEth, walletAddressSol } = result;
    if (!instanceIp || !dockerDigest) {
      try {
        const info = await getAppInfo(result.appId);
        instanceIp = info.instanceIp || instanceIp;
        dockerDigest = info.dockerDigest || dockerDigest;
        walletAddressEth = info.walletAddressEth || walletAddressEth;
        walletAddressSol = info.walletAddressSol || walletAddressSol;
      } catch (infoErr) {
        console.warn("Failed to fetch app info after deploy:", infoErr);
      }
    }

    // Update agent record with deployment details
    updateAgent(agentId, {
      app_id: result.appId,
      ecloud_name: ecloudName,
      wallet_address_eth: walletAddressEth,
      wallet_address_sol: walletAddressSol,
      instance_ip: instanceIp,
      docker_digest: dockerDigest,
      status: "running",
    });

    res.json({
      agentId,
      appId: result.appId,
      walletAddress: walletAddressEth,
      instanceIp,
    });
  } catch (error) {
    console.error("Deploy error:", error);
    const message =
      error instanceof Error ? error.message : "Deployment failed";
    res.status(500).json({ error: message });
  }
});

// POST /api/agents/upgrade — update agent env vars
app.post("/api/agents/upgrade", requireAuth, async (req, res) => {
  try {
    const userAddress = getUserAddress(req);
    const { envVars } = req.body as { envVars: EnvVar[] };

    const agent = getAgentByUser(userAddress);
    if (!agent?.app_id) {
      res.status(404).json({ error: "No active agent found" });
      return;
    }

    await upgradeAgent(agent.app_id, envVars);
    updateAgent(agent.id, { status: "running" });

    res.json({ success: true });
  } catch (error) {
    console.error("Upgrade error:", error);
    res.status(500).json({ error: "Upgrade failed" });
  }
});

// POST /api/agents/stop
app.post("/api/agents/stop", requireAuth, async (req, res) => {
  try {
    const userAddress = getUserAddress(req);
    const agent = getAgentByUser(userAddress);
    if (!agent?.app_id) {
      res.status(404).json({ error: "No active agent found" });
      return;
    }

    await stopAgent(agent.app_id);
    updateAgent(agent.id, { status: "stopped" });
    res.json({ success: true });
  } catch (error) {
    console.error("Stop error:", error);
    res.status(500).json({ error: "Stop failed" });
  }
});

// POST /api/agents/start
app.post("/api/agents/start", requireAuth, async (req, res) => {
  try {
    const userAddress = getUserAddress(req);
    const agent = getAgentByUser(userAddress);
    if (!agent?.app_id) {
      res.status(404).json({ error: "No active agent found" });
      return;
    }

    await startAgent(agent.app_id);

    // IP may change after stop/start — refresh from EigenCompute
    // Prefer ecloud_name for readability in logs, fall back to hex app_id
    const updates: Parameters<typeof updateAgent>[1] = { status: "running" };
    try {
      const info = await getAppInfo(agent.ecloud_name ?? agent.app_id);
      if (info.instanceIp) updates.instance_ip = info.instanceIp;
      if (info.dockerDigest) updates.docker_digest = info.dockerDigest;
    } catch (infoErr) {
      console.warn("Failed to fetch app info after start:", infoErr);
    }

    updateAgent(agent.id, updates);
    res.json({ success: true });
  } catch (error) {
    console.error("Start error:", error);
    res.status(500).json({ error: "Start failed" });
  }
});

// POST /api/agents/terminate
app.post("/api/agents/terminate", requireAuth, async (req, res) => {
  try {
    const userAddress = getUserAddress(req);
    const agent = getAgentByUser(userAddress);
    if (!agent?.app_id) {
      res.status(404).json({ error: "No active agent found" });
      return;
    }

    await terminateAgent(agent.app_id);
    updateAgent(agent.id, { status: "terminated" });
    res.json({ success: true });
  } catch (error) {
    console.error("Terminate error:", error);
    res.status(500).json({ error: "Terminate failed" });
  }
});

// GET /api/agents/info
app.get("/api/agents/info", requireAuth, async (req, res) => {
  try {
    const userAddress = getUserAddress(req);
    const agent = getAgentByUser(userAddress);

    if (!agent) {
      res.status(404).json({ error: "No agent found" });
      return;
    }

    // If instance_ip is missing and the agent should be running,
    // try fetching it live from EigenCompute (handles the case where
    // deploy output didn't include the IP).
    // Prefer ecloud_name for readability in logs, fall back to hex app_id
    if (!agent.instance_ip && agent.app_id && agent.status === "running") {
      try {
        const info = await getAppInfo(agent.ecloud_name ?? agent.app_id);
        if (info.instanceIp) {
          updateAgent(agent.id, {
            instance_ip: info.instanceIp,
            ...(info.dockerDigest && !agent.docker_digest
              ? { docker_digest: info.dockerDigest }
              : {}),
            ...(info.walletAddressEth && !agent.wallet_address_eth
              ? { wallet_address_eth: info.walletAddressEth }
              : {}),
            ...(info.walletAddressSol && !agent.wallet_address_sol
              ? { wallet_address_sol: info.walletAddressSol }
              : {}),
          });
          agent.instance_ip = info.instanceIp;
          agent.docker_digest = info.dockerDigest || agent.docker_digest;
          agent.wallet_address_eth = info.walletAddressEth || agent.wallet_address_eth;
          agent.wallet_address_sol = info.walletAddressSol || agent.wallet_address_sol;
        }
      } catch (infoErr) {
        console.warn("Failed to fetch app info for running agent:", infoErr);
      }
    }

    res.json({
      name: agent.name,
      status: agent.status,
      appId: agent.app_id,
      walletAddressEth: agent.wallet_address_eth,
      walletAddressSol: agent.wallet_address_sol,
      instanceIp: agent.instance_ip,
      dockerDigest: agent.docker_digest,
      createdAt: agent.created_at,
    });
  } catch (error) {
    console.error("Info error:", error);
    res.status(500).json({ error: "Failed to get agent info" });
  }
});

// POST /api/agents/task — proxy task submission to the agent
// This avoids CORS issues since the agent doesn't serve CORS headers.
app.post("/api/agents/task", requireAuth, async (req, res) => {
  try {
    const userAddress = getUserAddress(req);
    const agent = getAgentByUser(userAddress);

    if (!agent || agent.status !== "running") {
      res.status(404).json({ error: "No running agent found" });
      return;
    }

    if (!agent.instance_ip) {
      res.status(503).json({ error: "Agent instance IP not available yet" });
      return;
    }

    const { task } = req.body as { task: string };
    if (!task || typeof task !== "string") {
      res.status(400).json({ error: "Missing or invalid 'task' field" });
      return;
    }

    // Forward request to the agent
    const agentUrl = `http://${agent.instance_ip}:3000/task`;
    const agentRes = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    });

    if (!agentRes.ok) {
      const errBody = await agentRes.json().catch(() => ({}));
      res.status(agentRes.status).json(errBody);
      return;
    }

    const result = await agentRes.json();
    res.json(result);
  } catch (error) {
    console.error("Task proxy error:", error);
    const message =
      error instanceof Error ? error.message : "Task submission failed";
    res.status(500).json({ error: message });
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`EigenSkills Backend running on port ${PORT}`);
});
