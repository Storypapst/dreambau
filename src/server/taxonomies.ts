import { z } from "zod";
export const taxonomyKinds = ["roles", "topics", "conversationTypes"] as const;
export const taxonomyKindSchema = z.enum(taxonomyKinds);
export const taxonomyValuesSchema = z.object({ values: z.array(z.string().trim().min(1).max(120)).max(200) });
export interface Taxonomies { roles: string[]; topics: string[]; conversationTypes: string[] }
