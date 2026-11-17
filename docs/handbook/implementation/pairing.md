# Browser pairing and access

English | [简体中文](../../i18n/zh-CN/handbook/implementation/pairing.md)

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## Behavior

Dwell separates local CLI administration from browser access. The host creates a private long-lived CLI credential on first start. The CLI uses it to request a browser pairing code, configure Pi, inspect host status, or revoke browsers. A pairing code has eight case-sensitive characters, excludes ambiguous glyphs, expires after five minutes, and works once.

Paired browser sessions last 30 days and survive host restart; pending codes and attempt counters are memory-only. A host allows ten pending codes, twenty well-formed redemption attempts per minute, and one hundred paired browsers. Malformed redemption data is rejected before it counts toward the rate limit. A browser can log itself out; the local CLI can revoke every browser and pending code.

<a id="ownership"></a>

## Ownership

The host owns the CLI credential and durable browser-session records. It stores hashes of browser cookies and binding keys with their expiry; the raw CLI credential is in a private local file. Each browser creates a random binding key in origin-scoped browser storage. Its session cookie is HttpOnly, host-only, and SameSite=Strict.

The local authority accepts CLI and paired-browser credentials. Optional remote access uses one configured production HTTPS origin through a local TLS-terminating proxy. Dwell remains bound to loopback. The proxy must preserve Host; forwarding or device-identity headers do not grant access, and the external authority rejects CLI credentials.

<a id="execution"></a>

## Execution

1. The local CLI requests a short-lived code. Dwell keeps only its hash and expiry in memory.
2. The browser submits the code with its origin-scoped binding key from the local or configured HTTPS authority.
3. The host checks the exact Host and, when present, exact Origin. It serializes redemption, checks expiry and rate limits, then saves the browser record before consuming the code or setting the cookie.
4. Later browser requests require both cookie and matching binding key. Browser mutations also require the expected Origin and a Dwell request marker. Pi executable configuration remains local CLI administration.
5. Logout removes one browser. Global revocation saves an empty browser list before clearing pending codes. Both actions revalidate and close affected event streams.

<a id="mechanisms"></a>

## Mechanisms

Cookies do not distinguish localhost ports, while browser storage is origin-scoped. The independent binding key means a copied cookie without its matching key cannot authenticate. The key and cookie are hashed before durable storage; the one-time code is hashed in memory. Serialized redemption ensures simultaneous submissions cannot both use one code. A session is issued only after its record is atomically saved. If saving fails, no cookie is returned and browser authentication remains unavailable until storage is repaired and the host restarts.

Local HTTP and configured HTTPS use separate cookie policies. The HTTPS cookie is Secure and restricted to its exact host; local HTTP cannot use Secure cookies. Exact Host selects the authority, and Origin must match it. Forwarding metadata on a local-authority request is rejected, preventing a proxy from reaching local CLI administration with a forged Host. Development has no external HTTPS authority. The private proxy configuration accepts one canonical HTTPS origin in production.

Malformed or unsafe authentication state stops startup and leaves the saved file intact. Successful changes prune expired records. Expiry is checked on the next authorization; logout and revocation also close existing streams immediately.

<a id="technology"></a>

## Technology

A random bearer credential supports local CLI administration. Browsers use a cookie plus a separate binding key, keeping the CLI secret out of browser storage and URLs while leaving the cookie HttpOnly. Hashing and atomic file replacement protect stored browser credentials and give pairing, logout, and revocation a clear persistence boundary.

Remote browser traffic passes through a trusted local HTTPS proxy, which terminates TLS and forwards requests to Dwell's loopback listener. Dwell validates the configured authority and exact origin; proxy identity claims do not authorize application access. The proxy handles encryption and tailnet/device policy, while pairing controls Dwell access. The proxy must preserve Host, and Dwell cannot verify TLS from its plaintext loopback connection.

<a id="verification"></a>

## Verification

- Concurrent redemption of one valid code creates at most one session. Used, expired, or differently cased codes fail.
- A cookie without its matching binding key is rejected. Paired sessions survive host restart; clearing origin-scoped browser storage requires pairing again.
- Mismatched Host or Origin, an unconfigured HTTPS authority, or forwarding metadata on the local authority does not grant access.
- Browser writes without the required origin protections fail. Logout and revocation remove authorization and close active streams.
- A failed session save issues no cookie and leaves durable state intact. Malformed saved state stops startup without replacing the file.
