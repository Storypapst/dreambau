import { randomBytes, randomUUID } from "node:crypto";

/**
 * Public identifiers are the only thing standing between an unlisted evidence
 * page and the open internet, so they carry 160 bits of entropy and are never
 * derived from run content. The alphabet holds exactly 32 symbols (no `l`, no
 * `1`, no `0`, no `9`) so masking five bits per character stays unbiased.
 */
const publicAlphabet = "abcdefghijkmnopqrstuvwxyz2345678";
export const publicIdLength = 32;
export const publicIdEntropyBits = publicIdLength * 5;

export function createRunId(): string {
  return randomUUID();
}

export function createFileId(): string {
  return randomUUID();
}

export function createPublicId(random: (size: number) => Buffer = randomBytes): string {
  const bytes = random(publicIdLength);
  if (bytes.length < publicIdLength) throw new Error("public id randomness is too short");
  let value = "";
  for (let index = 0; index < publicIdLength; index += 1) value += publicAlphabet[bytes[index] & 31];
  return value;
}

export const publicIdPattern = new RegExp(`^[${publicAlphabet}]{${publicIdLength}}$`);

export function isPublicId(value: string): boolean {
  return publicIdPattern.test(value);
}
