import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Prints the CHANGELOG section for a version, followed by download instructions.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageVersion = JSON.parse(readFileSync(resolve(root, "app", "package.json"), "utf8")).version;
const version = (process.argv[2] ?? packageVersion).replace(/^v/, "");
const lines = readFileSync(resolve(root, "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n").split("\n");

const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
const body = [];
if (start >= 0) {
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## [") || /^\[[^\]]+\]: /.test(line)) break;
    body.push(line);
  }
}

const download =
  "**Download:** [Local-Kanban-Setup.exe](https://github.com/grayfvll01/local-kanban-board/releases/latest/download/Local-Kanban-Setup.exe). " +
  "Run it and choose a vault folder. Existing installs offer the update in the status bar.";

console.log([body.join("\n").trim() || "Maintenance release.", download].join("\n\n"));
