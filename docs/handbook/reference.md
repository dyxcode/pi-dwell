# Reference

English | [简体中文](../i18n/zh-CN/handbook/reference.md)

[Documentation index](README.md)

Use this page to locate exact commands, configuration, API contracts, and implementation details. For an explanation of when to use a feature, start with the [Guide](guide.md).

## CLI commands

All commands use `npm run dwell -- <command>` from the checkout.

| Command | Effect | Mode |
| --- | --- | --- |
| `--help` | Print supported grammar | None |
| `serve` | Foreground host | Production; optional `--dev` |
| `status` | Authenticated HostStatus JSON | Production; optional `--dev` |
| `pair` | Create a one-use pairing code | Production; optional `--dev` |
| `auth revoke` | Revoke all browsers and pending pairing codes | Production; optional `--dev` |
| `pi configure --executable <absolute> [--entry-point <absolute>]` | Verify and store external Pi configuration; requires open sessions closed | Production; optional `--dev` |
| `service install` | Register the user service | Production |
| `service start` | Start and wait for authenticated readiness | Production |
| `service stop` | Stop the owned service | Production |
| `service restart` | Stop then start the owned service | Production |
| `service status` | Report manager state/readiness; Linux also reports boot settings | Production |
| `service uninstall` | Stop/remove registration, disable Linux unit autostart, preserve data | Production |

No command arguments defaults to `serve`. `npm start` runs production foreground serving; `npm run dev` runs the development host under Node watch. There are no public port/data-directory overrides or session CLI commands. See [CLI internals](cli-service.md) for parsing and errors.

## Configuration and state locations

| Item | Location or source | Meaning |
| --- | --- | --- |
| Production data | `~/.local/share/pi-dwell` | Dwell-owned local state |
| Development data | `~/.local/share/pi-dwell-dev` | Separate credentials/catalog/native sessions |
| `auth-token` | Data directory | Private local CLI bearer credential |
| `browser-sessions.json` | Data directory | Hashed browser credentials and expiries |
| `catalog.sqlite` | Data directory | Runtime configuration, session catalog, durable turn ledger |
| `sessions/<Dwell session ID>/` | Data directory | Pi native JSONL session files |
| Optional `access.json` | Production data directory | Additional canonical HTTPS browser origin |
| Pi authentication, models, settings and resources | Pi's native configuration under the host user | Owned by Pi; used by hosted execution |

The data directory must be outside repositories and Obsidian vaults and must have owner-only permissions. Private JSON/credential files require the current owner, a regular single-link file, and 0600 permissions. See [local-file internals](cli-service.md#data-path-and-private-file-rules).

Runtime executable configuration is stored through the CLI/API in SQLite, not in a user-maintained `runtime.json`. Provider credentials are configured in Pi or the service environment, not in public repository files.

## Optional HTTPS origin

Dwell continues listening on loopback. A separately managed HTTPS reverse proxy can expose one configured browser origin. The proxy must terminate TLS, preserve the configured Host authority, and keep access restricted to the intended clients. Dwell does not provision the proxy or network permissions.

After the production data directory exists, configure its private `access.json` with this exact schema, substituting your actual canonical origin:

```json
{
  "version": 1,
  "browserOrigin": "https://dwell.example"
}
```

Use a regular file owned by the service user with mode 0600. The origin has no trailing slash, path, query, or fragment. Restart the service after changing it, configure the proxy target as `http://127.0.0.1:8787`, and pair the browser at the HTTPS address. Local and HTTPS origins have separate browser bindings/cookies. CLI bearer authentication remains restricted to the local address.

The exact application behavior and acceptance checks are in [HTTP access internals](http-auth.md#authority-and-https-configuration).

## HTTP API and payload contracts

- [Complete routes, methods, authentication and response semantics](http-auth.md#complete-route-map)
- [Shared types, validation and limits](contracts.md)
- [Session/turn state and persistence](sessions-storage.md)
- [Error codes and recovery guidance](errors.md)
- [SSE framing and connection limits](http-auth.md#sse-writer-and-backpressure)

The context GET opens/reopens Pi as needed; history GET reads saved files without opening Pi. A successful turn submission acknowledges admission; completion is reported separately. Pi JSONL supplies saved conversation content. Native extension executions and durable Dwell turns have different identities and stop routes.

## Code and test reference

- [Source and symbol atlas](source-map.md): every production source file, local imports, module declarations, class members and named function declarations.
- [Test atlas](test-map.md): every test/fixture file and statically named scenario.
- [Development](development.md): scripts, toolchain configuration, checks and change workflow.
- [Glossary](glossary.md): consistent terminology across the UI, HTTP protocol, and implementation.
