#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");

const FILES = ["AGENTS.md"];
const DIRS = ["agent-docs"];

function printHelp() {
  console.log(`
swisstomato-agentic-web-design — install Swisstomato agent docs into a project

Usage:
  npx swisstomato-agentic-web-design [directory] [options]

Options:
  --force, -f    Overwrite existing AGENTS.md or agent-docs/
  --help, -h     Show this help message

Examples:
  npx swisstomato-agentic-web-design
  npx swisstomato-agentic-web-design ./my-wordpress-site
  npx swisstomato-agentic-web-design --force
`);
}

function parseArgs(argv) {
  const options = { force: false, help: false, target: process.cwd() };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (!arg.startsWith("-")) {
      options.target = resolve(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return options;
}

// List every file under a directory, as paths relative to that directory.
function listFiles(dir, base = dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      files.push(relative(base, full));
    }
  }

  return files;
}

// Recursive copy built on copyFileSync instead of fs.cpSync, which has
// silently skipped directories on Windows paths with non-ASCII characters.
function copyDir(source, dest) {
  mkdirSync(dest, { recursive: true });

  for (const file of listFiles(source)) {
    const to = join(dest, file);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(source, file), to);
  }
}

function listConflicts(target) {
  const conflicts = [];

  for (const file of FILES) {
    if (existsSync(join(target, file))) {
      conflicts.push(file);
    }
  }

  for (const dir of DIRS) {
    if (existsSync(join(target, dir))) {
      conflicts.push(`${dir}/`);
    }
  }

  return conflicts;
}

function copyPackageFiles(target, force) {
  mkdirSync(target, { recursive: true });

  for (const file of FILES) {
    const dest = join(target, file);

    if (existsSync(dest) && !force) {
      continue;
    }

    copyFileSync(join(packageRoot, file), dest);
  }

  for (const dir of DIRS) {
    const dest = join(target, dir);

    if (existsSync(dest) && !force) {
      continue;
    }

    copyDir(join(packageRoot, dir), dest);
  }
}

// Confirm every shipped file actually exists in the target.
function verifyInstall(target) {
  const missing = [];

  for (const file of FILES) {
    if (!existsSync(join(target, file))) {
      missing.push(file);
    }
  }

  for (const dir of DIRS) {
    for (const file of listFiles(join(packageRoot, dir))) {
      const dest = join(target, dir, file);
      if (!existsSync(dest) || !statSync(dest).isFile()) {
        missing.push(join(dir, file));
      }
    }
  }

  return missing;
}

function countInstalledDocs(target) {
  const docsDir = join(target, "agent-docs");
  if (!existsSync(docsDir)) {
    return 0;
  }
  return listFiles(docsDir).filter((file) => file.endsWith(".md")).length;
}

function main() {
  const { force, help, target } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  const conflicts = listConflicts(target);

  if (conflicts.length > 0 && !force) {
    console.error("Installation blocked — the following already exist:");
    for (const conflict of conflicts) {
      console.error(`  ${conflict}`);
    }
    console.error("\nRe-run with --force to overwrite.");
    process.exit(1);
  }

  copyPackageFiles(target, force);

  const discoveryDir = join(target, "discovery");
  mkdirSync(discoveryDir, { recursive: true });

  // brief.md holds the user's discovery answers, so it is never overwritten,
  // even with --force. --force only refreshes the shipped docs.
  const briefDest = join(discoveryDir, "brief.md");
  const briefExisted = existsSync(briefDest);
  if (!briefExisted) {
    copyFileSync(join(packageRoot, "templates", "discovery-brief.md"), briefDest);
  }

  const missing = verifyInstall(target);
  if (!existsSync(briefDest)) {
    missing.push(join("discovery", "brief.md"));
  }

  if (missing.length > 0) {
    console.error(`Installation incomplete in ${target}`);
    console.error("These files could not be written:");
    for (const file of missing) {
      console.error(`  ${file}`);
    }
    process.exit(1);
  }

  console.log(`Installed Swisstomato Agentic Web Design to ${target}`);
  console.log(`  AGENTS.md`);
  console.log(`  agent-docs/ (${countInstalledDocs(target)} reference docs)`);
  console.log(`  discovery/brief.md ${briefExisted ? "(kept)" : "(created)"}`);
  console.log("\nYour AI coding tool will pick up AGENTS.md automatically.");
  console.log("Next step: open your AI coding tool and say  start discovery");
}

main();