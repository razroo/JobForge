#!/usr/bin/env node

import { PROJECT_DIR } from '../tracker-lib.mjs';
import {
  formatJobForgeContextBundle,
  formatJobForgeContextPlan,
  jobForgeContextPath,
  listJobForgeContextBundles,
  planJobForgeContextBundle,
  renderJobForgeContextPlan,
  resolveJobForgeContextBundle,
} from '../lib/jobforge-context.mjs';

const USAGE = `job-forge context - deterministic mode/reference context policy

Usage:
  job-forge context:list [--json]
  job-forge context:explain <bundle> [--json]
  job-forge context:plan <bundle> [--root <dir>] [--budget N] [--chars-per-token N] [--json]
  job-forge context:check <bundle> [--root <dir>] [--budget N] [--chars-per-token N] [--json]
  job-forge context:render <bundle> [--root <dir>] [--target markdown|json] [--json]
  job-forge context:path

The policy is templates/context.json. It is local project policy, not an MCP
and not always-loaded prompt context.`;

const [cmd = 'help', ...rawArgs] = process.argv.slice(2);
const { positional, opts } = parseArgs(rawArgs);

if (opts.help || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(USAGE);
  process.exit(0);
}

try {
  if (cmd === 'path') {
    console.log(jobForgeContextPath(PROJECT_DIR));
  } else if (cmd === 'list') {
    list(opts);
  } else if (cmd === 'explain') {
    explain(positional, opts);
  } else if (cmd === 'plan') {
    plan(positional, opts, false);
  } else if (cmd === 'check') {
    check(positional, opts);
  } else if (cmd === 'render') {
    render(positional, opts);
  } else {
    console.error(`unknown context command "${cmd}"\n`);
    console.error(USAGE);
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(args) {
  const positional = [];
  const opts = {
    json: false,
    help: false,
    target: 'markdown',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--root') {
      opts.root = valueAfter(args, ++i, '--root');
    } else if (arg.startsWith('--root=')) {
      opts.root = arg.slice('--root='.length);
    } else if (arg === '--budget' || arg === '--token-budget') {
      opts.tokenBudget = parsePositiveInteger(valueAfter(args, ++i, arg), arg);
    } else if (arg.startsWith('--budget=')) {
      opts.tokenBudget = parsePositiveInteger(arg.slice('--budget='.length), '--budget');
    } else if (arg.startsWith('--token-budget=')) {
      opts.tokenBudget = parsePositiveInteger(arg.slice('--token-budget='.length), '--token-budget');
    } else if (arg === '--chars-per-token') {
      opts.charsPerToken = parsePositiveInteger(valueAfter(args, ++i, '--chars-per-token'), '--chars-per-token');
    } else if (arg.startsWith('--chars-per-token=')) {
      opts.charsPerToken = parsePositiveInteger(arg.slice('--chars-per-token='.length), '--chars-per-token');
    } else if (arg === '--target') {
      opts.target = parseTarget(valueAfter(args, ++i, '--target'));
    } else if (arg.startsWith('--target=')) {
      opts.target = parseTarget(arg.slice('--target='.length));
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag "${arg}"`);
    } else {
      positional.push(arg);
    }
  }

  return { positional, opts };
}

function valueAfter(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function list(opts) {
  const names = listJobForgeContextBundles(PROJECT_DIR);
  if (opts.json) {
    console.log(JSON.stringify(names, null, 2));
    return;
  }
  console.log(names.join('\n'));
}

function explain(positional, opts) {
  const bundle = readBundle(positional);
  if (opts.json) {
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }
  console.log(formatJobForgeContextBundle(bundle));
}

function plan(positional, opts, includeContent) {
  const bundleName = readBundleName(positional);
  const result = planJobForgeContextBundle(bundleName, planOptions(opts, includeContent), PROJECT_DIR);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  console.log(formatJobForgeContextPlan(result));
  return result;
}

function check(positional, opts) {
  const result = plan(positional, opts, false);
  process.exit(result.ok ? 0 : 1);
}

function render(positional, opts) {
  const bundleName = readBundleName(positional);
  const result = planJobForgeContextBundle(bundleName, planOptions(opts, true), PROJECT_DIR);
  const text = renderJobForgeContextPlan(result, opts.target);
  if (opts.json) {
    console.log(JSON.stringify({ target: opts.target, plan: result, text }, null, 2));
  } else {
    console.log(text);
  }
  process.exit(result.ok ? 0 : 1);
}

function readBundle(positional) {
  return resolveJobForgeContextBundle(readBundleName(positional), PROJECT_DIR);
}

function readBundleName(positional) {
  const bundleName = positional[0];
  if (!bundleName) throw new Error('missing bundle name');
  return bundleName;
}

function planOptions(opts, includeContent) {
  return {
    root: opts.root || PROJECT_DIR,
    includeContent,
    tokenBudget: opts.tokenBudget,
    charsPerToken: opts.charsPerToken,
  };
}

function parseTarget(value) {
  if (value === 'markdown' || value === 'json') return value;
  throw new Error('--target must be markdown or json');
}

function parsePositiveInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${flag} must be a positive integer`);
  return number;
}
