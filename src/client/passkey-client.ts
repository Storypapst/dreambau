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

export async function authenticateWithPasskey(
  email: string,
  dependencies: BrowserDependencies = { api: defaultApi, startAuthentication }
) {
  const request = await dependencies.api("/auth/passkeys/authentication/options", {
    method: "POST",
    body: JSON.stringify({ email })
  });
  if (Array.isArray(request.options?.allowCredentials) && request.options.allowCredentials.length === 0) {
    throw new Error("passkey_not_registered");
  }
  const response = await dependencies.startAuthentication({ optionsJSON: request.options });
  return dependencies.api("/auth/passkeys/authentication/verify", {
    method: "POST",
    body: JSON.stringify({ flowId: request.flowId, response })
  });
}

export async function registerBootstrapPasskey(
  dependencies: RegistrationDependencies = { api: defaultApi, startRegistration }
) {
  const request = await dependencies.api("/auth/passkeys/registration/options", { method: "POST", body: "{}" });
  const response = await dependencies.startRegistration({ optionsJSON: request.options });
  return dependencies.api("/auth/passkeys/registration/verify", {
    method: "POST",
    body: JSON.stringify({ flowId: request.flowId, response })
  });
}
