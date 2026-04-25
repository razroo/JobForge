#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { defaultOpenCodeDbPath, findSessionById, parseSinceCutoff } from '@razroo/iso-trace';

const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();
const DEFAULT_SINCE = '24h';

const USAGE = `job-forge telemetry — JobForge pipeline view over local OpenCode traces

Usage:
  job-forge telemetry:list [--since 24h] [--cwd <dir>] [--json]
  job-forge telemetry:status [--since 24h] [--cwd <dir>] [--json]
  job-forge telemetry:show <id-or-prefix> [--cwd <dir>] [--json]
  job-forge telemetry:watch [--since 24h] [--cwd <dir>] [--interval 5]

Telemetry is local-only and passive. It derives status from OpenCode's SQLite DB
plus JobForge tracker files; agents do not need to emit custom events.`;

const [cmd = 'help', ...args] = process.argv.slice(2);

function parseArgs(rawArgs, { allowSession = false, allowInterval = false } = {}) {
  const opts = { since: DEFAULT_SINCE, cwd: PROJECT_DIR, json: false, interval: 5 };
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
    } else if (allowInterval && arg === '--interval') {
      opts.interval = Number(rawArgs[++i] || 5);
    } else if (allowInterval && arg.startsWith('--interval=')) {
      opts.interval = Number(arg.slice('--interval='.length));
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
  if (!Number.isFinite(opts.interval) || opts.interval < 1) opts.interval = 5;
  return { opts, positional };
}

