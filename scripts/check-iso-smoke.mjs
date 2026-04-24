#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const files = {
  instructions: readFileSync(resolve(root, "iso/instructions.md"), "utf8"),
  apply: readFileSync(resolve(root, "modes/apply.md"), "utf8"),
  models: readFileSync(resolve(root, "models.yaml"), "utf8"),
  config: readFileSync(resolve(root, "iso/config.json"), "utf8"),
};

const checks = [
  ["root defines H1-H7", () => every(files.instructions, ["[H1]", "[H2]", "[H3]", "[H4]", "[H5]", "[H6]", "[H7]"])],
  ["H1 caps dispatches at 2", () => /Max 2 parallel `task` dispatches/.test(files.instructions)],
  ["H2 checks all duplicate sources", () => every(files.instructions, ["data/pipeline.md", "data/applications/*.md", "batch/tracker-additions/*.tsv", "batch/tracker-additions/merged/*.tsv"])],
  ["H3 names Geometra cleanup calls", () => every(files.instructions, ["geometra_list_sessions", "geometra_disconnect({closeBrowser: true})"])],
  ["H4 blocks orchestrator form filling", () => every(files.instructions, ["MUST NOT call `geometra_fill_form`", "`geometra_run_actions`", "`geometra_fill_otp`"])],
  ["H5 blocks same-company concurrent retry", () => every(files.instructions, ["Re-dispatch the same company only AFTER", "previous subagent returns"])],
  ["H6 requires merge and verify", () => every(files.instructions, ["batch/tracker-additions/*.tsv", "npx job-forge merge", "npx job-forge verify"])],
  ["H7 distrusts subagent prose", () => every(files.instructions, ["must originate from a file", "not from prior subagent prose"])],
  ["shared prompt points to on-demand references", () => every(files.instructions, ["modes/{mode}.md", "modes/reference-setup.md", "modes/reference-portals.md", "modes/reference-geometra.md"])],
  ["apply mode owns high-stakes upgrade", () => every(files.apply, ["[D8]", "@general-paid", "4.0/5", "high-stakes"])],
  ["apply mode owns provider downgrade", () => every(files.apply, ["[D9]", "@general-free", "HTTP 402/429", "insufficient credits/funds/balance"])],
  ["models policy extends free OpenRouter preset", () => /extends:\s*openrouter-free/.test(files.models)],
  ["OpenCode fallback plugin is configured", () => every(files.config, ["opencodeModelFallback", "@razroo/opencode-model-fallback"])],
];

const failures = checks
  .filter(([, check]) => !check())
  .map(([name]) => name);

if (failures.length > 0) {
  console.error("JobForge iso smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`JobForge iso smoke passed (${checks.length} checks).`);

function every(source, needles) {
  return needles.every((needle) => source.includes(needle));
}
