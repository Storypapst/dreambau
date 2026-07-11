import { z } from "zod";

export const lifecycleStatuses = ["unused", "active", "needs_review", "delete_candidate", "archived"] as const;
export const fixtureQualities = ["empty", "synthetic", "realistic", "gold"] as const;
export const projects = ["NONE", "ORI", "ORISO", "ORIMO", "TRAIL.IST", "DREAMBAU", "OTHER"] as const;
export const metadataPatchSchema = z.object({
  shippedVersion: z.string().regex(/^$|^\d+(\.\d+){0,2}$/).optional(),
  lifecycleStatus: z.enum(lifecycleStatuses).optional(), project: z.enum(projects).optional(), roles: z.array(z.string().min(1)).optional(), topics: z.array(z.string().min(1)).optional(),
  conversationTypes: z.array(z.string().min(1)).optional(), fixtureQuality: z.enum(fixtureQualities).optional(),
  sampleFileCount: z.number().int().min(0).optional(), notes: z.string().max(4000).optional()
}).strict();
export type MetadataPatch = z.infer<typeof metadataPatchSchema>;
export type AccountMetadata = Required<MetadataPatch> & { email: string; updatedAt: string };

export function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number); const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) { const difference = (a[i] ?? 0) - (b[i] ?? 0); if (difference) return difference; }
  return 0;
}

export function emptyMetadata(email: string): AccountMetadata {
  return { email, shippedVersion: "", lifecycleStatus: "unused", project: "NONE", roles: [], topics: [], conversationTypes: [], fixtureQuality: "empty", sampleFileCount: 0, notes: "", updatedAt: new Date(0).toISOString() };
}