function queryOpenCodeDb(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 24 * 1024 * 1024,
  });
  if ((result.status ?? 0) !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status ?? 1}`;
    throw new Error(`job-forge telemetry: sqlite3 query failed: ${detail}`);
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
    endedAt: msToIso(row.time_updated),
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

function analyzeSession(session, allSessions, opts) {
  const rows = loadRows(session.id);
  const messages = rows.messages.map((row) => ({ row, data: parseJson(row.data) }));
  const parts = rows.parts.map((row) => ({ row, data: parseJson(row.data) }));
  const messageById = new Map(messages.map((m) => [m.row.id, m.data]));
  const textParts = parts.filter((p) => p.data.type === 'text');
  const userPrompt = firstUserText(textParts, messageById);
  const taskCalls = parts.filter((p) => p.data.type === 'tool' && p.data.tool === 'task').map(taskCallSummary);
  const providerErrors = messages.map(providerErrorSummary).filter(Boolean);
  const policyIssues = detectPolicyIssues(session, parts, textParts, messageById, providerErrors);
  const tracker = trackerStatus(opts.cwd);
  const children = allSessions
    .filter((candidate) => candidate.parentId === session.id)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((child) => childSummary(child));
  const childOutcomes = children.filter((child) => child.outcome !== 'unknown').length;
  const childProviderErrors = children.reduce((sum, child) => sum + child.providerErrors, 0);
  const status = sessionStatus({ session, taskCalls, children, childOutcomes, childProviderErrors, policyIssues, providerErrors });
  const recommendations = nextActions({ tracker, policyIssues, providerErrors, taskCalls, children });

  return {
    session,
    projectDir: opts.cwd,
    status,
    prompt: userPrompt,
    tasks: {
      total: taskCalls.length,
      statusPolls: taskCalls.filter((task) => task.isStatusPoll).length,
      calls: taskCalls,
    },
    children: {
      total: children.length,
      withOutcomes: childOutcomes,
      providerErrors: childProviderErrors,
      sessions: children,
    },
    providerErrors,
    policyIssues,
    tracker,
    recommendations,
  };
}

function firstUserText(textParts, messageById) {
  for (const part of textParts) {
    if (messageById.get(part.row.message_id)?.role === 'user') {
      return clean(redactSecrets(part.data.text || ''));
    }
  }
  return '';
}

function taskCallSummary(part) {
  const input = objectOrEmpty(part.data.state?.input);
  const metadata = objectOrEmpty(part.data.state?.metadata);
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const description = stringValue(input.description || metadata.description || part.data.state?.title);
  const sessionId = stringValue(input.task_id || metadata.sessionId);
  const subagentType = stringValue(input.subagent_type || metadata.subagent_type || metadata.agent);
  const isStatusPoll = Boolean(input.task_id) ||
    /\b(check|poll|status|force|abort|progress|result)\b/i.test(description) ||
    /\b(return your final outcome now|if still working|current status|report your current status|still running)\b/i.test(prompt);

  return {
    at: msToIso(part.row.time_created),
    description,
    subagentType,
    sessionId,
    status: stringValue(part.data.state?.status),
    isStatusPoll,
    promptBytes: Buffer.byteLength(prompt, 'utf8'),
    proxyLeak: hasProxyLeak(prompt),
  };
}

function providerErrorSummary(message) {
  const error = message.data.error;
  if (!error) return null;
  const rawMessage = stringValue(error.data?.message || error.message || error.name || 'unknown provider error');
  const statusCode = error.data?.statusCode ?? statusCodeFromText(rawMessage);
  return {
    at: msToIso(message.row.time_created),
    provider: stringValue(message.data.providerID),
    model: stringValue(message.data.modelID),
    statusCode,
    category: providerErrorCategory(rawMessage, statusCode),
    message: redactSecrets(rawMessage),
  };
}

function detectPolicyIssues(session, parts, textParts, messageById, providerErrors) {
  const issues = [];
  const taskParts = parts.filter((p) => p.data.type === 'tool' && p.data.tool === 'task');
  const statusPolls = taskParts.map(taskCallSummary).filter((task) => task.isStatusPoll);
  if (statusPolls.length > 0) {
    issues.push({
      type: 'task_status_poll',
      severity: 'high',
      count: statusPolls.length,
      detail: 'A task call tried to poll/check an existing task session.',
    });
  }

  const proxyLeakCount = parts.reduce((count, part) => count + (partHasProxyLeak(part) ? 1 : 0), 0);
  if (proxyLeakCount > 0) {
    issues.push({
      type: 'proxy_prompt_leak',
      severity: 'high',
      count: proxyLeakCount,
      detail: 'Prompt/tool input appears to contain proxy field values. Values are intentionally not printed.',
    });
  }

  const childTaskCalls = session.parentId ? taskParts.length : 0;
  if (childTaskCalls > 0) {
    issues.push({
      type: 'subagent_spawned_task',
      severity: 'high',
      count: childTaskCalls,
      detail: 'A child/subagent session used the task tool.',
    });
  }

  const provider402 = providerErrors.filter((err) => err.statusCode === 402).length;
  if (provider402 > 0) {
    issues.push({
      type: 'provider_balance_error',
      severity: 'medium',
      count: provider402,
      detail: 'Provider reported insufficient balance/credits.',
    });
  }

  const finalText = textParts
    .filter((part) => messageById.get(part.row.message_id)?.role === 'assistant')
    .slice(-5)
    .map((part) => part.data.text || '')
    .join('\n');
  if (taskParts.length > 0 && !hasOutcome(finalText) && !/round .*in flight|still running|waiting/i.test(finalText)) {
    issues.push({
      type: 'no_visible_final_outcome',
      severity: 'medium',
      count: 1,
      detail: 'Session dispatched task work but recent assistant text has no final outcome or in-flight notice.',
    });
  }

  return issues;
}

function partHasProxyLeak(part) {
  const data = part.data;
  if (data.type === 'text' || data.type === 'reasoning') return hasProxyLeak(data.text || '');
  if (data.type === 'tool') return hasProxyLeak(JSON.stringify(data.state?.input || {}));
  return false;
}

function childSummary(session) {
  const rows = loadRows(session.id);
  const messages = rows.messages.map((row) => ({ row, data: parseJson(row.data) }));
  const parts = rows.parts.map((row) => ({ row, data: parseJson(row.data) }));
  const text = parts.filter((p) => p.data.type === 'text').map((p) => p.data.text || '').join('\n');
  const providerErrors = messages.map(providerErrorSummary).filter(Boolean);
  const taskCalls = parts.filter((p) => p.data.type === 'tool' && p.data.tool === 'task').length;
  const trackerWrites = parts.filter((p) => p.data.type === 'tool' && /batch\/tracker-additions\/.*\.tsv/.test(JSON.stringify(p.data.state?.input || {}))).length;

  return {
    id: session.id,
    title: session.title,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    outcome: outcomeFromText(text, trackerWrites),
    providerErrors: providerErrors.length,
    taskCalls,
    trackerWrites,
  };
}

function outcomeFromText(text, trackerWrites = 0) {
  if (/\bAPPLIED\b|status[^\n|]*Applied|successfully submitted|Applied via/i.test(text)) return 'Applied';
  if (/\bDiscarded\b|\bSKIP\b/i.test(text)) return 'Discarded';
  if (/\bAPPLY FAILED\b|\bFailed\b|\bFAILED\b/i.test(text)) return 'Failed';
  if (trackerWrites > 0) return 'TSV written';
  return 'unknown';
}

function hasOutcome(text) {
  return outcomeFromText(text) !== 'unknown' || /tracker-additions\/.*\.tsv/i.test(text);
}

function sessionStatus({ taskCalls, children, childOutcomes, childProviderErrors, policyIssues, providerErrors }) {
  if (policyIssues.some((issue) => issue.severity === 'high')) return 'attention';
  if (providerErrors.length > 0) return 'attention';
  if (childProviderErrors > 0) return 'attention';
  if (taskCalls.length > 0 && children.length > childOutcomes) return 'in-flight-or-incomplete';
  if (taskCalls.length > 0 && children.length === childOutcomes) return 'complete';
  return 'observed';
}

function trackerStatus(projectDir) {
  const pendingDir = join(projectDir, 'batch', 'tracker-additions');
  const mergedDir = join(pendingDir, 'merged');
  return {
    pending: listTsv(pendingDir),
    mergedCount: listTsv(mergedDir).length,
  };
}

function listTsv(dir) {
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.tsv'))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

function nextActions({ tracker, policyIssues, providerErrors, children }) {
  const actions = [];
  if (tracker.pending.length > 0) actions.push('Run `npm run merge && npm run verify` when you are ready to fold pending TSV outcomes into day files.');
  if (policyIssues.some((issue) => issue.type === 'task_status_poll')) actions.push('Avoid resuming by spawning "check task status" tasks; inspect telemetry/trace and tracker files instead.');
  if (policyIssues.some((issue) => issue.type === 'proxy_prompt_leak')) actions.push('Restart OpenCode after updating the harness so new sessions load the proxy prompt hygiene rule.');
  if (providerErrors.some((err) => err.statusCode === 402)) actions.push('Provider balance errors occurred; use a non-402 fallback or add provider credits before retrying paid routes.');
  if (children.some((child) => child.outcome === 'unknown')) actions.push('Some child sessions have no visible final outcome; inspect them with `npm run telemetry:show -- <child-session-id>`.');
  return actions;
}

function summaryForList(telemetry) {
  return {
    id: telemetry.session.id,
    startedAt: telemetry.session.startedAt,
    updatedAt: telemetry.session.endedAt,
    status: telemetry.status,
    prompt: telemetry.prompt,
    tasks: telemetry.tasks.total,
    children: telemetry.children.total,
    outcomes: telemetry.children.withOutcomes,
    issues: telemetry.policyIssues.length,
    providerErrors: telemetry.providerErrors.length + telemetry.children.providerErrors,
  };
}

function printList(items) {
  const rows = items.map((item) => [
    item.id,
    item.startedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z'),
    item.status,
    String(item.tasks),
    `${item.outcomes}/${item.children}`,
    String(item.issues + item.providerErrors),
    shorten(item.prompt || '', 42),
  ]);
  const header = ['session', 'started', 'status', 'tasks', 'outcomes', 'alerts', 'prompt'];
  printTable(header, rows);
}

function printStatus(telemetry) {
  console.log(`project:   ${telemetry.projectDir}`);
  console.log(`session:   ${telemetry.session.id}`);
  console.log(`status:    ${telemetry.status}`);
  console.log(`started:   ${telemetry.session.startedAt}`);
  console.log(`prompt:    ${shorten(telemetry.prompt || '', 100)}`);
  console.log(`tasks:     ${telemetry.tasks.total} (${telemetry.tasks.statusPolls} status-poll)`);
  console.log(`children:  ${telemetry.children.withOutcomes}/${telemetry.children.total} with outcomes`);
  console.log(`tracker:   ${telemetry.tracker.pending.length} pending TSVs, ${telemetry.tracker.mergedCount} merged TSVs`);
  console.log(`errors:    ${telemetry.providerErrors.length} root, ${telemetry.children.providerErrors} child provider errors`);
  console.log(`issues:    ${telemetry.policyIssues.length}`);

  if (telemetry.policyIssues.length > 0) {
    console.log('\nissues:');
    for (const issue of telemetry.policyIssues) {
      console.log(`  - ${issue.severity} ${issue.type} x${issue.count}: ${issue.detail}`);
    }
  }

  if (telemetry.tracker.pending.length > 0) {
    console.log('\npending TSVs:');
    for (const file of telemetry.tracker.pending.slice(0, 12)) {
      console.log(`  - ${relativeToProject(file, telemetry.projectDir)}`);
    }
    if (telemetry.tracker.pending.length > 12) console.log(`  - ...${telemetry.tracker.pending.length - 12} more`);
  }

  if (telemetry.children.sessions.length > 0) {
    console.log('\nchild sessions:');
    for (const child of telemetry.children.sessions) {
      const alerts = [];
      if (child.providerErrors) alerts.push(`${child.providerErrors} provider error`);
      if (child.taskCalls) alerts.push(`${child.taskCalls} task call`);
      console.log(`  - ${child.id}  ${child.outcome}  ${child.title}${alerts.length ? ` (${alerts.join(', ')})` : ''}`);
    }
  }

  if (telemetry.recommendations.length > 0) {
    console.log('\nnext:');
    for (const action of telemetry.recommendations) console.log(`  - ${action}`);
  }
}

function printShow(telemetry) {
  printStatus(telemetry);
  if (telemetry.tasks.calls.length > 0) {
    console.log('\ntask dispatches:');
    for (const task of telemetry.tasks.calls) {
      const flags = [
        task.isStatusPoll ? 'status-poll' : '',
        task.proxyLeak ? 'proxy-values-detected' : '',
      ].filter(Boolean).join(', ');
      console.log(`  - ${task.at} ${task.description || '(no description)'} ${task.sessionId || ''} ${task.subagentType || ''}${flags ? ` [${flags}]` : ''}`);
    }
  }
  if (telemetry.providerErrors.length > 0) {
    console.log('\nprovider errors:');
    for (const err of telemetry.providerErrors) {
      console.log(`  - ${err.at} ${err.provider}/${err.model} ${err.statusCode || ''} ${err.category}: ${err.message}`);
    }
  }
}

function printTable(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  console.log(header.map((h, i) => pad(h, widths[i])).join('  '));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '));
}

function latestRootTelemetry(opts) {
  const sessions = discoverSessions(opts);
  const roots = sessions.filter((session) => !session.parentId);
  if (roots.length === 0) return { sessions, telemetry: null };
  return { sessions, telemetry: analyzeSession(roots[0], sessions, opts) };
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' ? value : {};
}

function stringValue(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function statusCodeFromText(text) {
  const match = String(text).match(/\b(40[0-9]|42[0-9]|50[0-9])\b/);
  return match ? Number(match[1]) : undefined;
}

function providerErrorCategory(text, statusCode) {
  if (statusCode === 402 || /insufficient|balance|credits|diem/i.test(text)) return 'balance';
  if (statusCode === 429 || /rate.?limit|quota/i.test(text)) return 'rate-limit';
  if (/overload|temporarily unavailable|timeout/i.test(text)) return 'transient';
  return 'provider-error';
}

function hasProxyLeak(text) {
  const raw = String(text || '');
  if (!/proxy/i.test(raw)) return false;
  return /\b(server|username|password|bypass)["']?\s*[:=]\s*["']?[^"',\s)}]+/i.test(raw) ||
    /brd-customer|superproxy|oxylabs|smartproxy|soax/i.test(raw);
}

function redactSecrets(text) {
  return String(text || '')
    .replace(/\b(password|username|server|bypass)["']?\s*[:=]\s*["']?[^"',\s)}]+/gi, '$1=<redacted>')
    .replace(/brd-customer-[A-Za-z0-9_.-]+/g, '<redacted-proxy-user>');
}

function relativeToProject(file, projectDir = PROJECT_DIR) {
  return file.startsWith(`${projectDir}/`) ? file.slice(projectDir.length + 1) : file;
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function shorten(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function pad(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

async function runWatch(opts) {
  while (true) {
    console.clear();
    console.log(new Date().toISOString());
    const { telemetry } = latestRootTelemetry(opts);
    if (!telemetry) {
      console.log('No recent JobForge OpenCode sessions found.');
    } else {
      printStatus(telemetry);
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, opts.interval * 1000));
  }
}

async function main() {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return 0;
  }

  if (cmd === 'list') {
    const { opts } = parseArgs(args);
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge telemetry:list: ${opts.error}`);
      return 2;
    }
    const sessions = discoverSessions(opts);
    const items = sessions
      .filter((session) => !session.parentId)
      .map((session) => summaryForList(analyzeSession(session, sessions, opts)));
    if (opts.json) {
      console.log(JSON.stringify(items, null, 2));
    } else if (items.length === 0) {
      console.error('job-forge telemetry:list: no recent JobForge OpenCode sessions found');
      return 2;
    } else {
      printList(items);
    }
    return 0;
  }

  if (cmd === 'status') {
    const { opts } = parseArgs(args);
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge telemetry:status: ${opts.error}`);
      return 2;
    }
    const { telemetry } = latestRootTelemetry(opts);
    if (!telemetry) {
      console.error('job-forge telemetry:status: no recent JobForge OpenCode sessions found');
      return 2;
    }
    if (opts.json) console.log(JSON.stringify(telemetry, null, 2));
    else printStatus(telemetry);
    return 0;
  }

  if (cmd === 'show') {
    const { opts, positional } = parseArgs(args, { allowSession: true });
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge telemetry:show: ${opts.error}`);
      return 2;
    }
    if (positional.length === 0) {
      console.error('job-forge telemetry:show: missing <id-or-prefix>');
      return 2;
    }
    const sessions = discoverSessions(opts, { includeAllForShow: true });
    const session = findSessionById(sessions, positional[0]);
    if (!session) {
      console.error(`job-forge telemetry:show: no session matches "${positional[0]}"`);
      return 2;
    }
    const telemetry = analyzeSession(session, sessions, opts);
    if (opts.json) console.log(JSON.stringify(telemetry, null, 2));
    else printShow(telemetry);
    return 0;
  }

  if (cmd === 'watch') {
    const { opts } = parseArgs(args, { allowInterval: true });
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    if (opts.error) {
      console.error(`job-forge telemetry:watch: ${opts.error}`);
      return 2;
    }
    await runWatch(opts);
    return 0;
  }

  console.error(`job-forge telemetry: unknown command "${cmd}"\n`);
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
