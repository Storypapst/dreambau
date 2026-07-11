#!/usr/bin/env node
import argon2 from "argon2";
let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (password.length < 8) throw new Error("Password must contain at least eight characters");
process.stdout.write(await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }));
