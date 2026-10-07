import type express from "express";
import { authenticateMachineToken, type MachineIdentity } from "./machine-access.js";

/**
 * Shared bearer-token authentication for machine (non-human) API surfaces.
 *
 * Extracted from test-access.ts so a second surface — the Understand-Kit
 * subscription endpoint — uses exactly the same rule instead of a second,
 * drifting copy: a valid, unexpired, unrevoked token authenticates; anything
 * else is a bodyless 401. Token values are never logged.
 */

export function bearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? "";
}

export type MachineIdentitySource = MachineIdentity[] | (() => MachineIdentity[]);

export function resolveIdentities(source: MachineIdentitySource): MachineIdentity[] {
  return typeof source === "function" ? source() : source;
}

export function createMachineAuthMiddleware(options: {
  identities: MachineIdentitySource;
  /** Called once per authenticated request, e.g. to record last-seen usage. */
  onAuthenticated?: (identity: MachineIdentity) => void;
  now?: () => Date;
}): express.RequestHandler {
  return (req, res, next) => {
    const identity = authenticateMachineToken(
      bearerToken(req.header("authorization")),
      resolveIdentities(options.identities),
      options.now?.()
    );
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    options.onAuthenticated?.(identity);
    res.locals.machineIdentity = identity;
    next();
  };
}
