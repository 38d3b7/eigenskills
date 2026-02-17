"use client";

import { useState, useEffect } from "react";
import { deployAgent, type EnvVar } from "@/lib/api";
import {
  checkEigenAIGrant,
  signEigenAIGrant,
  getConnectedAccount,
} from "@/lib/wallet";

interface AgentSetupProps {
  token: string;
  onDeployed: () => void;
}

interface GrantCredentials {
  message: string;
  signature: string;
  walletAddress: string;
}

export default function AgentSetup({ token, onDeployed }: AgentSetupProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grant state
  const [grantCredentials, setGrantCredentials] =
    useState<GrantCredentials | null>(null);
  const [grantStatus, setGrantStatus] = useState<{
    checked: boolean;
    hasGrant: boolean;
    tokenCount: number;
  }>({ checked: false, hasGrant: false, tokenCount: 0 });
  const [signingGrant, setSigningGrant] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Check grant status when entering step 2
  useEffect(() => {
    if (step === 2 && !grantStatus.checked) {
      checkGrant();
    }
  }, [step, grantStatus.checked]);

  async function checkGrant() {
    const address = await getConnectedAccount();
    if (!address) return;

    setWalletAddress(address);
    const status = await checkEigenAIGrant(address);
    setGrantStatus({
      checked: true,
      hasGrant: status.hasGrant,
      tokenCount: status.tokenCount,
    });
  }

  async function handleSignGrant() {
    if (!walletAddress) return;

    setSigningGrant(true);
    setError(null);

    try {
      const { grantMessage, grantSignature } =
        await signEigenAIGrant(walletAddress);
      setGrantCredentials({
        message: grantMessage,
        signature: grantSignature,
        walletAddress,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sign grant message"
      );
    } finally {
      setSigningGrant(false);
    }
  }

  function addEnvVar() {
    setEnvVars([...envVars, { key: "", value: "", isPublic: false }]);
  }

  function removeEnvVar(index: number) {
    setEnvVars(envVars.filter((_, i) => i !== index));
  }

  function updateEnvVar(
    index: number,
    field: keyof EnvVar,
    value: string | boolean
  ) {
    setEnvVars(
      envVars.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  }

  async function handleDeploy() {
    setDeploying(true);
    setError(null);

    try {
      // Build env vars including grant credentials if signed
      const allVars: EnvVar[] = [...envVars.filter((v) => v.key && v.value)];

      if (grantCredentials) {
        allVars.push(
          {
            key: "EIGENAI_GRANT_MESSAGE",
            value: grantCredentials.message,
            isPublic: false,
          },
          {
            key: "EIGENAI_GRANT_SIGNATURE",
            value: grantCredentials.signature,
            isPublic: false,
          },
          {
            key: "EIGENAI_WALLET_ADDRESS",
            value: grantCredentials.walletAddress,
            isPublic: false,
          }
        );
      }

      await deployAgent(token, name, allVars);
      onDeployed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setDeploying(false);
    }
  }

  const totalSteps = 4;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                s <= step
                  ? "bg-white text-zinc-900"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {s}
            </div>
            {s < totalSteps && (
              <div
                className={`h-px w-8 transition-colors ${
                  s < step ? "bg-white" : "bg-zinc-800"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Name */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Name your agent</h2>
            <p className="mt-2 text-zinc-400">
              Give your agent a display name. This is just for your reference.
            </p>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Verifiable Agent"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button
            onClick={() => setStep(2)}
            disabled={!name.trim()}
            className="w-full rounded-xl bg-white py-3 font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2: Authorize EigenAI */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Authorize EigenAI</h2>
            <p className="mt-2 text-zinc-400">
              Sign a message to let your agent use your EigenAI grant. This
              avoids needing a separate grant for each agent.
            </p>
          </div>

          {/* Grant status */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
            {!grantStatus.checked ? (
              <div className="flex items-center gap-3 text-zinc-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                Checking grant status...
              </div>
            ) : grantStatus.hasGrant ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-emerald-400" />
                  <span className="text-emerald-400 font-medium">
                    Grant active
                  </span>
                </div>
                <p className="text-sm text-zinc-400">
                  Your wallet has {grantStatus.tokenCount.toLocaleString()}{" "}
                  tokens available.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
                  <span className="text-amber-400 font-medium">
                    No grant found
                  </span>
                </div>
                <p className="text-sm text-zinc-400">
                  Your wallet doesn&apos;t have an EigenAI grant.{" "}
                  <a
                    href="https://eigenarcade.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white underline hover:text-zinc-300"
                  >
                    Get one at EigenArcade
                  </a>
                  , then return here.
                </p>
              </>
            )}
          </div>

          {/* Grant signature status */}
          {grantStatus.hasGrant && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              {grantCredentials ? (
                <div className="flex items-center gap-3">
                  <svg
                    className="h-5 w-5 text-emerald-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span className="text-emerald-400 font-medium">
                    Grant authorized
                  </span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-400 mb-4">
                    Sign a message to authorize your agent to use your grant.
                    This signature is encrypted and only accessible inside the
                    TEE.
                  </p>
                  <button
                    onClick={handleSignGrant}
                    disabled={signingGrant}
                    className="w-full rounded-xl bg-white py-3 font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {signingGrant ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900" />
                        Waiting for signature...
                      </span>
                    ) : (
                      "Sign Authorization"
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 rounded-xl border border-zinc-700 py-3 font-semibold text-zinc-300 transition-colors hover:bg-zinc-900"
            >
              Back
            </button>
            <button
              onClick={() => {
                setError(null);
                setStep(3);
              }}
              disabled={grantStatus.hasGrant && !grantCredentials}
              className="flex-1 rounded-xl bg-white py-3 font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              {grantStatus.hasGrant && !grantCredentials
                ? "Sign to continue"
                : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Env vars */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Configure environment variables
            </h2>
            <p className="mt-2 text-zinc-400">
              Add your API keys and configuration. Encrypted variables are only
              accessible inside your agent&apos;s TEE. Public variables appear
              on the Verifiability Dashboard.
            </p>
          </div>

          <div className="space-y-3">
            {envVars.map((envVar, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"
              >
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={envVar.key}
                    onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                    placeholder="KEY_NAME"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={envVar.value}
                    onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                    placeholder="Value"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-400">
                    <input
                      type="checkbox"
                      checked={envVar.isPublic}
                      onChange={(e) =>
                        updateEnvVar(i, "isPublic", e.target.checked)
                      }
                      className="rounded border-zinc-600"
                    />
                    Make public (visible on Verifiability Dashboard)
                  </label>
                </div>
                <button
                  onClick={() => removeEnvVar(i)}
                  className="mt-1 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addEnvVar}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 py-3 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-300"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add variable
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-xl border border-zinc-700 py-3 font-semibold text-zinc-300 transition-colors hover:bg-zinc-900"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="flex-1 rounded-xl bg-white py-3 font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review and deploy */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Review and deploy</h2>
            <p className="mt-2 text-zinc-400">
              Confirm your agent configuration before deploying to EigenCompute.
            </p>
          </div>

          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div>
              <span className="text-sm text-zinc-500">Agent name</span>
              <p className="font-semibold text-white">{name}</p>
            </div>
            <div>
              <span className="text-sm text-zinc-500">EigenAI Authorization</span>
              <p className="text-white">
                {grantCredentials ? (
                  <span className="text-emerald-400">
                    Using your wallet grant
                  </span>
                ) : (
                  <span className="text-amber-400">
                    Will need separate grant activation
                  </span>
                )}
              </p>
            </div>
            <div>
              <span className="text-sm text-zinc-500">
                Environment variables
              </span>
              <p className="text-white">
                {envVars.filter((v) => v.key).length} custom (
                {envVars.filter((v) => v.isPublic).length} public,{" "}
                {envVars.filter((v) => !v.isPublic && v.key).length} encrypted)
                {grantCredentials && " + 3 grant credentials"}
              </p>
            </div>
            <div>
              <span className="text-sm text-zinc-500">Runtime</span>
              <p className="text-white">EigenCompute TEE (Intel TDX)</p>
            </div>
            <div>
              <span className="text-sm text-zinc-500">Instance type</span>
              <p className="text-white">g1-standard-4t</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(3)}
              disabled={deploying}
              className="flex-1 rounded-xl border border-zinc-700 py-3 font-semibold text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="flex-1 rounded-xl bg-white py-3 font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              {deploying ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900" />
                  Deploying...
                </span>
              ) : (
                "Deploy Agent"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
