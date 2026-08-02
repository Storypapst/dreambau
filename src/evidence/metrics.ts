/**
 * Prometheus-format metrics, which is what SigNoz scrapes.
 *
 * Deliberately tiny and dependency-free: the gateway has a handful of counters
 * and one histogram, and a metrics library would be more code than the thing it
 * measures. Nothing here carries a label that could identify a run, a
 * repository or a file — a metrics endpoint is not a place to leak context.
 */

export type CounterName =
  | "evidence_upload_total"
  | "evidence_upload_bytes_total"
  | "evidence_quarantine_total"
  | "evidence_publish_failures_total"
  | "evidence_public_link_probe_failures_total";

export type GaugeName = "evidence_storage_bytes";

const counterHelp: Record<CounterName, string> = {
  evidence_upload_total: "Files whose upload completed, by outcome.",
  evidence_upload_bytes_total: "Bytes accepted into storage.",
  evidence_quarantine_total: "Files quarantined, by the rule family that fired.",
  evidence_publish_failures_total: "Publication attempts that did not complete.",
  evidence_public_link_probe_failures_total: "Public links that failed their periodic probe."
};

/** Buckets chosen around what processing actually costs: images are milliseconds, video is minutes. */
const durationBuckets = [0.05, 0.25, 1, 5, 15, 60, 300, 900];

interface Histogram {
  counts: number[];
  sum: number;
  total: number;
}

export interface Metrics {
  increment(name: CounterName, labels?: Record<string, string>, by?: number): void;
  setGauge(name: GaugeName, value: number): void;
  observeProcessing(kind: string, seconds: number): void;
  render(): string;
  reset(): void;
}

const labelKey = (labels: Record<string, string>) =>
  Object.keys(labels).length === 0
    ? ""
    : `{${Object.entries(labels).sort().map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}`;

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function createMetrics(): Metrics {
  const counters = new Map<string, number>();
  const gauges = new Map<GaugeName, number>();
  const histograms = new Map<string, Histogram>();

  const api: Metrics = {
    increment(name, labels = {}, by = 1) {
      const key = `${name}${labelKey(labels)}`;
      counters.set(key, (counters.get(key) ?? 0) + by);
    },
    setGauge(name, value) {
      gauges.set(name, value);
    },
    observeProcessing(kind, seconds) {
      const existing = histograms.get(kind) ?? { counts: new Array(durationBuckets.length).fill(0), sum: 0, total: 0 };
      for (let index = 0; index < durationBuckets.length; index += 1) {
        if (seconds <= durationBuckets[index]) existing.counts[index] += 1;
      }
      existing.sum += seconds;
      existing.total += 1;
      histograms.set(kind, existing);
    },
    render() {
      const lines: string[] = [];
      for (const name of Object.keys(counterHelp) as CounterName[]) {
        lines.push(`# HELP ${name} ${counterHelp[name]}`, `# TYPE ${name} counter`);
        const matching = [...counters.entries()].filter(([key]) => key === name || key.startsWith(`${name}{`));
        if (matching.length === 0) lines.push(`${name} 0`);
        for (const [key, value] of matching.sort()) lines.push(`${key} ${value}`);
      }
      lines.push(
        "# HELP evidence_storage_bytes Bytes currently held for evidence.",
        "# TYPE evidence_storage_bytes gauge",
        `evidence_storage_bytes ${gauges.get("evidence_storage_bytes") ?? 0}`
      );
      lines.push(
        "# HELP evidence_processing_duration_seconds Time to process one file.",
        "# TYPE evidence_processing_duration_seconds histogram"
      );
      for (const [kind, histogram] of [...histograms.entries()].sort()) {
        for (let index = 0; index < durationBuckets.length; index += 1) {
          lines.push(
            `evidence_processing_duration_seconds_bucket{kind="${escapeLabel(kind)}",le="${durationBuckets[index]}"} ${histogram.counts[index]}`
          );
        }
        lines.push(
          `evidence_processing_duration_seconds_bucket{kind="${escapeLabel(kind)}",le="+Inf"} ${histogram.total}`,
          `evidence_processing_duration_seconds_sum{kind="${escapeLabel(kind)}"} ${histogram.sum}`,
          `evidence_processing_duration_seconds_count{kind="${escapeLabel(kind)}"} ${histogram.total}`
        );
      }
      return `${lines.join("\n")}\n`;
    },
    reset() {
      counters.clear();
      gauges.clear();
      histograms.clear();
    }
  };
  return api;
}

/** Shared instance; the app wires this into the router and the processor. */
export const metrics = createMetrics();
