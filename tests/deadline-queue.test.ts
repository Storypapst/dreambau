import { describe, expect, it, vi } from "vitest";
import { createDeadlineQueue } from "../src/server/deadline-queue.js";

describe("deadline queue", () => {
  it("includes queue wait time in every caller's deadline", async () => {
    let now = 1_000;
    let rejectFirst!: (error: Error) => void;
    const queue = createDeadlineQueue(10, () => now, () => new Error("test_deadline_expired"));
    const firstOperation = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectFirst = reject; }));
    const queuedOperation = vi.fn(async () => "too-late");

    const first = queue(firstOperation);
    const queued = queue(queuedOperation);
    await vi.waitFor(() => expect(firstOperation).toHaveBeenCalledOnce());
    expect(queuedOperation).not.toHaveBeenCalled();

    now = 1_010;
    rejectFirst(new Error("offline"));

    await expect(first).rejects.toThrow("offline");
    await expect(queued).rejects.toThrow("test_deadline_expired");
    expect(queuedOperation).not.toHaveBeenCalled();
  });

  it("runs queued work with the deadline captured when it was enqueued", async () => {
    let now = 1_000;
    let resolveFirst!: () => void;
    const queue = createDeadlineQueue(10, () => now);
    const first = queue(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    const queuedOperation = vi.fn(async (deadlineAt: number) => deadlineAt);
    const queued = queue(queuedOperation);

    await vi.waitFor(() => expect(resolveFirst).toBeTypeOf("function"));
    now = 1_005;
    resolveFirst();

    await expect(first).resolves.toBeUndefined();
    await expect(queued).resolves.toBe(1_010);
    expect(queuedOperation).toHaveBeenCalledWith(1_010);
  });

  it("continues the queue after a predecessor rejects before the deadline", async () => {
    let now = 1_000;
    let rejectFirst!: (error: Error) => void;
    const queue = createDeadlineQueue(10, () => now);
    const first = queue(() => new Promise<never>((_resolve, reject) => { rejectFirst = reject; }));
    const queuedOperation = vi.fn(async () => "continued");
    const queued = queue(queuedOperation);

    await vi.waitFor(() => expect(rejectFirst).toBeTypeOf("function"));
    now = 1_005;
    rejectFirst(new Error("offline"));

    await expect(first).rejects.toThrow("offline");
    await expect(queued).resolves.toBe("continued");
    expect(queuedOperation).toHaveBeenCalledOnce();
  });
});
