import http from "node:http";
import https from "node:https";
import request from "supertest";
import express from "express";
import { describe, expect, it } from "vitest";

describe("test http agents", () => {
  it("pools no sockets, so a closed server's socket cannot be reused", () => {
    // Without this a socket outlives the ephemeral server it was opened
    // against and poisons a later request that draws it from the pool.
    expect(http.globalAgent.keepAlive).toBe(false);
    expect(https.globalAgent.keepAlive).toBe(false);
  });

  it("leaves no idle sockets behind after a request completes", async () => {
    const app = express();
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    await request(app).get("/ping").expect(200, { ok: true });

    expect(Object.keys(http.globalAgent.freeSockets)).toHaveLength(0);
  });
});
