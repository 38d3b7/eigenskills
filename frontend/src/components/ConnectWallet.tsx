"use client";

import { useState, useEffect } from "react";
import { hasMetaMask, connectWallet, signSiweMessage } from "@/lib/wallet";
import { verifyAuth } from "@/lib/api";
import { getAddress } from "ethers";

interface ConnectWalletProps {
  onConnected: (address: string, token: string, hasAgent: boolean) => void;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia",
  8453: "Base",
  84532: "Base Sepolia",
  137: "Polygon",
  42161: "Arbitrum",
};

export default function ConnectWallet({ onConnected }: ConnectWalletProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // Listen for account/chain changes AFTER user has connected
  useEffect(() => {
    if (!window.ethereum || !account) return;

    const refreshState = async () => {
      try {
        const accounts = (await window.ethereum!.request({
          method: "eth_accounts",
        })) as string[];

        const chain = (await window.ethereum!.request({
          method: "eth_chainId",
        })) as string;

        setAccount(accounts.length > 0 ? getAddress(accounts[0]) : null);
        setChainId(parseInt(chain, 16));
      } catch (e) {
        console.error("Failed to refresh state:", e);
      }
    };

    window.ethereum.on("accountsChanged", refreshState);
    window.ethereum.on("chainChanged", refreshState);

    return () => {
      window.ethereum?.removeListener("accountsChanged", refreshState);
      window.ethereum?.removeListener("chainChanged", refreshState);
    };
  }, [account]);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      if (!hasMetaMask()) {
        setError("Please install MetaMask to continue");
        return;
      }

      const address = await connectWallet();
      setAccount(address);

      const chain = (await window.ethereum!.request({
        method: "eth_chainId",
      })) as string;
      setChainId(parseInt(chain, 16));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    if (!window.ethereum) return;

    setLoading(true);
    setError(null);

    try {
      // Get current account from MetaMask right before signing
      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];

      if (accounts.length === 0) {
        setError("No wallet connected");
        return;
      }

      const currentAddress = getAddress(accounts[0]);
      const { message, signature } = await signSiweMessage(currentAddress);
      const auth = await verifyAuth(message, signature);
      onConnected(auth.address, auth.token, auth.hasAgent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  const chainName = chainId ? CHAIN_NAMES[chainId] || `Chain ${chainId}` : null;
  const shortAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Show current connection status only after user connects */}
      {account && (
        <div className="mb-2 rounded-xl border border-zinc-700 bg-zinc-900/50 px-6 py-4 text-center">
          <p className="text-sm text-zinc-400">Connected</p>
          <p className="mt-1 font-mono text-lg text-white">{shortAddress}</p>
          {chainName && (
            <p className="mt-1 text-sm text-zinc-400">{chainName}</p>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Change account or network in MetaMask
          </p>
        </div>
      )}

      {/* Action buttons */}
      {!account ? (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="flex h-14 items-center gap-3 rounded-xl bg-white px-8 text-lg font-semibold text-zinc-900 shadow-lg transition-all hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 18V19C21 20.1 20.1 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.9 3.89 3 5 3H19C20.1 3 21 3.9 21 5V6H12C10.89 6 10 6.9 10 8V16C10 17.1 10.89 18 12 18H21ZM12 16H22V8H12V16ZM16 13.5C15.17 13.5 14.5 12.83 14.5 12C14.5 11.17 15.17 10.5 16 10.5C16.83 10.5 17.5 11.17 17.5 12C17.5 12.83 16.83 13.5 16 13.5Z"
                fill="currentColor"
              />
            </svg>
          )}
          {loading ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="flex h-14 items-center justify-center gap-3 rounded-xl bg-white px-8 text-lg font-semibold text-zinc-900 shadow-lg transition-all hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {loading ? "Signing in..." : "Sign In"}
        </button>
      )}

      {error && <p className="max-w-xs text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
