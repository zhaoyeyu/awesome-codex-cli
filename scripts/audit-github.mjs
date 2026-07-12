import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const catalogPath = new URL("../data/resources.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

const repos = new Map();
for (const resource of catalog.resources) {
  const url = new URL(resource.url);
  if (url.hostname !== "github.com") continue;
  const [owner, name] = url.pathname.split("/").filter(Boolean);
  if (!owner || !name || ["issues", "discussions", "topics", "marketplace"].includes(owner)) continue;
  const key = `${owner}/${name.replace(/\.git$/, "")}`;
  if (!repos.has(key)) repos.set(key, []);
  repos.get(key).push(resource.id);
}

function quote(value) {
  return JSON.stringify(value);
}

const repoEntries = [...repos.entries()];
const results = {};
const errors = [];

for (let offset = 0; offset < repoEntries.length; offset += 50) {
  const batch = repoEntries.slice(offset, offset + 50);
  const aliases = batch
    .map(([nameWithOwner], index) => {
      const [owner, name] = nameWithOwner.split("/");
      return `r${index}: repository(owner: ${quote(owner)}, name: ${quote(name)}) {
        nameWithOwner url description homepageUrl createdAt updatedAt
        isArchived isDisabled isFork stargazerCount pushedAt
        primaryLanguage { name }
        defaultBranchRef { name }
        licenseInfo { spdxId }
      }`;
    })
    .join("\n");
  const query = `query CatalogRepositoryAudit { ${aliases} }`;
  const response = spawnSync("gh", ["api", "graphql", "-f", `query=${query}`], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  let payload;
  try {
    payload = JSON.parse(response.stdout || "{}");
  } catch {
    throw new Error(`GitHub response was not JSON: ${response.stderr || response.stdout}`);
  }
  for (const error of payload.errors ?? []) errors.push(error.message);
  for (const [index, [nameWithOwner, ids]] of batch.entries()) {
    results[nameWithOwner] = {
      ids,
      ...(payload.data?.[`r${index}`] ?? { missing: true }),
    };
  }
}

const now = new Date();
const checkedAt = now.toISOString().slice(0, 10);
const staleBefore = new Date(now);
staleBefore.setUTCFullYear(staleBefore.getUTCFullYear() - 1);

const summary = {
  checkedAt,
  repositories: repoEntries.length,
  missing: Object.entries(results).filter(([, value]) => value.missing).map(([key]) => key),
  archived: Object.entries(results).filter(([, value]) => value.isArchived).map(([key]) => key),
  disabled: Object.entries(results).filter(([, value]) => value.isDisabled).map(([key]) => key),
  stale: Object.entries(results)
    .filter(([, value]) => value.pushedAt && new Date(value.pushedAt) < staleBefore)
    .map(([key]) => key),
  errors: [...new Set(errors)],
};

await mkdir(new URL("../.audit/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../.audit/github-report.json", import.meta.url),
  `${JSON.stringify({ summary, repositories: results }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(summary, null, 2));
if (summary.missing.length || summary.disabled.length) process.exitCode = 1;
