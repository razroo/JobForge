#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const help = spawnSync("iso-route", ["--help"], { encoding: "utf8" });
const helpText = `${help.stdout ?? ""}\n${help.stderr ?? ""}`;

if (help.status === 0 && /\bverify\b/.test(helpText)) {
  run("iso-route", ["verify", "models.yaml"]);
} else {
  const out = mkdtempSync(join(tmpdir(), "jobforge-iso-route-"));
  try {
    console.log("iso-route verify is unavailable in the installed CLI; using build --dry-run as the model-policy validation smoke.");
    run("iso-route", ["build", "models.yaml", "--out", out, "--dry-run"]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
