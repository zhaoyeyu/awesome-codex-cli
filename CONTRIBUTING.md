# Contributing

Thanks for helping make the Codex Resource Workbench useful. The goal is not to collect the most links; it is to keep a smaller, searchable catalog that helps people make informed choices.

## Before submitting

A resource must meet all of these requirements:

- It directly supports Codex CLI, or it is cross-agent software with documented Codex compatibility.
- It has a stable HTTPS page with enough documentation to evaluate and use it.
- Its repository or product is active. As a default, the latest meaningful activity should be within the last 12 months.
- Its description is factual, specific, and free of marketing claims or volatile star, install, resource, or adoption counts.
- It is not a duplicate, a renamed copy of an existing entry, an archived experiment, or a legacy integration for the unrelated 2021 Codex API.
- Its license and credential-handling behavior are discoverable when those concerns apply.
- Authentication, account switching, model proxies, remote control, and sandbox-bypass tools use `"risk": "review"` and include the `security` tag.

Being open source is helpful but is not itself proof of safety or quality.

## Add or update a resource

1. Edit the canonical [`data/resources.json`](data/resources.json) file. Do not edit generated files in `docs/catalog.js` or `docs/catalog.json`.
2. Reuse an existing category. New categories need a clear user need and multiple qualifying resources.
3. Use a stable ID. Existing IDs must not change when a project is renamed.
4. Record the verification method and date. For GitHub projects, include the canonical `owner/repository` and latest push date returned by GitHub.
5. Run the build and deterministic checks.

```bash
npm test
```

For link changes, also run the relevant network check:

```bash
npm run check:github
npm run check:web
```

An entry has this shape:

```json
{
  "id": "example-tool-stable-id",
  "name": "Example Tool",
  "url": "https://github.com/example/example-tool",
  "description": "Runs isolated Codex tasks in Git worktrees and presents their diffs for review.",
  "category": "workflow",
  "kind": "project",
  "tags": ["automation", "open-source"],
  "risk": "standard",
  "featured": false,
  "verification": {
    "status": "reachable",
    "checkedAt": "2026-07-12",
    "method": "github-api",
    "repository": "example/example-tool",
    "lastPush": "2026-07-01"
  }
}
```

## Writing descriptions

Say what someone can accomplish and mention the Codex integration. Avoid superlatives and metrics that will quickly become stale.

Good:

> Runs parallel Codex tasks in isolated worktrees and provides a review queue for their diffs.

Not useful:

> The ultimate revolutionary agent tool with thousands of users.

## Security-sensitive resources

Entries that handle credentials, authentication state, proxies, remote commands, or unsandboxed execution need extra scrutiny. A pull request should explain:

- what secrets or account state the tool reads;
- where data is stored or transmitted;
- which commands and permissions it needs;
- whether a local-only or read-only mode exists;
- how a reviewer can test it without exposing a real account.

The catalog may decline a working project when its trust model is unclear.

## Public-boundary rules

Do not commit personal information, credentials, private repository details, local machine paths, copied task instructions, internal review notes, or placeholder issue links. Use synthetic examples and public URLs only.

## Propose a change

Open an [issue](https://github.com/zhaoyeyu/awesome-codex-cli/issues/new) for a questionable fit, or submit a pull request with the catalog change and generated assets. Include the resource’s Codex use case and the checks you ran.
