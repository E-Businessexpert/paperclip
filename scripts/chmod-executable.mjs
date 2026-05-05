#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , fileArg] = process.argv;

if (!fileArg) {
  console.error("Usage: node scripts/chmod-executable.mjs <file>");
  process.exit(1);
}

const target = path.resolve(process.cwd(), fileArg);

if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
  console.error(`File does not exist: ${target}`);
  process.exit(1);
}

if (process.platform !== "win32") {
  fs.chmodSync(target, 0o755);
}
