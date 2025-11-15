# Environment Variables in Starships Tools

Use secure environment variables for configuration and secrets throughout your tool blueprints. The runtime injects a secure environment object; you access it differently in template strings vs Code nodes.

## Quick Reference

- Templates (eval in string): `{{ env('KEY') }}`
- Code node: `ctx.$env('KEY')`
- Never log raw secret values; redact or omit in outputs and logs.

---

## Templates (Eval in Strings)

Template expressions evaluate inside full strings. Compute the entire value within a single `{{ ... }}`.

Examples:

```json
{
  "url": "{{ env('API_BASE') }}/v1/users/{{ $input('userId') }}",
  "headers": {
    "Authorization": "Bearer {{ env('API_TOKEN') }}",
    "X-Org": "{{ env('ORG_ID') }}"
  },
  "body": {
    "source": "starships",
    "timestamp": "{{ Date.now() }}"
  }
}
```

Rules:

- Full-string only: do not concatenate multiple partial templates.
- Available helpers include: `env('KEY')`, `$input(path?)`, `$lastOutputOf(ref)`, `Date`, simple expressions/conditionals.

Incorrect (partials):

```json
{
  "headers": {
    "Authorization": "Bearer " + "{{ env('API_TOKEN') }}"
  }
}
```

Correct:

```json
{
  "headers": {
    "Authorization": "Bearer {{ env('API_TOKEN') }}"
  }
}
```

---

## Code Node (`type: "code"`)

Access env via `ctx.$env('KEY')`. Example:

```js
async function main(ctx) {
  const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('BASE_URL missing');
  const token = ctx.$env('API_TOKEN');
  if (!token) throw new Error('API_TOKEN missing');

  return {
    url: baseUrl + '/v1/resource',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: {
      id: ctx.$input && ctx.$input.id,
    },
  };
}
```

Notes:

- Use `ctx.$env('KEY')` instead of `process.env`.
- Validate required env early and fail fast with clear errors.

---

## HttpRequest Node Patterns

```json
{
  "type": "http_request",
  "parameters": {
    "url": "{{ env('API_BASE') }}/v2/events",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{ env('API_TOKEN') }}",
      "Content-Type": "application/json"
    },
    "body": {
      "event": "tool.run",
      "source": "starships",
      "ts": "{{ Date.now() }}"
    },
    "timeout": 10000
  }
}
```

---

## Best Practices

- Name secrets clearly (e.g., `LINKEDIN_API_TOKEN`, `GITHUB_APP_ID`, `BASE_URL`).
- Never log/echo the secret values; redact if needed.
- Prefer template expressions for headers and URLs; use Code node when you need logic.
- If a new variable is needed, reference it directly (e.g., `{{ env('NEW_SECRET') }}`) and proceed—no hardcoding defaults.

---

## See Also

- `eval.md`: Template evaluation rules and helpers (`env()`, `$input()`, etc.)
- `engine.md`: Secure environment design overview

---

## Strict Rules

- Always use full-string templates: wrap the entire string in a single `{{ ... }}`. No concatenation around templates.
- Never access `process.env` directly; use `{{ env('KEY') }}` in templates or `ctx.$env('KEY')` in Code.
- Do not print secret values. You may log presence/absence or last-4 chars if truly necessary; prefer omitting entirely.
- Do not attempt nested templates or multiple passes; evaluation happens once.
- JSON context must remain valid JSON. Put the entire expression inside the quotes.
- Keys are case-sensitive. Recommended naming: UPPERCASE letters, digits, and underscores only.
- Missing env returns `undefined` (templates) or `undefined` (Code). Validate early, fail fast with actionable messages.
- Avoid defaults that hide configuration gaps. If truly required, implement explicit validation and error with guidance.

Allowed helpers inside `{{ ... }}` (non-exhaustive):

- `env('KEY')`, `envAll()`
- `$input(path?)`, `$lastOutputOf(ref)`
- `Date`, `Math`, simple ternaries/expressions

Disallowed patterns:

- Partial templates: `"Bearer " + "{{ env('TOKEN') }}"` (evaluate to literal pieces, not supported)
- Multi-stage templating: writing template syntax that expects another pass
- Direct secret echoing in outputs or logs

---

## Built-in Environment Keys (Provided by runtime)

Some tools rely on standard variables supplied by the Starships runtime:

- `BASE_URL`: API base, typically including `/api/v1` (trim trailing slashes when composing)
- `AUTH_TOKEN`: Bearer token for authenticated internal API calls
- `STARSHIP_ID`: Current starship identifier

Usage examples:

