# Directory and model selection

English | [简体中文](../../i18n/zh-CN/handbook/implementation/models.md)

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## Behavior

Session setup selects an existing host directory as Pi's project. The chooser starts at the host user's home, shows visible child directories, and returns canonical paths. It skips hidden entries and files, resolves directory symlinks to their targets, and truncates after scanning 10,000 entries or listing 500 directories.

Model discovery has two scopes. Host-wide discovery lists models in the user's Pi profile before a session opens. Session discovery reads the live Pi registry, including providers from loaded extensions. Capabilities describe image support and available thinking levels. Browsing models does not change the active selection.

<a id="ownership"></a>

## Ownership

The host filesystem owns project directories; Dwell stores the canonical choice with the session identity. Pi uses it as its working directory and applies its project-trust policy.

Pi owns the model registry and effective model/thinking state. Dwell exposes only provider/model identity and the selected model's image and thinking capabilities; credentials and private registry configuration stay inside Pi. The catalog stores Pi-confirmed choices across close and restart, while Pi's saved effective state is authoritative when reopening a native transcript.

<a id="execution"></a>

## Execution

1. The chooser resolves the requested path to an existing directory. Session creation validates it again and stores its canonical location; reopen confirms the location still resolves the same way.
2. Host-wide listing creates a private temporary Pi workspace, verifies the configured executable, copies needed Pi profile configuration, and requests Pi's model list in offline mode. The workspace is removed afterward.
3. Host-wide capability discovery starts a separate temporary Pi RPC session offline, confirms the requested model, and asks Pi for its thinking levels and image support. Identical probes share a result; at most two distinct probes run at once.
4. Session discovery requires an open Pi process. It reads the loaded registry without changing models or reopening a closed session. Results describe the exact model in that registry.
5. Model changes require an idle session. Dwell applies the choice through Pi, reads the effective state back, and saves only the confirmed selection. Pi may clamp a requested thinking level. Images are accepted only when the active model supports them.

<a id="mechanisms"></a>

## Mechanisms

Directory results contain canonical roots and children. Hidden names, files, broken links, inaccessible children, and links to files are skipped. A directory symlink is followed so the stored location is the one Pi uses. If that saved location later resolves differently, reopening stops instead of changing projects.

Global discovery loads no user session, extensions, MCP, skills, prompts, themes, context files, or project content. It copies only allowlisted profile configuration into an owner-only temporary workspace and forces Pi offline. Capability probes use the same isolation and clean up both the temporary files and Pi process. Missing optional profile files are allowed; malformed configuration or unsupported Pi output returns no partial list.

Pi prints its global model list as a formatted table. Dwell accepts the expected layout and projects only public model metadata. Changed headings, malformed rows, duplicate model identities, or an unsupported Pi version are rejected rather than guessed. Session discovery uses the live RPC registry, so extension-provided models appear after their extension loads.

Thinking levels are model-specific. Dwell omits levels Pi marks unavailable; extended levels require explicit registry support, and a model without reasoning offers only off. If Pi rejects or cannot confirm a model change, Dwell stops that runtime so it cannot continue under stale catalog metadata.

<a id="technology"></a>

## Technology

Global discovery uses Pi's offline CLI listing; an open session uses Pi RPC. The first path makes configured models available before a conversation starts. The second reflects the active registry, including extension providers. Global discovery depends on Pi's formatted output and pinned version, so strict parsing surfaces format changes.

A private temporary profile lets probes reuse Pi model and authentication configuration without loading saved sessions or project resources. Offline mode prevents provider calls. Querying an open runtime avoids a second Pi process and gets capabilities for its exact model. Both paths use Pi's own registry instead of a Dwell-maintained model table.

<a id="verification"></a>

## Verification

- A directory symlink resolves to its target. Hidden entries, files, broken links, and links to files are omitted; invalid roots fail, and large lists report truncation.
- Offline global discovery lists a synthetic configured model, leaves the source profile unchanged, and does not load extensions. Empty model output returns an empty list; changed or malformed table output is rejected.
- A model from a loaded extension appears in its active session without changing the selection. Asking for models in a closed session does not reopen it.
- Capability results match the requested provider/model and expose only supported thinking levels and image support, without provider calls.
- Model changes during work are rejected. An idle change persists Pi's confirmed model and effective thinking level across reopen without rewriting global Pi settings.
