#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  defaultOpenCodeDbPath,
  findSessionById,
  openCodeSessionLocator,
  parseSinceCutoff,
} from '@razroo/iso-trace';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();

const USAGE = `job-forge trace — local OpenCode transcript observability

Usage:
  job-forge trace:list [--since 7d] [--cwd <dir>] [--json]
  job-forge trace:stats [<id-or-prefix>...] [--since 7d] [--cwd <dir>] [--json]
  job-forge trace:show <id-or-prefix> [--events <kinds>] [--grep <regex>]
  job-forge trace <iso-trace args...>

Common aliases default to OpenCode sessions for the current JobForge project.
Use "job-forge trace sources" or "job-forge trace where" for raw iso-trace passthrough.`;

const [cmd = 'help', ...args] = process.argv.slice(2);

function parseFilters(rawArgs) {
  const opts = { since: '7d', cwd: PROJECT_DIR, json: false };
  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--since') {
      opts.since = rawArgs[++i];
    } else if (arg.startsWith('--since=')) {
      opts.since = arg.slice('--since='.length);
    } else if (arg === '--cwd') {
      opts.cwd = rawArgs[++i];
    } else if (arg.startsWith('--cwd=')) {
      opts.cwd = arg.slice('--cwd='.length);
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg.startsWith('--')) {
      opts.error = `unknown flag "${arg}"`;
    } else {
      positional.push(arg);
    }
  }

  opts.cwd = resolve(opts.cwd || PROJECT_DIR);
  return { opts, positional };
}

function parseShowArgs(rawArgs) {
  const opts = {};
  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--events') {
      const raw = rawArgs[++i] || '';
      opts.events = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg.startsWith('--events=')) {
      const raw = arg.slice('--events='.length);
      opts.events = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg === '--grep') {
      opts.grep = compileRegex(rawArgs[++i], 'trace:show');
    } else if (arg.startsWith('--grep=')) {
      opts.grep = compileRegex(arg.slice('--grep='.length), 'trace:show');
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg.startsWith('--')) {
      opts.error = `unknown flag "${arg}"`;
    } else {
      positional.push(arg);
    }
  }

  return { opts, positional };
}

function compileRegex(pattern, context) {
  try {
    return new RegExp(pattern || '', 'i');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${context}: invalid --grep regex: ${message}`);
  }
}

async function discoverOpenCodeRefs(opts) {
  const dbPath = defaultOpenCodeDbPath();
  if (!existsSync(dbPath)) return [];

  const where = [
    's.time_archived is null',
    `s.directory = ${sqlString(resolve(opts.cwd || PROJECT_DIR))}`,
  ];
  const sinceMs = parseSinceCutoff(opts.since);
  if (sinceMs !== undefined) {
    where.push(`s.time_created >= ${Number(sinceMs)}`);
  }

  const rows = queryOpenCodeDb(dbPath, [
    'select',
    '  s.id,',
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
    source: {
      harness: 'opencode',
      format: 'opencode/sqlite-v1',
      path: openCodeSessionLocator(row.id, dbPath),
    },
    cwd: row.directory,
    startedAt: msToIso(row.time_created),
    endedAt: msToIso(row.time_updated),
    turnCount: row.turn_count ?? 0,
    sizeBytes: row.size_bytes ?? 0,
  }));
}

function queryOpenCodeDb(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 0) !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status ?? 1}`;
    throw new Error(`job-forge trace: sqlite3 query failed: ${detail}`);
  }
  return JSON.parse(result.stdout || '[]');
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function msToIso(ms) {
  return new Date(Number(ms)).toISOString();
}

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shorten(value, max) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function pad(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function printSessionTable(refs) {
  const rows = refs.map((ref) => [
    ref.id,
    ref.startedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z'),
    shorten(ref.cwd, 42),
    String(ref.turnCount),
    sizeLabel(ref.sizeBytes),
  ]);
  const header = ['id', 'started', 'cwd', 'turns', 'size'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));

  console.log(header.map((h, i) => pad(h, widths[i])).join('  '));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '));
  }
}