- Templates: `"{{ env('BASE_URL') }}/starships/{{ env('STARSHIP_ID') }}/tools"`
- Code: `const token = ctx.$env('AUTH_TOKEN'); if (!token) throw new Error('AUTH_TOKEN missing');`

Do not hardcode these; reference them via env.

---

## Node-by-Node Guidance

### HttpRequest Node

- Prefer templates for `url`, `headers`, and lightweight `body` shaping.
- Put the entire value in one template string:
  - Correct: `"Authorization": "Bearer {{ env('API_TOKEN') }}"`
  - Incorrect: `"Authorization": "Bearer " + "{{ env('API_TOKEN') }}"`
- Common pattern:

```json
{
  "url": "{{ env('API_BASE') }}/v2/resource/{{ $input('id') }}",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{ env('API_TOKEN') }}",
    "Content-Type": "application/json"
  },
  "body": {
    "source": "starships",
    "payload": "{{ $input() }}"
  },
  "timeout": 10000
}
```

### Code Node

- Use `ctx.$env('KEY')`. Validate required keys and fail fast.
- Shape complex bodies/headers in Code when logic is needed; return plain JSON fields consumed by downstream nodes.

### Conditional / Transform / Mutate

- You can safely use `env('KEY')` in template expressions or node-provided eval contexts when creating strings/fields.
- Keep expressions simple and deterministic.

---

## Common Pitfalls and Fixes

- Trailing slashes in URLs
  - Pitfall: `"{{ env('BASE_URL') }}/endpoint"` where `BASE_URL` already ends with `/`
  - Fix (Code): `const base = (ctx.$env('BASE_URL') || '').replace(/\/+$/, '');`
  - Or adjust input values to avoid double slashes.

- Logging secrets
  - Pitfall: `console.log('Token', ctx.$env('API_TOKEN'))`
  - Fix: `console.log('Token present:', !!ctx.$env('API_TOKEN'))`

- Partial templates (not supported)
  - Pitfall: `"Bearer " + "{{ env('API_TOKEN') }}"`
  - Fix: `"Bearer {{ env('API_TOKEN') }}"`

- Using process.env
  - Pitfall: `process.env.API_TOKEN`
  - Fix: `ctx.$env('API_TOKEN')` or `{{ env('API_TOKEN') }}`

- Hidden defaults
  - Pitfall: `const token = ctx.$env('TOKEN') || 'dev-token'`
  - Fix: Throw with guidance so misconfiguration is obvious.

---

## Example: LinkedIn POST Tool (Env-Centric)

Assume required env:

- `LINKEDIN_ACCESS_TOKEN`
- `LINKEDIN_ORG_ID` (if posting as organization)

Code node to prepare request:

```js
async function main(ctx) {
  const token = ctx.$env('LINKEDIN_ACCESS_TOKEN');
  if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN missing');
  const orgId = ctx.$env('LINKEDIN_ORG_ID'); // optional if posting as user

  const base = 'https://api.linkedin.com';
  const text = (ctx.$input && ctx.$input.text) || '';
  if (!text) throw new Error('text is required');

  const body = orgId
    ? {
        author: 'urn:li:organization:' + orgId,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }
    : {
        author: 'urn:li:person:me',
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

  return {
    url: base + '/v2/ugcPosts',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body,
  };
}
```

HttpRequest node consumes prepared output:

```json
{
  "url": "{{ $lastOutputOf('prepare')[0].json.url }}",
  "method": "{{ $lastOutputOf('prepare')[0].json.method }}",
  "headers": "{{ $lastOutputOf('prepare')[0].json.headers }}",
  "body": "{{ $lastOutputOf('prepare')[0].json.body }}",
  "timeout": 15000
}
```

Notes:

- All secrets are sourced via env; nothing is hardcoded.
- Validation ensures obvious configuration errors instead of silent failures.

---

## Connectors and Managed Environment Variables

Connectors provide guided flows for configuring third-party APIs. For example:

- LinkedIn connector (OAuth) manages:
  - `LINKEDIN_ACCESS_TOKEN`
  - `LINKEDIN_ORG_ID` (optional)
- Discord connector (API key) manages:
  - `DISCORD_BOT_TOKEN`
  - `DISCORD_DEFAULT_CHANNEL_ID` (optional)

These values are stored in the same encrypted `environments` table and injected via `env('KEY')` / `ctx.$env('KEY')`. Use connectors from the starship settings → Environment & Connectors page; advanced users can still edit the underlying env vars directly.

---

## Testing and Debugging

- Verify presence (not value): `console.log('API_TOKEN present:', !!ctx.$env('API_TOKEN'))`
- Prefer deterministic inputs for tests; avoid reading or mutating env during execution.
- Return clear error messages when env is missing: state what is needed and why.
