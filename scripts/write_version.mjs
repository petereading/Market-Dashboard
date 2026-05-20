import { mkdir, writeFile } from "node:fs/promises";

const fallbackCommit = "stage1-watchlist-20260520";
const commit = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? fallbackCommit;
const hasDeployCommit = commit !== fallbackCommit;

const shortCommit = hasDeployCommit ? commit.slice(0, 7) : "stage1-watchlist";
const buildId =
  process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_COMMIT_SHA
    ? `${process.env.CF_PAGES_BRANCH}-${shortCommit}`
    : commit;

const version = {
  buildId,
  commit,
  label: shortCommit
};

await mkdir("public", { recursive: true });
await writeFile("public/version.json", `${JSON.stringify(version, null, 2)}\n`, "utf8");

console.log(`Wrote public/version.json for ${version.label}`);
