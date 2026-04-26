import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  buildIndex,
  hasIndexRecord,
  loadIndexConfig,
  parseJson,
  queryIndex,
  verifyIndex,
} from '@razroo/iso-index';

export const INDEX_FILE = '.jobforge-index.json';
export const INDEX_CONFIG_FILE = 'templates/index.json';

export function resolveProjectDir(projectDir = process.env.JOB_FORGE_PROJECT || process.cwd()) {
  return projectDir;
}

export function jobForgeIndexPath(projectDir = resolveProjectDir()) {
  return process.env.JOB_FORGE_INDEX || join(projectDir, INDEX_FILE);
}

export function jobForgeIndexConfigPath(projectDir = resolveProjectDir()) {
  return process.env.JOB_FORGE_INDEX_CONFIG || join(projectDir, INDEX_CONFIG_FILE);
}

export function indexExists(projectDir = resolveProjectDir()) {
  return existsSync(jobForgeIndexPath(projectDir));
}

export function readJobForgeIndexConfig(projectDir = resolveProjectDir()) {
  const path = jobForgeIndexConfigPath(projectDir);
  return loadIndexConfig(parseJson(readFileSync(path, 'utf8'), path));
}

export function buildJobForgeIndex(options = {}, projectDir = resolveProjectDir()) {
  const config = readJobForgeIndexConfig(projectDir);
  const index = buildIndex(config, { root: projectDir });
  const out = options.out || jobForgeIndexPath(projectDir);
  if (options.write !== false) {
    writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }
  return { index, out };
}

export function readJobForgeIndex(projectDir = resolveProjectDir()) {
  const path = jobForgeIndexPath(projectDir);
  return parseJson(readFileSync(path, 'utf8'), path);
}

export function ensureJobForgeIndex(options = {}, projectDir = resolveProjectDir()) {
  if (options.rebuild !== false || !indexExists(projectDir)) {
    return buildJobForgeIndex({ out: options.out }, projectDir).index;
  }
  return readJobForgeIndex(projectDir);
}

export function queryJobForgeIndex(query = {}, options = {}, projectDir = resolveProjectDir()) {
  return queryIndex(ensureJobForgeIndex(options, projectDir), query);
}

export function hasJobForgeIndexRecord(query = {}, options = {}, projectDir = resolveProjectDir()) {
  return hasIndexRecord(ensureJobForgeIndex(options, projectDir), query);
}

export function verifyJobForgeIndex(options = {}, projectDir = resolveProjectDir()) {
  const index = options.index || ensureJobForgeIndex(options, projectDir);
  return verifyIndex(index);
}

export function jobForgeIndexSummary(projectDir = resolveProjectDir()) {
  if (!indexExists(projectDir)) {
    return {
      path: jobForgeIndexPath(projectDir),
      config: jobForgeIndexConfigPath(projectDir),
      exists: false,
      records: 0,
      files: 0,
      sources: 0,
    };
  }
  const index = readJobForgeIndex(projectDir);
  return {
    path: jobForgeIndexPath(projectDir),
    config: jobForgeIndexConfigPath(projectDir),
    exists: true,
    records: index.stats?.records || 0,
    files: index.stats?.files || 0,
    sources: index.stats?.sources || 0,
    configHash: index.configHash,
  };
}
