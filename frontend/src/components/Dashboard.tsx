"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAgentInfo,
  stopAgent,
  startAgent,
  terminateAgent,
  submitTask,
  type AgentInfo,
  type TaskResult,
} from "@/lib/api";

interface DashboardProps {
  token: string;
  address: string;
  onAgentTerminated: () => void;
}

export default function Dashboard({
  token,
  address,
  onAgentTerminated,
}: DashboardProps) {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState("");
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);

  const fetchInfo = useCallback(async () => {
    try {
      const info = await getAgentInfo(token);
      setAgent(info);
    } catch {
      setError("Failed to fetch agent info");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const pollInterval = agent?.instanceIp ? 15000 : 5000;

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, pollInterval);
    return () => clearInterval(interval);
  }, [fetchInfo, pollInterval]);

  async function handleAction(
    action: "stop" | "start" | "terminate"
  ) {
    setActionLoading(action);
    setError(null);
    try {
      if (action === "stop") await stopAgent(token);
      else if (action === "start") await startAgent(token);
      else if (action === "terminate") {
        await terminateAgent(token);
        onAgentTerminated();
        return;
      }
      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setActionLoading(null);
      setShowTerminateConfirm(false);
    }
  }

  const canSubmitTask = !!agent?.instanceIp;

  async function handleSubmitTask() {
    if (!taskInput.trim() || !canSubmitTask) return;
    setTaskLoading(true);
    setTaskResult(null);
    setError(null);

    try {
      const result = await submitTask(token, taskInput);
      setTaskResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task failed");
    } finally {
      setTaskLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="py-20 text-center text-zinc-400">
        No agent found. Something went wrong.
      </div>
    );
  }

  const statusColor =
    agent.status === "running"
      ? "text-emerald-400"
      : agent.status === "stopped"
        ? "text-amber-400"
        : "text-zinc-400";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Agent Status Card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{agent.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  agent.status === "running" ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              <span className={`text-sm font-medium capitalize ${statusColor}`}>
                {agent.status}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {agent.status === "running" && (
              <button
                onClick={() => handleAction("stop")}
                disabled={!!actionLoading}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {actionLoading === "stop" ? "Stopping..." : "Stop"}
              </button>
            )}
            {agent.status === "stopped" && (
              <button
                onClick={() => handleAction("start")}
                disabled={!!actionLoading}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {actionLoading === "start" ? "Starting..." : "Start"}
              </button>
            )}
            <button
              onClick={() => setShowTerminateConfirm(true)}
              disabled={!!actionLoading}
              className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              Terminate
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <InfoItem
            label="Your wallet"
            value={address}
            mono
            copyable
          />
          <InfoItem
            label="Agent wallet (ETH)"
            value={agent.walletAddressEth ?? "Pending..."}
            mono
            copyable
          />
          <InfoItem
            label="Agent wallet (Solana)"
            value={agent.walletAddressSol ?? "Pending..."}
            mono
            copyable
          />
          <InfoItem
            label="Instance IP"
            value={agent.instanceIp ?? "Provisioning..."}
            mono
          />
          <InfoItem
            label="Docker digest"
            value={
              agent.dockerDigest
                ? agent.dockerDigest.slice(0, 20) + "..."
                : "Pending..."
            }
            mono
          />
          <InfoItem label="Deployed" value={agent.createdAt} />
        </div>
      </div>

      {/* Terminate Confirmation */}
      {showTerminateConfirm && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
          <h3 className="text-lg font-bold text-red-400">
            Terminate Agent?
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            This is irreversible. Your agent&apos;s wallet will be destroyed and
            all funds lost. Make sure to withdraw any funds first.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setShowTerminateConfirm(false)}
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction("terminate")}
              disabled={!!actionLoading}
              className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {actionLoading === "terminate"
                ? "Terminating..."
                : "Confirm Terminate"}
            </button>
          </div>
        </div>
      )}

      {/* Task Interface */}
      {agent.status === "running" && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="text-lg font-bold text-white">Submit a Task</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Your agent will route this to the best skill automatically.
          </p>

          <div className="mt-4 flex gap-3">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitTask()}
              placeholder={
                canSubmitTask
                  ? "What do you want your agent to do?"
                  : "Waiting for instance IP..."
              }
              disabled={!canSubmitTask}
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmitTask}
              disabled={taskLoading || !taskInput.trim() || !canSubmitTask}
              className="rounded-xl bg-white px-6 py-3 font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              {taskLoading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900" />
              ) : (
                "Send"
              )}
            </button>
          </div>
          {!canSubmitTask && (
            <p className="mt-2 text-xs text-amber-400">
              Your agent is still provisioning. The instance IP will appear
              shortly — this page refreshes automatically.
            </p>
          )}

          {/* Task Result */}
          {taskResult && (
            <div className="mt-4 space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div>
                <span className="text-xs font-medium text-zinc-500">
                  Result
                </span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
                  {taskResult.result}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {taskResult.skillsUsed.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
              <div className="space-y-1 border-t border-zinc-800 pt-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>Routing signature:</span>
                  <code className="truncate font-mono text-zinc-600">
                    {taskResult.routingSignature.slice(0, 32)}...
                  </code>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>Agent signature:</span>
                  <code className="truncate font-mono text-zinc-600">
                    {taskResult.agentSignature.slice(0, 32)}...
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-w-0">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <div className="flex items-center gap-1">
        <p
          className={`truncate text-sm text-zinc-200 ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </p>
        {copyable && (
          <button
            onClick={handleCopy}
            className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:text-zinc-300"
            title="Copy"
          >
            {copied ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
