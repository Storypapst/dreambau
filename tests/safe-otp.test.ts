import { describe, expect, it, vi } from "vitest";
import { requestSafeOtp } from "../src/client/safe-otp.js";
import { requestSafeOtpCode } from "../src/server/playwright-login-broker.js";

describe("safe TOTP window", () => {
  it("waits for the next client code when fewer than eight seconds remain", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        accountId: "oriso/dev/spider.pig",
        source: "totp",
        code: "111111",
        generatedAt: "2026-07-30T08:00:00.000Z",
        expiresAt: "2026-07-30T08:00:30.000Z"
      })
      .mockResolvedValueOnce({
        accountId: "oriso/dev/spider.pig",
        source: "totp",
        code: "222222",
        generatedAt: "2026-07-30T08:00:30.000Z",
        expiresAt: "2026-07-30T08:01:00.000Z"
      });
    const sleep = vi.fn(async () => {});
    const onWait = vi.fn();
    const value = await requestSafeOtp(request, {
      now: () => new Date("2026-07-30T08:00:25.000Z").getTime(),
      sleep,
      onWait
    });
    expect(value.code).toBe("222222");
    expect(sleep).toHaveBeenCalledWith(5_150);
    expect(onWait).toHaveBeenCalledWith(new Date("2026-07-30T08:00:30.000Z").getTime());
  });

  it("makes the broker submit only the refreshed safe code", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        source: "totp",
        code: "111111",
        expiresAt: "2026-07-30T08:00:30.000Z"
      })
      .mockResolvedValueOnce({
        source: "totp",
        code: "222222",
        expiresAt: "2026-07-30T08:01:00.000Z"
      });
    const sleep = vi.fn(async () => {});
    await expect(requestSafeOtpCode(request, {
      now: () => new Date("2026-07-30T08:00:25.000Z").getTime(),
      sleep
    })).resolves.toBe("222222");
    expect(sleep).toHaveBeenCalledWith(5_150);
  });

  it("does not delay mail OTPs", async () => {
    const sleep = vi.fn(async () => {});
    await expect(requestSafeOtpCode(async () => ({
      source: "mail",
      code: "654321",
      expiresAt: "2026-07-30T08:00:01.000Z"
    }), {
      now: () => new Date("2026-07-30T08:00:00.500Z").getTime(),
      sleep
    })).resolves.toBe("654321");
    expect(sleep).not.toHaveBeenCalled();
  });
});
