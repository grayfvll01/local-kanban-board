import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args[0] === "--check";
const requested = (checkOnly ? args[1] : args[0])?.replace(/^v/, "");

if (requested && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requested)) {
  throw new Error(`Invalid semantic version: ${requested}`);
}

const paths = {
  package: resolve(appDir, "package.json"),
  lock: resolve(appDir, "package-lock.json"),
  tauri: resolve(appDir, "src-tauri", "tauri.conf.json"),
  cargo: resolve(appDir, "src-tauri", "Cargo.toml"),
  cargoLock: resolve(appDir, "src-tauri", "Cargo.lock"),
};

const pkg = readJson(paths.package);
const packageLock = readJson(paths.lock);
const tauri = readJson(paths.tauri);
const cargo = readFileSync(paths.cargo, "utf8");
const cargoLock = readFileSync(paths.cargoLock, "utf8");
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\r?\nname = "local-kanban"\r?\nversion = "([^"]+)"/)?.[1];

if (checkOnly) {
  const expected = requested ?? pkg.version;
  const versions = {
    "package.json": pkg.version,
    "package-lock.json": packageLock.version,
    "package-lock root": packageLock.packages?.[""]?.version,
    "tauri.conf.json": tauri.version,
    "Cargo.toml": cargoVersion,
    "Cargo.lock": cargoLockVersion,
  };
  const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
  if (mismatches.length) {
    throw new Error(`Expected version ${expected}; mismatches: ${mismatches.map(([file, value]) => `${file}=${value ?? "missing"}`).join(", ")}`);
  }
  console.log(`Version ${expected} is synchronized.`);
  process.exit(0);
}

if (!requested) {
  throw new Error("Usage: npm run version:set -- <major.minor.patch>");
}

pkg.version = requested;
packageLock.version = requested;
packageLock.packages[""].version = requested;
tauri.version = requested;

writeJson(paths.package, pkg);
writeJson(paths.lock, packageLock);
writeJson(paths.tauri, tauri);
writeFileSync(paths.cargo, cargo.replace(/^version = "[^"]+"/m, `version = "${requested}"`));
writeFileSync(
  paths.cargoLock,
  cargoLock.replace(
    /(\[\[package\]\]\r?\nname = "local-kanban"\r?\nversion = ")[^"]+"/,
    `$1${requested}"`,
  ),
);

console.log(`Updated Local Kanban to ${requested}.`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
