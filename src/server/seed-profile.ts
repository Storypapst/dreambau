import { z } from "zod";

const seedProfileSchema = z.record(
  z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  z.string().max(8192)
).refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 64);

export type SeedProfile = z.infer<typeof seedProfileSchema>;

export function parseSeedProfile(value: string): SeedProfile {
  try {
    return seedProfileSchema.parse(JSON.parse(value));
  } catch {
    throw new Error("Invalid seed profile");
  }
}

function shellSingleQuoted(value: string) {
  return `'${value
    .replace(/'/g, `'"'"'`)
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}'`;
}

export function serializeDotenv(profile: SeedProfile) {
  return Object.entries(seedProfileSchema.parse(profile))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${shellSingleQuoted(value)}`)
    .join("\n") + "\n";
}