function printStats(result) {
  console.log(`sessions:  ${result.sessions}`);
  console.log(`turns:     ${result.turns}`);
  console.log(`duration:  ${Math.round(result.durationMs / 1000)}s`);
  console.log(`tokens:    input=${result.tokens.input} output=${result.tokens.output} cache_read=${result.tokens.cacheRead} cache_created=${result.tokens.cacheCreated}`);

  console.log('\ntool calls:');
  for (const [name, count] of Object.entries(result.toolCalls).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(name, 28)} ${count}`);
  }

  console.log('\nfile ops:');
  for (const [name, count] of Object.entries(result.fileOps).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(name, 8)} ${count}`);
  }
}

function computeOpenCodeStats(refs) {
  const result = {
    sessions: refs.length,
    turns: 0,
    durationMs: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreated: 0 },
    toolCalls: {},
    fileOps: {},
  };

  for (const ref of refs) {
    const rows = loadOpenCodeRows(ref.id);
    result.turns += rows.messages.length;
    result.durationMs += Math.max(0, Date.parse(ref.endedAt || ref.startedAt) - Date.parse(ref.startedAt));

    for (const row of rows.messages) {
      const data = parseJson(row.data);
      const tokens = data.tokens;
      if (!tokens || typeof tokens !== 'object') continue;
      result.tokens.input += Number(tokens.input || 0);
      result.tokens.output += Number(tokens.output || 0);
      result.tokens.cacheRead += Number(tokens.cache?.read || 0);
      result.tokens.cacheCreated += Number(tokens.cache?.write || 0);
    }

    for (const row of rows.parts) {
      const data = parseJson(row.data);
      if (data.type !== 'tool') continue;
      const toolName = data.tool || 'unknown';
      result.toolCalls[toolName] = (result.toolCalls[toolName] || 0) + 1;
      const op = fileOpForTool(toolName);
      if (op) result.fileOps[op] = (result.fileOps[op] || 0) + 1;
    }
  }

  return result;
}

function printOpenCodeSession(ref, opts) {
  const rows = loadOpenCodeRows(ref.id);
  console.log(`id:        ${ref.id}`);
  console.log(`source:    ${ref.source.harness} (${ref.source.format})`);
  console.log(`path:      ${ref.source.path}`);
  console.log(`cwd:       ${ref.cwd}`);
  console.log(`started:   ${ref.startedAt}`);
  if (ref.endedAt) console.log(`ended:     ${ref.endedAt}`);
  console.log(`turns:     ${rows.messages.length}`);
  console.log('');

  const events = openCodeEvents(rows);
  for (const event of events) {
    if (opts.events && !opts.events.has(event.kind)) continue;
    const line = formatOpenCodeEvent(event);
    if (opts.grep && !opts.grep.test(line)) continue;
    console.log(line);
  }
}

function loadOpenCodeRows(sessionId) {
  const dbPath = defaultOpenCodeDbPath();
  const id = sqlString(sessionId);
  return {
    messages: queryOpenCodeDb(dbPath, `select id, time_created, data from message where session_id = ${id} order by time_created, id`),
    parts: queryOpenCodeDb(dbPath, `select id, message_id, time_created, data from part where session_id = ${id} order by time_created, id`),
  };
}

