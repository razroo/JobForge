#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { audit, formatAuditResult, formatPolicyExplanation, loadPolicy, resultFails } from '@razroo/iso-guard';
import { defaultOpenCodeDbPath, findSessionById, parseSinceCutoff } from '@razroo/iso-trace';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();
const DEFAULT_SINCE = '24h';

const USAGE = `job-forge guard - deterministic JobForge policy audits over local OpenCode traces

Usage:
  job-forge guard:audit [latest|<id-or-prefix>] [--since 24h] [--cwd <dir>] [--policy <path>] [--json] [--fail-on error|warn|off] [--root-only]
  job-forge guard:explain [--policy <path>] [--json]

The default policy is templates/guards/jobforge-baseline.yaml. Guard audits are
local-only and passive: JobForge converts OpenCode SQLite rows into iso-guard
events and never asks agents or MCPs to emit extra telemetry.`;

const [cmd = 'help', ...args] = process.argv.slice(2);

function defaultPolicyPath() {
  return join(PKG_ROOT, 'templates/guards/jobforge-baseline.yaml');
}

function parseArgs(rawArgs, { allowSession = false } = {}) {
  const opts = {
    since: DEFAULT_SINCE,
    cwd: PROJECT_DIR,
    policy: defaultPolicyPath(),
    json: false,
    failOn: 'error',
    includeChildren: true,
  };
  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--since') {
      opts.since = valueAfter(rawArgs, ++i, '--since');
    } else if (arg.startsWith('--since=')) {
      opts.since = arg.slice('--since='.length);
    } else if (arg === '--cwd') {
      opts.cwd = valueAfter(rawArgs, ++i, '--cwd');
    } else if (arg.startsWith('--cwd=')) {
      opts.cwd = arg.slice('--cwd='.length);
    } else if (arg === '--policy') {
      opts.policy = valueAfter(rawArgs, ++i, '--policy');
    } else if (arg.startsWith('--policy=')) {
      opts.policy = arg.slice('--policy='.length);
    } else if (arg === '--fail-on') {
      opts.failOn = valueAfter(rawArgs, ++i, '--fail-on');
    } else if (arg.startsWith('--fail-on=')) {
      opts.failOn = arg.slice('--fail-on='.length);
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--root-only') {
      opts.includeChildren = false;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg.startsWith('--')) {
      opts.error = `unknown flag "${arg}"`;
    } else if (allowSession) {
      positional.push(arg);
    } else {
      opts.error = `unexpected argument "${arg}"`;
    }
  }

  opts.cwd = resolve(opts.cwd || PROJECT_DIR);
  opts.policy = resolve(opts.policy || defaultPolicyPath());
  if (!['error', 'warn', 'off'].includes(opts.failOn)) {
    opts.error = '--fail-on must be one of: error, warn, off';
  }
  return { opts, positional };
}

