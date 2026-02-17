import express from "express";
import cors from "cors";
import { getAgentAddress, signMessage } from "./wallet.js";
import { listSkills, getSkill, fetchRegistry } from "./registry.js";
import { routeTask } from "./router.js";
import { executeSkill } from "./executor.js";
import { addLogEntry, getHistory } from "./logger.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// POST /task — submit a task for the agent to route and execute
app.post("/task", async (req, res) => {
  try {
    const { task } = req.body;
    if (!task || typeof task !== "string") {
      res.status(400).json({ error: "Missing or invalid 'task' field" });
      return;
    }

    await addLogEntry("task_received", { task });

    // Get available skills (filtered by user's env vars)
    const skills = await listSkills();
    if (skills.length === 0) {
      res.status(503).json({ error: "No skills available" });
      return;
    }

    // Route the task via EigenAI
    const routing = await routeTask(task, skills);
    await addLogEntry("routing_decision", {
      skillIds: routing.skillIds,
      eigenaiSignature: routing.signature,
    });

    if (routing.skillIds.length === 0) {
      res
        .status(404)
        .json({ error: "No suitable skill found for this task" });
      return;
    }

    // Execute each selected skill in order
    const results = [];
    for (const skillId of routing.skillIds) {
      const skill = await getSkill(skillId);
      if (!skill) {
        await addLogEntry("skill_not_found", { skillId });
        continue;
      }

      await addLogEntry("skill_executing", {
        skillId,
        contentHash: skill.contentHash,
      });

      const result = await executeSkill(skillId, task);
      results.push(result);

      await addLogEntry("skill_completed", {
        skillId,
        output: result.output.slice(0, 500),
        steps: result.steps.length,
      });
    }

    const combinedOutput = results.map((r) => r.output).join("\n\n");
    const agentSignature = await signMessage(combinedOutput);

    await addLogEntry("result_returned", {
      output: combinedOutput.slice(0, 500),
      skillsUsed: routing.skillIds,
    });

    res.json({
      result: combinedOutput,
      skillsUsed: routing.skillIds,
      routingSignature: routing.signature,
      agentSignature,
      agentAddress: getAgentAddress(),
    });
  } catch (error) {
    console.error("Task execution error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// GET /skills — list available skills
app.get("/skills", async (_req, res) => {
  try {
    const skills = await listSkills();
    res.json({ skills });
  } catch (error) {
    console.error("Error listing skills:", error);
    res.status(500).json({ error: "Failed to fetch skills" });
  }
});

// GET /history — signed execution log
app.get("/history", (_req, res) => {
  res.json({ entries: getHistory() });
});

// GET /whoami — agent identity and attestation info
app.get("/whoami", async (_req, res) => {
  res.json({
    agentAddress: getAgentAddress(),
    network: process.env.NETWORK_PUBLIC ?? "unknown",
    registryUrl: process.env.SKILL_REGISTRY_URL ?? "not configured",
    tee: "Intel TDX (EigenCompute)",
  });
});

// GET /health — liveness check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`EigenSkills Agent running on port ${PORT}`);
  console.log(`Agent address: ${getAgentAddress()}`);
  console.log(
    `Network: ${process.env.NETWORK_PUBLIC ?? "not set"}`
  );

  // Pre-fetch the registry on startup
  fetchRegistry().catch((err) =>
    console.error("Failed to pre-fetch registry:", err)
  );
});
