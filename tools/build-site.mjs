/* Copy the standalone marketing site without shipping extension or development files. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(ROOT, "site");
const destination = path.join(ROOT, "dist");
const entryPage = path.join(source, "index.html");

if (!fs.existsSync(entryPage) || !fs.lstatSync(entryPage).isFile()) {
  throw new Error("Missing site/index.html. Create the site before building.");
}

let fileCount = 0;
function validateDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) validateDirectory(entryPath);
    else if (entry.isFile()) fileCount += 1;
    else
      throw new Error(
        `Site assets must be regular files: ${path.relative(ROOT, entryPath)}`,
      );
  }
}

// Validate before replacing the last successful output. Symlinks are not portable
// GitHub Pages assets and could accidentally publish files outside the site.
validateDirectory(source);
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log(`Built dist/ from site/ (${fileCount} files).`);
