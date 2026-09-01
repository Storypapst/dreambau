export type DeadlineQueue = <T>(operation: (deadlineAt: number) => Promise<T>) => Promise<T>;

/**
 * Serializes operations while measuring the deadline from enqueue time. A
 * caller therefore never receives a fresh timeout merely because earlier work
 * occupied the queue.
 */
export function createDeadlineQueue(timeoutMs: number, now: () => number = Date.now): DeadlineQueue {
  let tail: Promise<void> = Promise.resolve();
  return <T>(operation: (deadlineAt: number) => Promise<T>) => {
    const deadlineAt = now() + timeoutMs;
    const guarded = () => now() >= deadlineAt
      ? Promise.reject<T>(new Error("human_access_timeout"))
      : operation(deadlineAt);
    const result = tail.then(guarded, guarded);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