function valueAfter(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function queryOpenCodeDb(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if ((result.status ?? 0) !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status ?? 1}`;
    throw new Error(`job-forge guard: sqlite3 query failed: ${detail}`);
  }
  return JSON.parse(result.stdout || '[]');
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function msToIso(ms) {
  return new Date(Number(ms)).toISOString();
}

function discoverSessions(opts, { includeAllForShow = false } = {}) {
  const dbPath = defaultOpenCodeDbPath();
  if (!existsSync(dbPath)) return [];

  const where = [
    's.time_archived is null',
    `s.directory = ${sqlString(opts.cwd)}`,
  ];
  const sinceMs = includeAllForShow ? undefined : parseSinceCutoff(opts.since);
  if (sinceMs !== undefined) where.push(`s.time_created >= ${Number(sinceMs)}`);

  const rows = queryOpenCodeDb(dbPath, [
    'select',
    '  s.id,',
    '  s.parent_id,',
    '  s.title,',
    '  s.directory,',
    '  s.time_created,',
    '  s.time_updated,',
    '  (select count(*) from message m where m.session_id = s.id) as turn_count,',
    '  (',
    '    (select coalesce(sum(length(data)), 0) from message m where m.session_id = s.id) +',
    '    (select coalesce(sum(length(data)), 0) from part p where p.session_id = s.id)',
    '  ) as size_bytes',
    'from session s',
    `where ${where.join(' and ')}`,
    'order by s.time_updated desc',
  ].join(' '));

  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id || null,
    title: row.title || '',
    cwd: row.directory,
    startedAt: msToIso(row.time_created),
    startedAtMs: Number(row.time_created),
    endedAt: msToIso(row.time_updated),
    endedAtMs: Number(row.time_updated),
    turnCount: row.turn_count ?? 0,
    sizeBytes: row.size_bytes ?? 0,
  }));
}

function loadRows(sessionId) {
  const dbPath = defaultOpenCodeDbPath();
  const id = sqlString(sessionId);
  return {
    messages: queryOpenCodeDb(dbPath, `select id, time_created, data from message where session_id = ${id} order by time_created, id`),
    parts: queryOpenCodeDb(dbPath, `select id, message_id, time_created, data from part where session_id = ${id} order by time_created, id`),
  };
}

function parseJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { __parseError: message, __raw: raw || '' };
  }
}

function selectSession(refs, positional) {
  const requested = positional[0];
  if (!requested || requested === 'latest') {
    return refs.find((ref) => !ref.parentId) || refs[0] || null;
  }
  return findSessionById(refs, requested);
}

function sessionsForAudit(selected, allSessions, includeChildren) {
  if (!includeChildren) return [selected];
  const children = allSessions
    .filter((candidate) => candidate.parentId === selected.id)
    .sort((a, b) => a.startedAtMs - b.startedAtMs);
  return [selected, ...children];
}

function buildGuardEvents(sessions) {
  const events = [];
  const rootId = sessions[0]?.id;

  for (const session of sessions) {
    const rows = loadRows(session.id);
    const messages = rows.messages.map((row) => ({ row, data: parseJson(row.data) }));
    const messageById = new Map(messages.map((message) => [message.row.id, message.data]));
    let requestIndex = 0;

    for (const row of rows.parts) {
      const data = parseJson(row.data);
      const message = messageById.get(row.message_id) || {};
      const role = message.role || 'unknown';
      const at = msToIso(row.time_created);
      const base = {
        sessionId: session.id,
        sessionTitle: session.title,
        parentId: session.parentId,
        isChildSession: session.id !== rootId,
        role,
        messageId: row.message_id,
        sessionMessageId: `${session.id}:${row.message_id}`,
        partId: row.id,
        requestIndex,
      };

      if (data.type === 'text') {
        if (role === 'user') requestIndex += 1;
        events.push({
          type: 'message',
          name: role,
          at,
          source: `opencode:${session.id}`,
          text: data.text || '',
          data: { ...base, requestIndex },
        });
        continue;
      }

      if (data.type === 'tool') {
        const input = objectOrEmpty(data.state?.input);
        const metadata = objectOrEmpty(data.state?.metadata);
        const toolName = data.tool || 'unknown';
        const text = toolText(toolName, input, metadata, data.state);
        const toolEvent = {
          type: 'tool_call',
          name: toolName,
          at,
          source: `opencode:${session.id}`,
          text,
          data: {
            ...base,
            tool: toolName,
            status: stringValue(data.state?.status),
            input,
            metadata,
          },
        };
        events.push(toolEvent);
        events.push(...derivedToolEvents(toolEvent));
      }
    }
  }

  return events
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
    .map((event, index) => ({ ...event, index }));
}

function derivedToolEvents(event) {
  const text = event.text || '';
  const events = [];
  if (runsCommand(text, /\b(npx\s+)?job-forge\s+merge\b|\bnpm\s+run\s+merge\b/)) {
    events.push(derivedToolEvent(event, 'job-forge-merge'));
  }
  if (runsCommand(text, /\b(npx\s+)?job-forge\s+verify\b|\bnpm\s+run\s+verify\b/)) {
    events.push(derivedToolEvent(event, 'job-forge-verify'));
  }
  if (runsCommand(text, /\bgeometra_disconnect\b/)) {
    events.push(derivedToolEvent(event, 'geometra_disconnect'));
  }
  if (runsCommand(text, /\bgeometra_list_sessions\b/)) {
    events.push(derivedToolEvent(event, 'geometra_list_sessions'));
  }
  return events;
}

function derivedToolEvent(event, name) {
  return {
    ...event,
    name,
    data: {
      ...(event.data || {}),
      derivedFrom: event.name,
    },
  };
}

function runsCommand(text, pattern) {
  return /(^|[\s"])(bash|shell|exec|command|terminal|run_command)\b/i.test(text) && pattern.test(text);
}

function toolText(toolName, input, metadata, state) {
  const fragments = [toolName, safeJson(input), safeJson(metadata)];
  if (state?.output && typeof state.output === 'string') fragments.push(state.output);
  return fragments.filter(Boolean).join('\n');
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function printablePath(path) {
  const rel = relative(PROJECT_DIR, path);
  return rel && !rel.startsWith('..') ? rel : path;
}

function printAudit({ selected, includedSessions, policy, result }) {
  const children = includedSessions.length - 1;
  console.log(`session: ${selected.id}${selected.title ? ` (${selected.title})` : ''}`);
  if (children > 0) console.log(`children: ${children}`);
  console.log(`policy:  ${printablePath(policy.sourcePath || defaultPolicyPath())}`);
  console.log(formatAuditResult(result));
}

async function main() {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return 0;
  }

  if (cmd === 'explain') {
    const { opts } = parseArgs(args);
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge guard:explain: ${opts.error}`);
      return 2;
    }
    const policy = loadPolicy(opts.policy);
    if (opts.json) {
      console.log(JSON.stringify(policy, null, 2));
    } else {
      console.log(formatPolicyExplanation(policy));
    }
    return 0;
  }

  if (cmd === 'audit') {
    const { opts, positional } = parseArgs(args, { allowSession: true });
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge guard:audit: ${opts.error}`);
      return 2;
    }
    const refs = discoverSessions(opts, { includeAllForShow: Boolean(positional[0] && positional[0] !== 'latest') });
    if (refs.length === 0) {
      console.error('job-forge guard:audit: no OpenCode sessions found for this project');
      return 2;
    }
    const selected = selectSession(refs, positional);
    if (!selected) {
      console.error(`job-forge guard:audit: no OpenCode session matches "${positional[0]}"`);
      return 2;
    }
    const includedSessions = sessionsForAudit(selected, refs, opts.includeChildren);
    const policy = loadPolicy(opts.policy);
    const events = buildGuardEvents(includedSessions);
    const result = audit(policy, events);

    if (opts.json) {
      console.log(JSON.stringify({
        session: selected,
        includedSessions: includedSessions.map((session) => ({
          id: session.id,
          parentId: session.parentId,
          title: session.title,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
        })),
        policy: policy.sourcePath,
        result,
      }, null, 2));
    } else {
      printAudit({ selected, includedSessions, policy, result });
    }
    return resultFails(result, opts.failOn) ? 1 : 0;
  }

  console.error(`job-forge guard: unknown command "${cmd}"`);
  console.error(USAGE);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
