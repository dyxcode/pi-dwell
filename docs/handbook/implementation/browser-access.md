# Browser access

English | [简体中文](../../i18n/zh-CN/handbook/implementation/browser-access.md)

[Implementation handbook](README.md)

<a id="behavior"></a>

## Behavior

A browser on the host opens Dwell directly. Remote browsers use the configured private HTTPS address and must be allowed by the tailnet policy. The browser stores no Dwell credentials.

<a id="ownership"></a>

## Ownership

The private proxy owns remote admission and TLS. Dwell listens only on loopback and separates browser traffic from local CLI administration. The CLI bearer stays private to the host.

<a id="execution"></a>

## Execution

The host checks the request authority. On the proxy lane, it expects HTTPS forwarding and rejects traffic identified as public Funnel. Browser requests pass same-origin admission before reading history or submitting work.

<a id="mechanisms"></a>

## Mechanisms

The browser sends a dedicated request marker with API calls. Mutations also need a matching origin; browser fetch metadata, if present, must indicate same-origin. The marker blocks cross-site requests; it is not a credential.

<a id="technology"></a>

## Technology

Loopback assumes a trusted local environment. Remote access relies on the private proxy: broadening the tailnet policy broadens Dwell access. Keep public Funnel off.

<a id="verification"></a>

## Verification

A fresh browser can read sessions and subscribe to events without a credential. Cross-origin traffic, explicit public Funnel requests, and remote CLI bearer requests are denied.
