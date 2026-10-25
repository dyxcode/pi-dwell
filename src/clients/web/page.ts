export const HOST_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Pi Dwell</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="page-shell">
    <header class="masthead">
      <a class="wordmark" href="/" aria-label="Pi Dwell home">pi-dwell</a>
      <span id="connection-badge" class="connection-badge" data-state="checking" role="status" aria-live="polite">Checking host</span>
    </header>

    <main>
      <section id="loading-panel" class="panel" aria-labelledby="loading-heading">
        <p class="eyebrow">Browser connection</p>
        <h1 id="loading-heading">Checking this browser</h1>
        <p>Connecting to the local Dwell host…</p>
      </section>

      <section id="pairing-panel" class="panel" aria-labelledby="pairing-heading" hidden>
        <p class="eyebrow">Browser connection</p>
        <h1 id="pairing-heading">Connect this browser</h1>
        <p id="pairing-message" class="feedback" role="alert" hidden></p>
        <div class="instructions">
          <p>Create a one-time pairing code in the terminal running this host:</p>
          <code>npm run dwell -- pair</code>
          <p>For a development host started with <code>npm run dev</code>, use <code>npm run dwell -- pair --dev</code>. Choose the command that matches how this host was started.</p>
        </div>
        <form id="pair-form" class="pair-form">
          <label for="pair-code">Pairing code</label>
          <div class="form-row">
            <input id="pair-code" name="code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" pattern="[0-9a-f]{32}" minlength="32" maxlength="32" title="Enter the 32-character lowercase hexadecimal pairing code." required>
            <button id="pair-button" type="submit">Connect browser</button>
          </div>
        </form>
        <div class="panel-actions">
          <button id="pair-retry" class="button-secondary" type="button">Check connection</button>
        </div>
      </section>

      <section id="offline-panel" class="panel" aria-labelledby="offline-heading" hidden>
        <p class="eyebrow">Browser connection</p>
        <h1 id="offline-heading">Can’t reach the Dwell host</h1>
        <p id="offline-message">Check that pi-dwell is running on this host, then try again.</p>
        <div class="panel-actions">
          <button id="retry-button" type="button">Retry</button>
        </div>
      </section>

      <section id="connected-panel" class="panel" aria-labelledby="host-heading" hidden>
        <p class="eyebrow">Current host</p>
        <h1 id="host-heading">pi-dwell</h1>
        <div id="connection-message" class="notice" role="status" aria-live="polite" hidden></div>
        <dl class="status-list">
          <div>
            <dt>Service</dt>
            <dd id="service-value">pi-dwell</dd>
          </div>
          <div>
            <dt>Host phase</dt>
            <dd id="phase-value">—</dd>
          </div>
          <div>
            <dt>Host mode</dt>
            <dd id="mode-value">—</dd>
          </div>
          <div>
            <dt>Protocol version</dt>
            <dd id="protocol-value">—</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd id="started-value">—</dd>
          </div>
          <div>
            <dt>Sessions</dt>
            <dd>Not available</dd>
          </div>
          <div>
            <dt>Background tasks</dt>
            <dd>Not available</dd>
          </div>
        </dl>
        <div class="panel-actions">
          <button id="refresh-button" type="button">Refresh status</button>
          <button id="logout-button" class="button-secondary" type="button">Forget this browser</button>
        </div>
      </section>

      <p class="page-note">Sessions and background tasks are not available in this host version.</p>
    </main>
  </div>
  <script src="/client.js" defer></script>
</body>
</html>`;

export const STYLE = `:root {
  color-scheme: light;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #192a38;
  background: #f4f6f7;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

button,
input {
  font: inherit;
}

.page-shell {
  width: min(100% - 32px, 720px);
  margin: 0 auto;
}

.masthead {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #dce3e7;
}

.wordmark {
  color: #172d3d;
  font-size: 1.1rem;
  font-weight: 750;
  letter-spacing: -0.04em;
  text-decoration: none;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 5px 11px;
  border: 1px solid #d3dde2;
  border-radius: 999px;
  background: #fff;
  color: #536673;
  font-size: 0.8rem;
  font-weight: 650;
}

.connection-badge[data-state="connected"] {
  border-color: #b7ddc8;
  background: #eff8f2;
  color: #1d6940;
}

.connection-badge[data-state="error"] {
  border-color: #efd0bc;
  background: #fff5ee;
  color: #8a3d16;
}

main {
  padding: 58px 0 32px;
}

.panel {
  padding: clamp(24px, 6vw, 40px);
  border: 1px solid #dce3e7;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 12px 36px rgb(25 42 56 / 5%);
}

.eyebrow {
  margin: 0 0 12px;
  color: #5c7483;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 12px;
  color: #172d3d;
  font-size: clamp(1.65rem, 5vw, 2.15rem);
  letter-spacing: -0.045em;
  line-height: 1.15;
}

p {
  line-height: 1.6;
}

.panel > p:not(.eyebrow) {
  color: #526672;
}

.instructions {
  margin: 24px 0;
  padding: 18px;
  border: 1px solid #e0e8eb;
  border-radius: 10px;
  background: #f7f9fa;
}

.instructions p {
  margin: 0 0 10px;
  color: #425966;
}

.instructions p:last-child {
  margin: 12px 0 0;
  font-size: 0.9rem;
}

code {
  display: inline-block;
  padding: 5px 8px;
  border: 1px solid #dce4e8;
  border-radius: 6px;
  background: #fff;
  color: #243c4b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  overflow-wrap: anywhere;
}

.pair-form label {
  display: block;
  margin-bottom: 8px;
  color: #2d4351;
  font-size: 0.9rem;
  font-weight: 650;
}

.form-row {
  display: flex;
  gap: 10px;
}

input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #bccbd3;
  border-radius: 8px;
  background: #fff;
  color: #192a38;
}

button {
  min-height: 42px;
  padding: 9px 15px;
  border: 1px solid #24556e;
  border-radius: 8px;
  background: #24556e;
  color: #fff;
  cursor: pointer;
  font-weight: 650;
  white-space: nowrap;
}

button:hover:not(:disabled) {
  background: #1c465c;
}

button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.button-secondary {
  border-color: #c7d3d9;
  background: #fff;
  color: #334b59;
}

.button-secondary:hover:not(:disabled) {
  background: #f3f6f7;
}

button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 3px solid #62a5c3;
  outline-offset: 3px;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.feedback,
.notice {
  margin: 18px 0;
  padding: 11px 13px;
  border-radius: 8px;
  background: #fff5ee;
  color: #7c3714;
  line-height: 1.5;
}

.status-list {
  margin: 25px 0 0;
  border-top: 1px solid #e6ecef;
}

.status-list > div {
  display: grid;
  grid-template-columns: minmax(130px, 0.7fr) 1fr;
  gap: 16px;
  padding: 13px 0;
  border-bottom: 1px solid #e6ecef;
}

.status-list dt {
  color: #637681;
  font-size: 0.9rem;
}

.status-list dd {
  margin: 0;
  color: #263d4b;
  font-size: 0.92rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.page-note {
  margin: 18px 4px 0;
  color: #6a7d87;
  font-size: 0.86rem;
}

[hidden] {
  display: none !important;
}

@media (max-width: 520px) {
  main {
    padding-top: 30px;
  }

  .form-row {
    flex-direction: column;
  }

  .form-row button {
    width: 100%;
  }

  .status-list > div {
    grid-template-columns: 1fr;
    gap: 5px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  button {
    transition: background-color 120ms ease;
  }
}
`;
