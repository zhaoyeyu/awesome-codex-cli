import { readFile, readdir } from "node:fs/promises";
import { extname, relative } from "node:path";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("data/resources.json", root), "utf8"));
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

expect(catalog.schemaVersion === 1, "schemaVersion must be 1");
expect(/^\d{4}-\d{2}-\d{2}$/.test(catalog.updatedAt), "updatedAt must use YYYY-MM-DD");
expect(Array.isArray(catalog.categories) && catalog.categories.length > 0, "categories must be non-empty");
expect(Array.isArray(catalog.resources) && catalog.resources.length > 0, "resources must be non-empty");

const categoryIds = new Set();
for (const [index, category] of (catalog.categories ?? []).entries()) {
  const label = `categories[${index}]`;
  expect(typeof category.id === "string" && /^[a-z0-9-]+$/.test(category.id), `${label}.id is invalid`);
  expect(!categoryIds.has(category.id), `${label}.id duplicates ${category.id}`);
  categoryIds.add(category.id);
  expect(typeof category.label === "string" && category.label.trim().length >= 2, `${label}.label is invalid`);
  expect(
    typeof category.description === "string" && category.description.trim().length >= 20,
    `${label}.description is too short`,
  );
}

const seen = { id: new Map(), url: new Map(), name: new Map() };
const allowedRisk = new Set(["standard", "review"]);
const allowedStatuses = new Set(["reachable", "official"]);
const allowedMethods = new Set(["github-api", "http", "official-source"]);
const officialHosts = new Set(["developers.openai.com", "openai.com", "chatgpt.com"]);

for (const [index, resource] of (catalog.resources ?? []).entries()) {
  const label = `resources[${index}] (${resource.name ?? "unnamed"})`;
  expect(typeof resource.id === "string" && /^[a-z0-9-]+$/.test(resource.id), `${label}.id is invalid`);
  expect(typeof resource.name === "string" && resource.name.trim().length >= 2, `${label}.name is invalid`);
  expect(
    typeof resource.description === "string" && resource.description.trim().length >= 20,
    `${label}.description is too short`,
  );
  expect((resource.description?.length ?? 0) <= 280, `${label}.description exceeds 280 characters`);
  expect(categoryIds.has(resource.category), `${label}.category is unknown: ${resource.category}`);
  expect(typeof resource.kind === "string" && resource.kind.length >= 3, `${label}.kind is invalid`);
  expect(Array.isArray(resource.tags), `${label}.tags must be an array`);
  expect(new Set(resource.tags ?? []).size === (resource.tags ?? []).length, `${label}.tags contains duplicates`);
  expect(allowedRisk.has(resource.risk), `${label}.risk must be standard or review`);
  expect(typeof resource.featured === "boolean", `${label}.featured must be boolean`);

  let parsedUrl;
  try {
    parsedUrl = new URL(resource.url);
    expect(parsedUrl.protocol === "https:", `${label}.url must use HTTPS`);
    expect(!parsedUrl.username && !parsedUrl.password, `${label}.url must not contain credentials`);
  } catch {
    fail(`${label}.url is invalid: ${resource.url}`);
  }

  for (const field of ["id", "url", "name"]) {
    const value = field === "name" ? resource[field]?.toLowerCase() : resource[field];
    if (seen[field].has(value)) {
      fail(`${label}.${field} duplicates ${seen[field].get(value)}`);
    } else {
      seen[field].set(value, label);
    }
  }

  const verification = resource.verification ?? {};
  expect(allowedStatuses.has(verification.status), `${label}.verification.status is invalid`);
  expect(/^\d{4}-\d{2}-\d{2}$/.test(verification.checkedAt), `${label}.verification.checkedAt is invalid`);
  expect(allowedMethods.has(verification.method), `${label}.verification.method is invalid`);

  if (verification.method === "github-api" && parsedUrl) {
    expect(parsedUrl.hostname === "github.com", `${label} uses github-api for a non-GitHub URL`);
    expect(typeof verification.repository === "string", `${label}.verification.repository is required`);
    const pathRepo = parsedUrl.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
    expect(
      pathRepo.toLowerCase() === verification.repository?.toLowerCase(),
      `${label}.url does not match verification.repository`,
    );
    expect(
      verification.lastPush === null || /^\d{4}-\d{2}-\d{2}$/.test(verification.lastPush),
      `${label}.verification.lastPush is invalid`,
    );
  }

  if (resource.category === "official" && parsedUrl) {
    const official =
      officialHosts.has(parsedUrl.hostname) ||
      (parsedUrl.hostname === "github.com" && parsedUrl.pathname.toLowerCase().startsWith("/openai/"));
    expect(official, `${label} is categorized as official but is not on an OpenAI-owned host`);
  }

  if (resource.risk === "review" && !(resource.tags ?? []).includes("security")) {
    warnings.push(`${label} is review-risk but has no security tag`);
  }
}

for (const category of catalog.categories ?? []) {
  const count = catalog.resources.filter((resource) => resource.category === category.id).length;
  expect(count > 0, `category ${category.id} has no resources`);
}

const expectedJson = `${JSON.stringify(catalog, null, 2)}\n`;
const expectedJs = `/* Generated by npm run build. Do not edit directly. */\nwindow.CODEX_RESOURCE_CATALOG = ${JSON.stringify(catalog)};\n`;

try {
  const generatedJson = await readFile(new URL("docs/catalog.json", root), "utf8");
  expect(generatedJson === expectedJson, "docs/catalog.json is stale; run npm run build");
} catch {
  fail("docs/catalog.json is missing; run npm run build");
}

try {
  const generatedJs = await readFile(new URL("docs/catalog.js", root), "utf8");
  expect(generatedJs === expectedJs, "docs/catalog.js is stale; run npm run build");
} catch {
  fail("docs/catalog.js is missing; run npm run build");
}

try {
  const siteHtml = await readFile(new URL("docs/index.html", root), "utf8");
  expect(
    !/(?:href|src)=["']\.\.\//i.test(siteHtml),
    "docs/index.html must not escape the deployed Pages artifact with parent-relative links",
  );
} catch {
  fail("docs/index.html is missing");
}

const publicExtensions = new Set([".md", ".json", ".js", ".mjs", ".html", ".css", ".svg", ".yml", ".yaml"]);
const forbidden = [
  [/[A-Z]:\\(?:Users|myproject)\\/gi, "local Windows path"],
  [/\/(?:Users|home)\/[A-Za-z0-9._-]+\//g, "local POSIX home path"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "email address"],
  [/github\.com\/(?:user|RoggeOhta)\/awesome-codex-cli/gi, "stale repository owner"],
  [/_github_portfolio_audit|alpha_ops_workbench|portfolio-upgrade-20260712/gi, "task or workspace residue"],
  [/(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"'\s]{8,}["']/gi, "possible embedded credential"],
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".audit", "node_modules"].includes(entry.name)) continue;
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...(await walk(url)));
    else if (publicExtensions.has(extname(entry.name))) files.push(url);
  }
  return files;
}

for (const file of await walk(root)) {
  if (file.pathname.endsWith("/scripts/validate-catalog.mjs")) continue;
  const content = await readFile(file, "utf8");
  const path = relative(new URL(".", root).pathname, file.pathname).replaceAll("\\", "/");
  for (const [pattern, reason] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) fail(`${path}: contains ${reason}`);
  }
}

if (warnings.length) {
  console.warn(`Warnings (${warnings.length}):`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error(`Catalog validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Catalog validation passed: ${catalog.resources.length} resources in ${catalog.categories.length} categories.`);
