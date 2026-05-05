#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , sourceArg, targetArg] = process.argv;

if (!sourceArg || !targetArg) {
  console.error("Usage: node scripts/copy-dir.mjs <source> <target>");
  process.exit(1);
}

const rootDir = process.cwd();
const source = path.resolve(rootDir, sourceArg);
const target = path.resolve(rootDir, targetArg);

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  console.error(`Source directory does not exist: ${source}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
