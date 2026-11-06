import { z } from "zod";
export const taxonomyKinds = ["roles", "topics", "conversationTypes"] as const;
export const taxonomyKindSchema = z.enum(taxonomyKinds);
export const taxonomyValuesSchema = z.object({ values: z.array(z.string().trim().min(1).max(120)).max(200) });
export interface Taxonomies { roles: string[]; topics: string[]; conversationTypes: string[] }

export const taxonomyProjectSchema = z.enum(["oriso", "orimo", "dreambau"]);
export type TaxonomyProject = z.infer<typeof taxonomyProjectSchema>;
export const defaultConversationTypes = ["Mail/FormChat", "Live/TempChat", "Kreis/EventChat", "Internal/InternalChat"];
export const conversationTypePatchSchema = z.object({
  value: z.string().trim().min(1).max(120),
  previous: z.string().min(1).optional()
}).strict();
export type ConversationTypePatch = z.infer<typeof conversationTypePatchSchema>;
export type ConversationTypeResult = { values: string[] } | { error: "conversation_type_not_found" | "conversation_type_exists" };

export const loginTargetUrlSchema = z.string().trim().max(2048)
  .pipe(z.url({ protocol: /^https$/ }))
  .transform((value) => new URL(value))
  .refine((url) => !url.username && !url.password, "Login URLs cannot contain credentials")
  .transform((url) => url.href)
  .pipe(z.string().max(2048));
export const loginTargetSchema = z.object({ label: z.string().trim().min(1).max(120), url: loginTargetUrlSchema }).strict();
export type LoginTarget = z.infer<typeof loginTargetSchema>;
export const defaultOrisoLoginTargets: LoginTarget[] = [
  { label: "Dev", url: "https://dev.oriso.org/admin/login" },
  { label: "PreDev", url: "https://predev.oriso.org/admin/login" },
  { label: "Staging", url: "https://staging.caritas-onlineberatung.de/admin/login" }
];

export function accountTaxonomyProject(project: string, domain: string): TaxonomyProject {
  if (project === "ORISO") return "oriso";
  if (project === "ORIMO" || project === "TRAIL.IST") return "orimo";
  if (project === "DREAMBAU") return "dreambau";
  if (domain === "oriso.org" || domain === "openresilience.cc") return "oriso";
  if (domain === "trail.ist") return "orimo";
  return "dreambau";
}
