import type { OtpResponse } from "@/types";

export const TOTP_SAFETY_MARGIN_MS = 8_000;

export async function requestSafeOtp(
  request: () => Promise<OtpResponse>,
  options: {
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
    onWait?: (expiresAt: number) => void;
  } = {}
) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)));
  let value = await request();
  if (value.source !== "totp") return value;
  const expiresAt = new Date(value.expiresAt).getTime();
  const remaining = expiresAt - now();
  if (
    !Number.isFinite(expiresAt)
    || remaining <= 0
    || remaining >= TOTP_SAFETY_MARGIN_MS
  ) return value;
  options.onWait?.(expiresAt);
  await sleep(Math.max(0, remaining) + 150);
  value = await request();
  return value;
}
