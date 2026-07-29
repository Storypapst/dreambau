import type { TestAccessRecord } from "./infisical-provider.js";
import type { RegistryWriter } from "./infisical-writer.js";
import { generateTotp } from "./totp.js";

export class TotpAlreadyEnrolledError extends Error {
  constructor() {
    super("TOTP already enrolled");
    this.name = "TotpAlreadyEnrolledError";
  }
}

export class TotpEnrollmentValidationError extends Error {
  constructor() {
    super("Invalid TOTP enrollment");
    this.name = "TotpEnrollmentValidationError";
  }
}

export function assertTotpNotEnrolled(record: TestAccessRecord) {
  if (record.totpSecret) throw new TotpAlreadyEnrolledError();
}

export async function enrollTotpForRecord(options: {
  record: TestAccessRecord;
  rawSecret: string;
  writer: RegistryWriter;
  now: Date;
}) {
  assertTotpNotEnrolled(options.record);
  const normalizedSecret = options.rawSecret.replace(/\s+/g, "").toUpperCase();
  try {
    generateTotp(normalizedSecret, options.now);
  } catch {
    throw new TotpEnrollmentValidationError();
  }
  return options.writer.enrollTotp(
    options.record,
    normalizedSecret,
    options.now.toISOString()
  );
}

export function totpEnrollmentHttpError(error: unknown) {
  if (error instanceof TotpAlreadyEnrolledError) {
    return { status: 409, body: { error: "totp_already_enrolled" } } as const;
  }
  if (error instanceof TotpEnrollmentValidationError) {
    return { status: 400, body: { error: "validation_failed" } } as const;
  }
  if (error instanceof Error && error.message.startsWith("Infisical TOTP")) {
    return { status: 502, body: { error: "totp_enrollment_failed" } } as const;
  }
  return null;
}
