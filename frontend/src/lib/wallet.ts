import { BrowserProvider, getAddress } from "ethers";
import { SiweMessage } from "siwe";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

/**
 * Connect wallet - opens MetaMask popup where user can select account.
 */
export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts returned");
  }

  return getAddress(accounts[0]);
}

/**
 * Get currently connected account without prompting.
 */
export async function getConnectedAccount(): Promise<string | null> {
  if (!window.ethereum) {
    return null;
  }

  const accounts = (await window.ethereum.request({
    method: "eth_accounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    return null;
  }

  return getAddress(accounts[0]);
}

/**
 * Get current chain ID.
 */
export async function getChainId(): Promise<number | null> {
  if (!window.ethereum) {
    return null;
  }

  const chainId = (await window.ethereum.request({
    method: "eth_chainId",
  })) as string;

  return parseInt(chainId, 16);
}

export async function signSiweMessage(address: string): Promise<{
  message: string;
  signature: string;
}> {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const chainId = (await provider.getNetwork()).chainId;

  const siweMessage = new SiweMessage({
    domain: window.location.host,
    address,
    statement: "Sign in to EigenSkills",
    uri: window.location.origin,
    version: "1",
    chainId: Number(chainId),
    nonce: Math.random().toString(36).slice(2),
    issuedAt: new Date().toISOString(),
  });

  const message = siweMessage.prepareMessage();
  const signature = await signer.signMessage(message);

  return { message, signature };
}
