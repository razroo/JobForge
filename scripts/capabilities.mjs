#!/usr/bin/env node

import { PROJECT_DIR } from '../tracker-lib.mjs';
import {
  checkJobForgeCapability,
  formatJobForgeCapabilityCheck,
  formatJobForgeCapabilityRole,
  jobForgeCapabilitiesPath,
  listJobForgeCapabilityRoles,
  renderJobForgeCapabilityRole,
  resolveJobForgeCapabilityRole,
} from '../lib/jobforge-capabilities.mjs';

const USAGE = `job-forge capabilities - deterministic role capability policy

Usage:
  job-forge capabilities:list [--json]
  job-forge capabilities:explain <role> [--json]
  job-forge capabilities:check <role> [--tool <name>] [--mcp <name>] [--command <cmd>] [--filesystem read|write] [--network off|restricted|on] [--json]
  job-forge capabilities:render <role> [--target markdown|claude|codex|cursor|opencode|json] [--json]
  job-forge capabilities:path

The policy is templates/capabilities.json. It is local project state, not an
MCP and not prompt context.`;

const [cmd = 'help', ...rawArgs] = process.argv.slice(2);
const { positional, opts } = parseArgs(rawArgs);

if (opts.help || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(USAGE);
  process.exit(0);
}

try {
  if (cmd === 'path') {
    console.log(jobForgeCapabilitiesPath(PROJECT_DIR));
  } else if (cmd === 'list') {
    list(opts);
  } else if (cmd === 'explain') {
    explain(positional, opts);
  } else if (cmd === 'check') {
    check(positional, opts);
  } else if (cmd === 'render') {
    render(positional, opts);
  } else {
    console.error(`unknown capabilities command "${cmd}"\n`);
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
    tools: [],
    mcp: [],
    commands: [],
    filesystem: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--tool') {
      opts.tools.push(valueAfter(args, ++i, '--tool'));
    } else if (arg.startsWith('--tool=')) {
      opts.tools.push(arg.slice('--tool='.length));
    } else if (arg === '--mcp') {
      opts.mcp.push(valueAfter(args, ++i, '--mcp'));
    } else if (arg.startsWith('--mcp=')) {
      opts.mcp.push(arg.slice('--mcp='.length));
    } else if (arg === '--command') {
      opts.commands.push(valueAfter(args, ++i, '--command'));
    } else if (arg.startsWith('--command=')) {
      opts.commands.push(arg.slice('--command='.length));
    } else if (arg === '--filesystem') {
      opts.filesystem.push(parseFilesystem(valueAfter(args, ++i, '--filesystem')));
    } else if (arg.startsWith('--filesystem=')) {
      opts.filesystem.push(parseFilesystem(arg.slice('--filesystem='.length)));
    } else if (arg === '--network') {
      opts.network = parseNetwork(valueAfter(args, ++i, '--network'));
    } else if (arg.startsWith('--network=')) {
      opts.network = parseNetwork(arg.slice('--network='.length));
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
  const names = listJobForgeCapabilityRoles(PROJECT_DIR);
  if (opts.json) {
    console.log(JSON.stringify(names, null, 2));
    return;
  }
  console.log(names.join('\n'));
}

function explain(positional, opts) {
  const role = readRole(positional);
  if (opts.json) {
    console.log(JSON.stringify(role, null, 2));
    return;
  }
  console.log(formatJobForgeCapabilityRole(role));
}

function check(positional, opts) {
  const roleName = positional[0];
  if (!roleName) throw new Error('missing role name');
  const request = requestFromOptions(opts);
  if (!hasRequest(request)) {
    throw new Error('capabilities:check requires at least one --tool, --mcp, --command, --filesystem, or --network');
  }
  const result = checkJobForgeCapability(roleName, request, PROJECT_DIR);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatJobForgeCapabilityCheck(result));
  }
  process.exit(result.ok ? 0 : 1);
}

function render(positional, opts) {
  const role = readRole(positional);
  const text = renderJobForgeCapabilityRole(role, opts.target);
  if (opts.json) {
    console.log(JSON.stringify({ target: opts.target, role, text }, null, 2));
    return;
  }
  console.log(text);
}

function readRole(positional) {
  const roleName = positional[0];
  if (!roleName) throw new Error('missing role name');
  return resolveJobForgeCapabilityRole(roleName, PROJECT_DIR);
}

function requestFromOptions(opts) {
  return {
    tools: opts.tools.length ? opts.tools : undefined,
    mcp: opts.mcp.length ? opts.mcp : undefined,
    commands: opts.commands.length ? opts.commands : undefined,
    filesystem: opts.filesystem.length ? opts.filesystem : undefined,
    network: opts.network,
  };
}

function hasRequest(request) {
  return Boolean(
    request.tools?.length ||
    request.mcp?.length ||
    request.commands?.length ||
    request.filesystem?.length ||
    request.network,
  );
}

function parseFilesystem(value) {
  if (value === 'read' || value === 'write') return value;
  throw new Error('--filesystem must be read or write');
}

function parseNetwork(value) {
  if (value === 'off' || value === 'restricted' || value === 'on') return value;
  throw new Error('--network must be off, restricted, or on');
}

function parseTarget(value) {
  if (
    value === 'markdown' ||
    value === 'claude' ||
    value === 'codex' ||
    value === 'cursor' ||
    value === 'opencode' ||
    value === 'json'
  ) {
    return value;
  }
  throw new Error('--target must be markdown, claude, codex, cursor, opencode, or json');
}
