# starship-agent (agent-runner)

Runs a Starship dispatch loop on your machine. It connects to a Starship over
MCP with an agent token, pulls commands, runs each one through a local command
you choose (e.g. Claude Code), and reports the result back.

Use it headless on a server, or let the [desktop app](../agent-desktop) drive it.

## Quick start

```bash
starship-agent init      # endpoint, token, executor
starship-agent test      # connect + list pending commands, then exit
starship-agent run       # poll and execute (Ctrl-C to stop)
```

Get the endpoint and a token from your Starship: open the agent's **Connect**
dialog (Agents page) and copy the MCP endpoint + a freshly minted `sk-ship-…`
token.

## Configuration

Stored at `~/.starship-agent/config.json` (chmod 0600 — it holds your token):

```jsonc
{
  "endpoint": "https://your-starship/mcp",
  "token": "sk-ship-…",
  "pollIntervalMs": 5000,
  "maxConcurrent": 1,
  "executor": {
    "command": "claude",
    "args": ["-p", "{{prompt}}"],   // {{prompt}} = payload[promptField]
    "promptField": "prompt",
    "timeoutMs": 600000,
    "passPayloadEnv": true
  }
}
```

The executor runs as `spawn(command, args)` with an **argv array — never a
shell** — so a command's prompt can't inject shell. The dispatch is also exposed
to the child via `STARSHIP_DISPATCH_PAYLOAD`, `STARSHIP_COMMAND_TYPE`,
`STARSHIP_DISPATCH_ID`.

For servers, skip `init` and set env: `STARSHIP_MCP_URL`, `STARSHIP_AGENT_TOKEN`,
`STARSHIP_EXECUTOR` (e.g. `"claude -p {{prompt}}"`).

## Commands

| Command | Description |
| --- | --- |
| `init` | Interactive setup |
| `test` | Connect and list pending commands |
| `run [--once] [--poll-interval ms] [--executor "<cmd>"]` | Poll and execute |
| `run --control-port <port> [--control-token <tok>]` | Also expose a loopback control API (used by the desktop app) |
| `status [--control-port <port> --control-token <tok>]` | Show config / live status |

## Security

You are running commands on behalf of whoever can create dispatches in your
Starship. Only connect a token for a Starship you trust, and scope the executor
to a command you're comfortable running unattended.
