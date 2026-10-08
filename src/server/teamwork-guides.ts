import { open } from "node:fs/promises";
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[<>\u0000-\u001f\u007f]/u.test(value), "Plain text required");
const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const safeUrl = z.string().max(2048).refine((value) => {
  if (/[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}, "Credential-free HTTPS link required");
const link = z.object({ label: text(100), url: safeUrl }).strict();
const platform = z.object({
  id, label: text(40), downloads: z.array(link).max(6),
  steps: z.array(z.object({ title: text(100), text: text(1000) }).strict()).min(1).max(8)
}).strict();
const guideSchema = z.object({
  id, title: text(100), summary: text(600), useCases: z.array(text(400)).max(3),
  learnMore: z.array(link).max(6), platforms: z.array(platform).min(1).max(5), launchUrl: safeUrl.optional()
}).strict().refine((guide) => new Set(guide.platforms.map((p) => p.id)).size === guide.platforms.length, "Duplicate platform");
const catalogueSchema = z.object({ format: z.literal(1), guides: z.array(guideSchema).max(60) }).strict()
  .refine((catalogue) => new Set(catalogue.guides.map((g) => g.id)).size === catalogue.guides.length, "Duplicate guide");
export type ProgrammeGuide = z.infer<typeof guideSchema>;

/** Operator-owned JSON is read on each request so an atomic replacement needs no restart.
 * Only validated plain text and links leave the server. There are no filesystem paths in IDs. */
export async function loadProgrammeGuide(file: string | null, guideId: string): Promise<ProgrammeGuide | null> {
  if (!file || !id.safeParse(guideId).success) return null;
  const handle = await open(file, "r").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  if (!handle) return null;
  try {
    const maxBytes = 256 * 1024;
    const { bytesRead, buffer } = await handle.read(Buffer.alloc(maxBytes + 1), 0, maxBytes + 1, 0);
    if (bytesRead > maxBytes) throw new Error("Guide configuration too large");
    const catalogue = catalogueSchema.parse(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
    return catalogue.guides.find((guide) => guide.id === guideId) ?? null;
  } finally { await handle.close(); }
}
