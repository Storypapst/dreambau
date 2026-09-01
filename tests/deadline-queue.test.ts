import { describe, expect, it, vi } from "vitest";
import { createDeadlineQueue } from "../src/server/deadline-queue.js";

describe("deadline queue", () => {
  it("includes queue wait time in every caller's deadline", async () => {
    let now = 1_000;
    let rejectFirst!: (error: Error) => void;
    const queue = createDeadlineQueue(10, () => now);
    const firstOperation = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectFirst = reject; }));
    const queuedOperation = vi.fn(async () => "too-late");

    const first = queue(firstOperation);
    const queued = queue(queuedOperation);
    await vi.waitFor(() => expect(firstOperation).toHaveBeenCalledOnce());
    expect(queuedOperation).not.toHaveBeenCalled();

    now = 1_010;
    rejectFirst(new Error("offline"));

    await expect(first).rejects.toThrow("offline");
    await expect(queued).rejects.toThrow("human_access_timeout");
    expect(queuedOperation).not.toHaveBeenCalled();
  });
});
