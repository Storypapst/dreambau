export type DeadlineQueue = {
  <T>(operation: (deadlineAt: number) => Promise<T>): Promise<T>;
  metrics: { enqueued: number; expired: number };
};

/**
 * Serializes operations while measuring the deadline from enqueue time. A
 * caller therefore never receives a fresh timeout merely because earlier work
 * occupied the queue.
 */
export function createDeadlineQueue(
  timeoutMs: number,
  now: () => number = Date.now,
  expiredError: () => Error = () => new Error("deadline_expired")
): DeadlineQueue {
  let tail: Promise<void> = Promise.resolve();
  const metrics = { enqueued: 0, expired: 0 };
  const queue = <T>(operation: (deadlineAt: number) => Promise<T>) => {
    metrics.enqueued += 1;
    const deadlineAt = now() + timeoutMs;
    const guarded = () => {
      if (now() >= deadlineAt) {
        metrics.expired += 1;
        return Promise.reject<T>(expiredError());
      }
      return operation(deadlineAt);
    };
    const result = tail.then(guarded, guarded);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  queue.metrics = metrics;
  return queue;
}