function openCodeEvents(rows) {
  const events = [];

  for (const row of rows.messages) {
    const data = parseJson(row.data);
    const at = msToIso(row.time_created);
    const model = data.modelID && data.providerID ? `${data.providerID}/${data.modelID}` : undefined;
    const error = data.error?.data?.message || data.error?.message;
    events.push({
      kind: error ? 'error' : 'turn',
      at,
      text: error
        ? `${data.role || 'assistant'} ${data.agent || ''} ${model || ''}: ${error}`
        : `${data.role || 'unknown'} ${data.agent || ''} ${model || ''} finish=${data.finish || 'unknown'}`,
    });
    if (data.tokens) {
      events.push({
        kind: 'token_usage',
        at,
        text: `input=${data.tokens.input || 0} output=${data.tokens.output || 0} cache_read=${data.tokens.cache?.read || 0} cache_created=${data.tokens.cache?.write || 0}${model ? ` model=${model}` : ''}`,
      });
    }
  }

  for (const row of rows.parts) {
    const data = parseJson(row.data);
    const at = msToIso(row.time_created);
    if (data.type === 'text') {
      events.push({ kind: 'message', at, text: data.text || '' });
    } else if (data.type === 'reasoning') {
      events.push({ kind: 'reasoning', at, text: data.text || '' });
    } else if (data.type === 'tool') {
      const status = data.state?.status ? ` status=${data.state.status}` : '';
      const input = data.state?.input ? ` ${JSON.stringify(data.state.input)}` : '';
      const output = data.state?.output ? ` => ${data.state.output}` : '';
      events.push({ kind: 'tool_call', at, text: `${data.tool || 'unknown'}${status}${input}${output}` });
      const op = fileOpForTool(data.tool);
      if (op) events.push({ kind: 'file_op', at, text: `${op} ${filePathFromTool(data) || ''}`.trim() });
    } else if (data.__parseError) {
      events.push({ kind: 'error', at, text: `unparseable part JSON: ${data.__parseError}` });
    } else {
      events.push({ kind: data.type || 'part', at, text: JSON.stringify(data) });
    }
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

function formatOpenCodeEvent(event) {
  return `${event.at} ${event.kind}: ${oneLine(event.text, 360)}`;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { __parseError: message, __raw: raw };
  }
}

function fileOpForTool(toolName) {
  if (toolName === 'read') return 'read';
  if (toolName === 'write') return 'write';
  if (toolName === 'edit') return 'edit';
  if (toolName === 'glob') return 'list';
  if (toolName === 'grep') return 'search';
  return undefined;
}

function filePathFromTool(part) {
  const input = part.state?.input;
  if (!input || typeof input !== 'object') return undefined;
  return input.filePath || input.path || input.pattern;
}

function oneLine(value, max) {
  return shorten(String(value ?? '').replace(/\s+/g, ' ').trim(), max);
}

function resolveIsoTraceCli() {
  const pkgJsonPath = require.resolve('@razroo/iso-trace/package.json');
  return join(dirname(pkgJsonPath), 'dist/cli.js');
}

function passthroughIsoTrace(rawArgs) {
  const cliPath = resolveIsoTraceCli();
  const result = spawnSync(process.execPath, [cliPath, ...rawArgs], {
    stdio: 'inherit',
    cwd: PROJECT_DIR,
    env: process.env,
  });
  return result.status ?? 1;
}

async function main() {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return 0;
  }

  if (cmd === 'list') {
    const { opts } = parseFilters(args);
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge trace:list: ${opts.error}`);
      return 2;
    }
    const refs = await discoverOpenCodeRefs(opts);
    if (opts.json) {
      console.log(JSON.stringify(refs, null, 2));
      return 0;
    }
    if (refs.length === 0) {
      console.error('job-forge trace:list: no OpenCode sessions found for this project');
      return 2;
    }
    printSessionTable(refs);
    return 0;
  }

  if (cmd === 'stats') {
    const { opts, positional } = parseFilters(args);
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge trace:stats: ${opts.error}`);
      return 2;
    }
    const refs = await discoverOpenCodeRefs(opts);
    const selected = positional.length === 0
      ? refs
      : positional.map((id) => {
          const ref = findSessionById(refs, id);
          if (!ref) throw new Error(`job-forge trace:stats: no OpenCode session matches "${id}"`);
          return ref;
        });
    const result = computeOpenCodeStats(selected);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printStats(result);
    }
    return 0;
  }

  if (cmd === 'show') {
    const { opts, positional } = parseShowArgs(args);
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge trace:show: ${opts.error}`);
      return 2;
    }
    if (opts.grep instanceof Error) {
      console.error(opts.grep.message);
      return 2;
    }
    if (positional.length === 0) {
      console.error('job-forge trace:show: missing <id-or-prefix>');
      return 2;
    }
    const refs = await discoverOpenCodeRefs({ cwd: PROJECT_DIR, since: undefined });
    const ref = findSessionById(refs, positional[0]);
    if (!ref) {
      console.error(`job-forge trace:show: no OpenCode session matches "${positional[0]}"`);
      return 2;
    }
    printOpenCodeSession(ref, opts);
    return 0;
  }

  return passthroughIsoTrace([cmd, ...args]);
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
