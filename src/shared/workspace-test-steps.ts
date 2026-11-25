import { z } from "zod";

export const testStepsFilename = "test-steps.json";
export const testStepsMaxBytes = 16 * 1024;
const stepSchema = z.object({
  label: z.string().trim().min(1).max(180).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  result: z.enum(["passed", "failed", "skipped"])
}).strict();

export const testStepsReportSchema = z.object({
  schemaVersion: z.literal(1),
  steps: z.array(stepSchema).min(1).max(20)
}).strict();
export type TestStepsReport = z.infer<typeof testStepsReportSchema>;

export function parseTestStepsReport(text: string): TestStepsReport {
  if (new TextEncoder().encode(text).byteLength > testStepsMaxBytes) throw new Error("test_steps_too_large");
  return testStepsReportSchema.parse(JSON.parse(text));
}
