/**
 * Monorepo-aware Metro config.
 *
 * apps/mobile lives in an npm-workspaces monorepo (`apps/*`, `packages/*`), so
 * Metro must:
 *   1. WATCH the repo root, not just this app, so changes in
 *      packages/shared + packages/ui trigger reloads.
 *   2. Resolve modules from BOTH the app-local and the hoisted root
 *      node_modules (npm hoists most deps to the root).
 *   3. Prefer a single copy of React / React Native so the workspace packages
 *      don't pull in a duplicate and break the renderer.
 *
 * The workspace packages resolve through their package `main`/`exports` like any
 * other dependency — no symlink gymnastics beyond the watchFolders +
 * nodeModulesPaths below. `@soteria-forge/shared` is plain TS compiled to
 * `dist/`; `@soteria-forge/ui` is React Native SOURCE (`main` -> src/index.ts),
 * transpiled directly by Metro/Babel (its .tsx is authored against RN + SVG).
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so shared/ui edits hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve from app-local first, then the hoisted root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Deduplicate React / React Native to the app's single copy.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
