import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api as defaultApi } from "@/api";

interface BrowserDependencies {
  api: (path: string, init?: RequestInit) => Promise<any>;
  startAuthentication: (options: any) => Promise<any>;
}

interface RegistrationDependencies {
  api: (path: string, init?: RequestInit) => Promise<any>;
  startRegistration: (options: any) => Promise<any>;
}

export interface AuthenticateOptions {
  /** Ask the server for a 30 day session instead of the 12 hour default. */
  remember?: boolean;
  /**
   * Called before the browser ceremony when every registered passkey can only
   * be reached through the hybrid (QR code / phone) transport. The ceremony
   * still runs; the caller uses this to explain the QR code and offer a
   * device passkey afterwards.
   */
  onHybridOnly?: () => void;
}

/** True when the allow list is non-empty and no entry can be used on this device directly. */
export function onlyHybridTransports(allowCredentials: unknown) {
  if (!Array.isArray(allowCredentials) || allowCredentials.length === 0) return false;
  return allowCredentials.every((credential) => {
    const transports = Array.isArray(credential?.transports) ? credential.transports as string[] : [];
    return transports.length > 0 && transports.every((transport) => transport === "hybrid");
  });
}

export async function authenticateWithPasskey(
  email: string,
  dependencies: BrowserDependencies = { api: defaultApi, startAuthentication },
  authenticateOptions: AuthenticateOptions = {}
) {
  const request = await dependencies.api("/auth/passkeys/authentication/options", {
    method: "POST",
    body: JSON.stringify({ email })
  });
  if (Array.isArray(request.options?.allowCredentials) && request.options.allowCredentials.length === 0) {
    throw new Error("passkey_not_registered");
  }
  if (onlyHybridTransports(request.options?.allowCredentials)) authenticateOptions.onHybridOnly?.();
  const response = await dependencies.startAuthentication({ optionsJSON: request.options });
  return dependencies.api("/auth/passkeys/authentication/verify", {
    method: "POST",
    body: JSON.stringify({ flowId: request.flowId, response, remember: authenticateOptions.remember === true })
  });
}

export interface RegisterOptions {
  /** Label shown in the passkey list. The server derives one from the authenticator when omitted. */
  name?: string;
}

/**
 * Registers a passkey for the signed-in user. Used both for the first
 * (bootstrap) passkey and for adding further ones from the manager.
 */
export async function registerPasskey(
  dependencies: RegistrationDependencies = { api: defaultApi, startRegistration },
  registerOptions: RegisterOptions = {}
) {
  const request = await dependencies.api("/auth/passkeys/registration/options", { method: "POST", body: "{}" });
  const response = await dependencies.startRegistration({ optionsJSON: request.options });
  const name = registerOptions.name?.trim();
  return dependencies.api("/auth/passkeys/registration/verify", {
    method: "POST",
    body: JSON.stringify(name ? { flowId: request.flowId, response, name } : { flowId: request.flowId, response })
  });
}

/** @deprecated kept for existing callers; identical to `registerPasskey`. */
export const registerBootstrapPasskey = registerPasskey;
