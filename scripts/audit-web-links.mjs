import { mkdir, readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(
  await readFile(new URL("../data/resources.json", import.meta.url), "utf8"),
);

const urls = [...new Set(catalog.resources.map((resource) => resource.url))].filter(
  (url) => new URL(url).hostname !== "github.com",
);

const headers = {
  "user-agent": "CodexResourceWorkbenchLinkChecker/1.0 (+https://github.com/zhaoyeyu/awesome-codex-cli)",
  accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
};

async function request(url, method) {
  return fetch(url, {
    method,
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
}

async function check(url) {
  try {
    let response = await request(url, "HEAD");
    if (response.status >= 400) {
      response = await request(url, "GET");
    }
    const state = response.ok || (response.status >= 300 && response.status < 400)
      ? "ok"
      : [401, 403, 409, 418, 429, 451].includes(response.status)
        ? "restricted"
        : "broken";
    return {
      url,
      state,
      status: response.status,
      finalUrl: response.url,
    };
  } catch (error) {
    return { url, state: "unknown", error: error.message };
  }
}

const results = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(8, urls.length) }, async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      results[index] = await check(urls[index]);
    }
  }),
);

const summary = {
  checkedAt: new Date().toISOString().slice(0, 10),
  links: results.length,
  ok: results.filter((result) => result.state === "ok").length,
  restricted: results.filter((result) => result.state === "restricted").length,
  broken: results.filter((result) => result.state === "broken"),
  unknown: results.filter((result) => result.state === "unknown"),
};

await mkdir(new URL("../.audit/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../.audit/web-report.json", import.meta.url),
  `${JSON.stringify({ summary, results }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(summary, null, 2));
if (summary.broken.length) process.exitCode = 1;
