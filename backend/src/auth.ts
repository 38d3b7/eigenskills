import { SiweMessage } from "siwe";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const TOKEN_SECRET =
  process.env.TOKEN_SECRET ?? randomBytes(32).toString("hex");

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Verify a SIWE (Sign In With Ethereum) message.
 * Returns the verified Ethereum address.
 */
export async function verifySiwe(
  message: string,
  signature: string
): Promise<string> {
  const siweMessage = new SiweMessage(message);
  const { data } = await siweMessage.verify({ signature });
  return data.address.toLowerCase();
}

/**
 * Create an HMAC-signed session token after successful SIWE verification.
 * Token format: base64("address:expiresAt:hmac")
 */
export function createSessionToken(address: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${address.toLowerCase()}:${expiresAt}`;
  const hmac = createHmac("sha256", TOKEN_SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}:${hmac}`).toString("base64");
}

/**
 * Verify an HMAC-signed session token.
 * Returns the address if valid, null otherwise.
 */
function verifySessionToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return null;

    const payload = decoded.slice(0, lastColon);
    const providedHmac = decoded.slice(lastColon + 1);

    const expectedHmac = createHmac("sha256", TOKEN_SECRET)
      .update(payload)
      .digest("hex");

    // Timing-safe comparison to prevent timing attacks
    if (providedHmac.length !== expectedHmac.length) return null;
    const isValid = timingSafeEqual(
      Buffer.from(providedHmac),
      Buffer.from(expectedHmac)
    );
    if (!isValid) return null;

    const sepIdx = payload.indexOf(":");
    if (sepIdx === -1) return null;

    const address = payload.slice(0, sepIdx);
    const expiresAt = parseInt(payload.slice(sepIdx + 1), 10);

    if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

    return address;
  } catch {
    return null;
  }
}

/**
 * Express middleware that verifies HMAC-signed session tokens.
 * Sets req.userAddress on success.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const address = verifySessionToken(token);

  if (!address) {
    res.status(401).json({ error: "Invalid or expired auth token" });
    return;
  }

  (req as Request & { userAddress: string }).userAddress = address;
  next();
}

/**
 * Helper to get the authenticated user address from a request.
 */
export function getUserAddress(req: Request): string {
  return (req as Request & { userAddress: string }).userAddress;
}
