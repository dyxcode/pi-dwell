export const HOST_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>Pi Dwell</title>
<link rel="stylesheet" href="/style.css">
<script src="/client.js" type="module">
</script>
</head>
<body>
<section id="gate" class="gate">
<div class="gate-card">
<div class="brand">dwell.</div>
<h1>Connect this browser.</h1>
<p id="gate-message" role="status">Checking your connection…</p>
<p>Create a pairing code on the host:</p>
<code>npm run dwell -- pair</code>
<p class="footnote">For a development host, use <code>npm run dwell -- pair --dev</code>.</p>
<form id="pair-form">
<label for="pair-code">Pairing code</label>
<input id="pair-code" pattern="[A-HJ-NP-Za-hj-np-z2-9]{8}" minlength="8" maxlength="64" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required>
<button id="pair-button" type="submit" class="action">Connect</button>
</form>
<button id="retry-button" type="button" class="text-button">Check connection ↗</button>
</div>
</section>
<div id="app" class="app-shell" hidden>
<button class="scrim" id="scrim" hidden aria-label="Close navigation">
</button>
<aside id="rail" aria-label="Navigation">
<div class="brand">dwell.<button id="close-nav" class="icon" aria-label="Close navigation">×</button>
</div>
<button class="new" id="new-session">New conversation <span>＋</span>
</button>
<div class="section-head">
<span>CONVERSATIONS</span>
<span id="session-count">00</span>
</div>
<nav id="session-list" class="session-names" aria-label="Session names">
</nav>
<div class="rail-foot">
<button id="connection-badge" class="text-button" type="button">Connecting…</button>
</div>
</aside>
<main id="chat-main">
<header>
<button id="open-nav" aria-label="Open navigation" aria-expanded="false">
<span class="menu">☰</span>
</button>
<nav id="status-list" aria-label="Session status">
</nav>
<button id="new-mobile" class="icon" type="button" aria-label="New conversation">＋</button>
</header>
<div class="notice-area">
<p id="notice" class="feedback" role="status" hidden>
</p>
<button id="dismiss-notice" type="button" aria-label="Dismiss notice">×</button>
</div>
<div id="scroll">
<div class="history-controls">
<button id="load-older" class="text-button" hidden>Load earlier messages ↑</button>
</div>
<div id="conversation">
</div>
</div>
<footer>
<div id="composer-context" class="composer-context" hidden>
<span id="composer-directory" aria-label="Current directory"></span>
<button id="choose-model" type="button" aria-label="Choose model" aria-haspopup="dialog" disabled><span id="model-label"></span><span id="thinking-label"></span><span aria-hidden="true">⌄</span></button>
</div>
<form id="composer">
<label for="message" class="sr-only">Message Pi</label>
<div class="text-editor"><textarea id="message" placeholder="Message Pi…" rows="1" disabled></textarea></div>
<input id="image-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
<div class="composer-actions"><button id="attach-image" type="button" aria-label="Add images" disabled>+ Image</button>
<div id="image-attachments" aria-label="Attached images" hidden></div>
<button id="send" type="submit" aria-label="Send message" disabled>Send ↑</button></div>
</form>
</footer>
</main>
</div>
<dialog id="new-dialog" aria-labelledby="new-title">
<div class="handle">
</div>
<div class="panel-heading">
<div>
<div class="eyebrow">NEW CONVERSATION</div>
<h2 id="new-title">Start where you are.</h2>
</div>
<button id="close-new" class="icon" aria-label="Close panel">×</button>
</div>
<form id="new-form" class="form">
<label for="directory">HOST DIRECTORY</label>
<div class="directory-input">
<input id="directory" required autocomplete="off">
<button id="browse" type="button" class="text-button">Browse</button>
</div>
<div id="directories" class="directories">
</div>
<p id="create-error" class="feedback" role="status">
</p>
<button id="create-button" class="action" type="submit">Start conversation ↗</button>
</form>
</dialog>
<dialog id="model-dialog" aria-labelledby="model-title">
<div class="handle"></div>
<div class="panel-heading">
<div><button id="back-models" type="button" class="back-models" hidden>← Models</button><h2 id="model-title">Model</h2></div>
<button id="close-model" class="icon" aria-label="Close model picker">×</button>
</div>
<label for="model-search" class="sr-only">Search models</label>
<input id="model-search" type="search" placeholder="Search models…" autocomplete="off">
<div id="model-options"></div>
<p id="model-error" class="feedback" role="status"></p>
<p class="footnote">Applies to your next message.</p>
</dialog>
<dialog id="host-dialog" aria-labelledby="host-title">
<div class="panel-heading">
<h2 id="host-title">Your host.</h2>
<button id="close-host" class="icon" aria-label="Close host details">×</button>
</div>
<p id="host-info">
</p>
<button id="logout-button" class="action">Forget this browser</button>
<p class="footnote">Disconnecting leaves your work running on the host.</p>
</dialog>
<dialog id="image-dialog" aria-labelledby="image-title"><div class="panel-heading"><h2 id="image-title">Image</h2><button id="close-image" class="icon" type="button" aria-label="Close image preview">×</button></div><img id="preview-image" alt=""></dialog></body>
</html>`;

export const STYLE = `:root{--paper:#f3eee3;--surface:#fbf8f0;--rail:#ece6da;--ink:#252329;--muted:#82796c;--line:#c8bfaf;--teal:#3e8983;--dark:#28635e;--pale:#e0ebe3;--lilac:#ccbae2;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.7 var(--sans);height:100dvh;display:flex;overflow:hidden}
button,input,textarea{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;touch-action:manipulation}
button:hover{filter:brightness(.94)}
button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--teal);outline-offset:4px}
::selection{background:var(--lilac)}
[hidden]{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.icon{width:44px;height:44px;display:grid;place-items:center;font:25px var(--mono);flex-shrink:0}
.eyebrow{font:9px/1.6 var(--mono);letter-spacing:1.5px;color:var(--muted)}
#rail{width:266px;flex-shrink:0;background:var(--rail);border-right:1px solid var(--line);padding:30px 21px 20px;display:flex;flex-direction:column;overflow-y:auto}
.brand{display:flex;align-items:center;gap:9px;font:700 30px var(--mono);letter-spacing:-1.6px;margin-bottom:39px}
.brand>span{font-size:36px;color:var(--teal)}
#close-nav{display:none;margin-left:auto}
.new{background:var(--teal);box-shadow:3px 3px var(--lilac);color:var(--surface);width:calc(100% - 3px);min-height:43px;text-align:left;padding:12px;font:600 11px var(--mono);display:flex;justify-content:space-between;align-items:center;margin:0 3px 29px 0}
.new span{font-size:17px}
.section-head{display:flex;justify-content:space-between;align-items:center;font:9px var(--mono);letter-spacing:1px;color:var(--muted);margin:0 8px 13px}
.section-head small{font-size:9px;letter-spacing:0}
.sessions{display:grid;gap:7px}
.session{border:1px solid transparent;text-align:left;display:flex;gap:11px;padding:13px 11px;min-height:67px;width:100%}
.session.active{border-color:var(--teal);background:var(--surface);box-shadow:3px 3px #cbd9ca}
.session-icon{font:13px var(--mono);color:var(--teal);padding-top:3px}
.session-title{font:600 12px var(--mono);display:block;line-height:1.5}
.session-sub{display:flex;gap:12px;font:9px var(--mono);color:var(--muted);margin-top:7px}
.rail-foot{margin-top:auto;padding-top:35px}
.connection{border-top:1px solid var(--line);padding-top:16px;font:9px/1.7 var(--mono);color:var(--muted)}
.connection i{display:inline-block;width:5px;height:5px;background:var(--muted);margin-right:6px}
.connection>span{display:block;font-size:8px;margin-top:4px;margin-left:11px;opacity:.8}
#extensions{display:flex;gap:20px;margin-bottom:17px}
#extensions:empty{display:none}
#extensions button{font:10px var(--mono);padding:8px 0;min-height:38px}
#extensions span{color:var(--teal);margin-right:5px}
main{flex:1;min-width:0;display:flex;flex-direction:column}
header{height:65px;min-height:65px;padding:0 34px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #d8d0c2}
#desktop-context{font:10px var(--mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.edition{margin-left:auto;font:9px var(--mono);letter-spacing:2px;color:#a49a8c}
#open-nav,#mobile-state{display:none}
#scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
#conversation{max-width:758px;padding:32px 38px 30px;margin:auto}
.date{font:9px var(--mono);letter-spacing:1px;color:#a09687;margin-bottom:30px;display:flex;align-items:center;gap:14px}
.date:after{height:1px;background:#ddd5c7;content:"";flex:1}
.message{margin-bottom:33px}
.byline{display:flex;gap:9px;align-items:center;font:9px var(--mono);letter-spacing:.5px;color:var(--muted);margin-bottom:12px}
.avatar{width:20px;height:20px;display:grid;place-items:center;background:#e1d6e8;border:1px solid #c8b7d8;color:#6b587e;font-size:11px}
.assistant .avatar{background:var(--teal);color:var(--surface);border-color:var(--teal);font-size:15px}
.assistant .byline{color:var(--dark)}
.message-body{line-height:1.8}
.message-body p{margin:0 0 17px}
.message-body p:last-child{margin-bottom:0}
.user .message-body{border-left:0;padding-left:15px}
.principle{padding:4px 0 4px 17px;border-left:2px solid var(--teal);margin:24px 0}
.principle strong{font:600 14px/1.6 var(--mono);display:block;margin-bottom:8px;letter-spacing:-.4px}
.principle p{font-size:13px;color:var(--muted)}
details{border:1px solid var(--line);background:#eee8dc;margin:23px 0}
summary{list-style:none;min-height:44px;display:flex;align-items:center;gap:10px;font:10px var(--mono);cursor:pointer;padding:12px}
summary::-webkit-details-marker{display:none}
summary:before{content:'›';font-size:16px;color:var(--muted)}
details[open]>summary:before{transform:rotate(90deg)}
summary small{margin-left:auto;font-size:9px;color:var(--muted)}
.tool-body{border-top:1px dashed var(--line);padding:13px;font:11px/1.8 var(--mono);color:var(--muted)}
footer{width:100%;max-width:758px;padding:10px 38px 27px;margin:0 auto}
#composer{border:1px solid #978a75;background:var(--surface);box-shadow:4px 4px var(--lilac);padding:14px;margin-right:4px}
#composer:focus-within{border-color:var(--teal)}
textarea{width:100%;resize:none;border:0;background:none;min-height:53px;display:block;font:15px/1.6 var(--sans);outline:none}
textarea::placeholder{color:#a09686}
textarea:focus-visible{outline:none}
.composer-bottom{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:7px}
.model{color:var(--teal);font:16px var(--mono);display:flex;align-items:center;gap:8px}
.model>span{color:var(--muted);font-size:9px}
#send,.action{background:var(--teal);color:var(--surface);font:600 11px var(--mono);min-height:40px;padding:10px 15px;display:flex;align-items:center;justify-content:center;gap:17px}
#send span{font-size:20px;font-weight:400}
.carry{display:block;width:100%;border:1px solid #aaa08e;background:var(--surface);text-align:left;padding:18px 16px 17px;box-shadow:4px 4px var(--lilac);margin:0 0 32px}
.carry .eyebrow{font-size:8px;letter-spacing:1.3px}
.carry-title{font:600 17px var(--mono);letter-spacing:-.5px;margin:15px 0 8px}
.carry-note{font:11px/1.7 var(--sans);color:var(--muted)}
.carry-bottom{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e0d7c8;padding-top:12px;margin-top:19px;font:9px var(--mono);color:var(--dark)}
.memory-mark{height:126px;position:relative;display:grid;place-items:center;margin:7px 0 0;isolation:isolate}
.orbit{position:absolute;width:90px;height:90px;border:1px solid #c9bead;transform:rotate(45deg)}
.orbit.second{width:64px;height:64px;transform:rotate(0);border-color:#b0c4b8}
.orbit.third{width:32px;height:32px;background:var(--teal);border:0;box-shadow:7px 0 0 var(--lilac);transform:rotate(45deg)}
.node{position:absolute;width:8px;height:8px;background:var(--lilac);border:1px solid #b0a0be;left:calc(50% - 4px);top:8px}
.node.two{top:auto;bottom:8px;background:var(--teal);border-color:var(--teal)}
.node.three{left:calc(50% - 67px);top:calc(50% - 4px);background:var(--paper);border-color:#b4a792}
.node.four{left:calc(50% + 59px);top:calc(50% - 4px)}
.live-list{display:flex;gap:7px;flex-wrap:wrap}
.live-slot{border:1px solid var(--line);padding:10px;font:10px var(--mono);color:var(--muted);min-height:42px}
.live-slot.active{background:var(--pale);border-color:var(--teal);color:var(--dark)}
.live-slot span{margin-right:6px}
.live-slot:not(.active) .live-state{display:none}
.fresh{margin-top:22px}
.rail-caption{font:10px/1.8 var(--sans);color:var(--muted);margin:13px 3px 0}
.scrim{position:fixed;inset:0;background:#25211860;z-index:5}
dialog{background:var(--surface);color:var(--ink);border:1px solid #9d917e;box-shadow:7px 7px var(--lilac);width:min(480px,calc(100vw - 36px));max-height:85dvh;padding:25px;overflow:auto}
dialog::backdrop{background:#29231765}
.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:24px}
h2{font:600 24px/1.4 var(--mono);letter-spacing:-.8px;margin:7px 0 0}
.panel-copy{font:13px/1.8 var(--sans);color:var(--muted);margin:0 0 20px}
.memory-item{border-top:1px solid var(--line);padding:17px 0}
.memory-item .eyebrow{font-size:8px;color:var(--teal)}
.memory-item p{font:14px/1.7 var(--sans);margin:7px 0}
.memory-item small{font:9px var(--mono);color:var(--muted)}
.footnote{font:9px/1.8 var(--mono);color:var(--muted);margin-top:22px}
.form label{display:block;font:10px var(--mono);color:var(--muted);margin:16px 0 8px}
.form input{width:100%;height:44px;border:1px solid var(--line);background:var(--paper);padding:10px;font:13px var(--mono);border-radius:0}
.form .action{margin-top:23px;width:100%;box-shadow:3px 3px var(--lilac)}
.handle{display:none}
.empty{padding-top:9vh}
.empty .symbol{font:42px var(--mono);color:var(--teal)}
.empty h1{font:600 27px/1.5 var(--mono);letter-spacing:-1px}
.empty p{color:var(--muted);font-size:14px}
#toast{position:fixed;bottom:185px;left:50%;transform:translateX(-50%);max-width:90vw;background:var(--ink);color:var(--surface);padding:12px 17px;font:10px/1.7 var(--mono);z-index:30}
.task{border:1px solid var(--line);background:var(--paper);padding:15px;margin-bottom:12px}
.task strong{font:600 12px var(--mono)}
.task p{font:12px/1.8 var(--sans);color:var(--muted)}
.task small{font:9px var(--mono);color:var(--dark)}

@media(max-width:760px){#rail{position:fixed;inset:0 auto 0 0;width:min(305px,calc(100vw - 42px));transform:translateX(-101%);z-index:10;padding:24px 23px 20px}
#rail.open{transform:translateX(0)}
#close-nav{display:grid}
.brand{margin-bottom:31px}
header{height:62px;min-height:62px;padding:0 19px;border-bottom-color:var(--line)}
#desktop-context,.edition{display:none}
#open-nav{display:flex;align-items:center;gap:12px;font:600 12px var(--mono);padding:0;min-height:44px;min-width:0;text-align:left}
.menu{font:17px var(--mono);font-weight:400;color:var(--muted)}
#mobile-identity{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
.down{font-size:12px;color:var(--muted)}
#mobile-state{display:flex;align-items:center;gap:6px;margin-left:auto;white-space:nowrap;font:9px var(--mono);color:var(--dark)}
.drawer-open #mobile-state{visibility:hidden}
#conversation{padding:23px 23px 20px}
.date{font-size:8px;margin-bottom:26px}
.message{margin-bottom:28px}
.message-body{font-size:14px;line-height:1.8}
.byline{font-size:8px}
.principle{margin:22px 0}
.principle strong{font-size:13px}
.principle p{font-size:12px}
footer{padding:9px 19px max(20px,env(safe-area-inset-bottom))}
#composer{padding:12px}
textarea{font-size:16px;min-height:48px}
textarea::placeholder{font-size:14px}
dialog{position:fixed;inset:auto 0 0;margin:0;width:100%;max-width:none;max-height:86dvh;border:0;border-top:1px solid #b5a894;box-shadow:0 -5px #ccbae280;padding:14px 24px max(28px,env(safe-area-inset-bottom))}
.handle{display:block;width:32px;height:3px;background:#c6bcab;margin:0 auto 22px}
.carry{margin-bottom:28px}
.memory-mark{height:120px}
.rail-foot{padding-top:27px}
.empty{padding-top:7vh}
}

@media(max-width:350px){#mobile-identity{max-width:125px}
header{padding:0 15px;gap:9px}
.message-body{font-size:13px}
#conversation{padding-left:19px;padding-right:19px}
}

@media(max-height:620px){#rail{overflow:auto}
.rail-foot{margin-top:25px}
textarea{min-height:28px;height:32px}
.empty{padding-top:0}
}


/* Session switching and state share one top strip in both modes. */
header{padding:0 25px;gap:13px}

#status-list{display:flex;gap:8px;min-width:0;overflow-x:auto;scrollbar-width:none;align-items:center;padding:5px 2px;flex:1}

#status-list::-webkit-scrollbar{display:none}

.status-chip{display:flex;align-items:center;gap:8px;flex-shrink:0;min-height:40px;padding:10px 12px;border:1px solid var(--line);background:var(--surface);font:10px var(--mono);color:var(--muted)}

.status-chip.active{border-color:var(--teal);background:var(--pale);color:var(--dark);box-shadow:2px 2px #c8d7c9}

.chip-icon{color:var(--teal);font-size:12px}
.chip-index{font-size:9px}
.chip-state{font-size:9px}
.status-chip:not(.active) .chip-state{display:none}

.current-context{margin-bottom:30px}
.current-context h2{font-size:20px;margin:15px 0 12px;overflow-wrap:anywhere}
.current-context p{font:9px/1.8 var(--mono);color:var(--muted);overflow-wrap:anywhere}

@media(max-width:760px){header{padding:0 12px;gap:8px}
#open-nav{width:32px;min-width:32px;justify-content:center}
.status-chip{min-height:38px;padding:9px;gap:6px}
}


.session-names{display:grid;gap:6px}
.name-row{display:flex;align-items:baseline;gap:10px;text-align:left;min-height:48px;padding:13px 10px;border:1px solid transparent;width:100%}
.name-row.active{background:var(--surface);border-color:var(--teal);box-shadow:2px 2px #c8d7c9}
.name-index{font:9px var(--mono);color:var(--muted);flex-shrink:0}
.name-row .session-title{font-size:11px;overflow-wrap:anywhere;min-width:0}
.selected-directory{font:9px/1.8 var(--mono);color:var(--muted);overflow-wrap:anywhere;padding:0 10px;margin-top:21px}


#send .send-label{font:600 11px var(--mono)}

/* Mobile composer: one line, one action, bounded growth. */
@media(max-width:760px){
 footer{padding:8px 16px max(16px,env(safe-area-inset-bottom));flex-shrink:0}

 #composer{display:grid;grid-template-columns:minmax(0,1fr) 40px;align-items:end;gap:8px;padding:6px;margin-right:3px;box-shadow:3px 3px var(--lilac)}

 #message{min-width:0;min-height:30px;height:30px;margin:5px 0;padding:2px 5px;font:16px/26px var(--sans);overflow-y:hidden;overscroll-behavior:contain;scrollbar-width:thin}

 #message::placeholder{font-size:14px}

 .composer-bottom{display:contents}

 .composer-bottom .model,#send .send-label{display:none}

 #send{width:40px;height:40px;min-height:40px;padding:0;gap:0;align-self:end}

 #send>span:last-child{font:22px var(--mono)}

}



/* More room for the conversation; keep readable type and a clear rhythm. */
#conversation,footer{max-width:960px}

#conversation{padding:25px 28px 24px}

footer{padding-left:28px;padding-right:28px}

.message{margin-bottom:27px}

.byline{margin-bottom:8px}

.date{margin-bottom:23px}

.message-body{overflow-wrap:anywhere}

.message-body>p{max-width:80ch}

.message-body p{margin-bottom:14px}

.principle{margin:19px 0}

.message-body details{margin:18px 0 0}

@media(max-width:760px){
 header{height:56px;min-height:56px}

 #conversation{padding:18px 16px 20px}

 .date{margin-bottom:22px}

 .message{margin-bottom:25px}

 .message-body{font-size:15px;line-height:1.72}

 .byline{margin-bottom:8px;gap:8px}

 .user .message-body{padding-left:12px}

 .principle{padding-left:13px;margin:20px 0}

 .principle strong{font-size:13px;line-height:1.65}

 .principle p{font-size:12px;line-height:1.75}

 footer{padding:6px 12px max(12px,env(safe-area-inset-bottom))}

}


/* Desktop merges identity and status; mobile keeps the compact top strip. */
.name-content{min-width:0;display:block}
.sidebar-state{display:block;margin-top:6px;font:9px/1.6 var(--mono);color:var(--muted)}
.sidebar-state>span,.context-status>span{color:var(--teal);margin-right:4px}
.context-status{font:11px/1.7 var(--mono);color:var(--dark)}
.desktop-contexts{margin-top:2px}

@media(min-width:761px){main>header{display:none}
.name-row{min-height:65px}
.desktop-contexts .name-row{min-height:46px}
}

@media(max-width:760px){.sidebar-state,.desktop-contexts{display:none}
}


/* Desktop shares the bounded single-line composer behavior. */
@media(min-width:761px){
 footer{flex-shrink:0}

 #composer{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:end;gap:16px;padding:6px;margin-right:3px;box-shadow:3px 3px var(--lilac)}

 #message{min-width:0;min-height:30px;height:30px;margin:5px 0;padding:2px 8px;font:15px/26px var(--sans);overflow-y:hidden;overscroll-behavior:contain;scrollbar-width:thin}

 .composer-bottom{display:contents}

 .composer-bottom .model{height:40px;align-self:end;align-items:center}

 #send{height:40px;align-self:end;min-height:40px}

}


/* Sender identity stays explicit, even without decorative avatars. */
.byline{width:max-content;min-width:38px;min-height:24px;padding:3px 8px;font:700 11px/18px var(--mono);letter-spacing:.3px;margin-bottom:9px;border:1px solid transparent}

.user .byline{background:#e1d6ea;border-color:#c6b3d5;color:#51405e}

.assistant .byline{background:var(--teal);border-color:var(--teal);color:var(--surface)}

.user .message-body{background:#ede5ef;border-left:0;padding:9px 12px;max-width:80ch}

@media(max-width:760px){.byline{font-size:11px;margin-bottom:8px}
.user .message-body{padding:9px 11px}
}


.app-shell{display:contents}
.gate{position:fixed;inset:0;overflow:auto;background:var(--paper);padding:9vh 22px;z-index:50}
.gate-card{max-width:460px;margin:auto}
.gate h1{font:600 26px/1.4 var(--mono)}
.gate p{font-size:14px}
.gate code{font:12px var(--mono);overflow-wrap:anywhere}
.gate input,.form select{width:100%;height:44px;border:1px solid var(--line);background:var(--surface);padding:10px;font:13px var(--mono);border-radius:0}
.gate label{display:block;margin:24px 0 8px;font:11px var(--mono)}
.gate .action{margin-top:15px}
.text-button{font:11px var(--mono);color:var(--dark);min-height:44px;padding:10px 0;text-align:left}
.notice-area{padding:0 20px;display:flex;gap:10px;align-items:center}
.notice-area:has(#notice[hidden]){display:none}
.feedback{font:12px/1.7 var(--sans);color:#884e35;overflow-wrap:anywhere}
.notice-area button{font-size:22px;min-width:40px}
.message-body{white-space:pre-wrap}
.message-body p{margin-top:0;white-space:pre-wrap}
.tool-body{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.system .byline{color:var(--muted);background:var(--rail)}
.empty-copy{color:var(--muted);padding:12vh 0}
.history-controls{max-width:960px;margin:auto;padding:0 28px}
.history-controls:has(button[hidden]){display:none}
.directory-input{display:flex;gap:10px}
.directories{max-height:180px;overflow:auto;border-bottom:1px solid var(--line);margin-top:10px}
.directory-row{display:block;width:100%;text-align:left;padding:10px 5px;font:12px var(--mono);min-height:42px;overflow-wrap:anywhere}
.directory-row:hover{background:var(--paper)}
button:disabled{opacity:.55;cursor:default}
#send{font:22px var(--mono)}
.model{max-width:200px;overflow:hidden;white-space:nowrap}
.model>span{text-overflow:ellipsis;overflow:hidden}
.live .message-body{white-space:pre-wrap}
.empty h1{font:600 27px/1.5 var(--mono)}

@media(max-width:760px){.history-controls{padding:0 16px}
.gate{padding-top:6vh}
.notice-area{padding:0 16px}
}


#new-mobile{display:none}
@media(max-width:760px){#new-mobile{display:grid;width:38px;min-width:38px;height:38px;font:18px var(--mono);border:1px solid var(--line);background:var(--surface);color:var(--dark);padding:0}
#rail #new-session{display:none}
}

#composer{grid-template-columns:minmax(0,1fr) auto 40px;gap:8px} #choose-model{display:flex;gap:7px;align-items:center;align-self:end;min-height:40px;padding:0 9px;color:var(--dark);font:11px var(--mono);border-left:1px solid var(--line)} #model-label{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} #send{width:40px;padding:0;font-size:22px} #model-search{width:100%;height:44px;border:1px solid var(--line);background:var(--paper);font:13px var(--mono);padding:10px;border-radius:0;margin-bottom:16px} .model-option{display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 12px;border:1px solid transparent;text-align:left;min-height:64px} .model-option.selected{background:var(--pale);border-color:var(--teal)} .model-option strong{display:block;font:600 12px/1.6 var(--mono)} .model-option small{display:block;color:var(--muted);font:10px/1.8 var(--mono)} .model-option .tick{color:var(--teal)} #model-options{max-height:40dvh;overflow:auto} .directory-choice{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:48px;padding:10px 12px;text-align:left;font:12px var(--mono);border-bottom:1px solid var(--line)} .directory-choice.selected{background:var(--pale);color:var(--dark)} #directories{margin-top:12px} #connection-badge{font-size:10px;color:var(--muted)} @media(max-width:760px){#choose-model{padding:0 6px;font-size:10px;gap:5px} #model-label{max-width:88px} #message::placeholder{font-size:14px}}
#composer{grid-template-columns:minmax(0,1fr) 40px}
.composer-context{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0;margin:0 3px 2px 0;padding:0 3px}
#composer-directory{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font:10px/1.6 var(--mono)}
#choose-model{border:0;flex-shrink:0;max-width:48%;padding:0 2px;min-height:30px;align-self:auto;font-size:10px;gap:6px}
#model-label{max-width:180px;min-width:0}
@media(max-width:760px){.composer-context{gap:12px}#choose-model{min-height:32px}#model-label{max-width:140px}footer{padding-bottom:max(5px,env(safe-area-inset-bottom))}}

/* Model and thinking selection. */
#choose-model{min-width:0;gap:5px}
#model-label{flex:1;min-width:0}
#thinking-label{white-space:nowrap;flex-shrink:0;color:var(--muted);font-size:9px}
#model-dialog .panel-heading{margin-bottom:16px}
#model-dialog #model-options{max-height:44dvh}
#model-dialog .model-option{min-height:60px}
.option-arrow{font:22px var(--mono);color:var(--muted)}
.back-models{font:11px var(--mono);color:var(--dark);min-height:40px;padding:6px 0;text-align:left;margin-top:-10px}
#thinking-model{font:600 13px/1.5 var(--mono);color:var(--dark);padding:8px 0 14px;border-bottom:1px solid var(--line);margin-bottom:8px;overflow-wrap:anywhere}
#model-dialog .footnote{margin-top:16px}
@media(max-width:760px){#model-dialog{padding-left:20px;padding-right:20px}#model-label{max-width:110px}#thinking-label{font-size:9px}}

#model-dialog .back-models{margin:0 0 2px;padding:0;min-height:28px;font:11px var(--mono)}

/* A compact picker and one continuous assistant response. */
#model-dialog{width:min(380px,calc(100vw - 36px));padding:16px;box-shadow:4px 4px var(--lilac)}
#model-dialog .panel-heading{margin-bottom:12px;align-items:flex-start;gap:10px}
#model-dialog h2{font-size:17px;line-height:1.4;letter-spacing:-.3px;margin:0}
#model-dialog #model-step,#model-dialog .footnote{display:none}
#model-dialog #close-model{width:32px;height:32px;font-size:22px;margin-top:-5px;margin-right:-6px}
#model-dialog #model-search{height:38px;font-size:12px;margin-bottom:8px}
#model-dialog .model-option{min-height:50px;padding:8px 10px;border:0;border-left:2px solid transparent}
#model-dialog .model-option.selected{border-left-color:var(--teal);background:var(--pale)}
#model-dialog .model-option strong{font-size:12px;font-weight:500}
#model-dialog .model-option small{font-size:10px}
#model-dialog .back-models{min-height:28px;margin:-3px 0 5px;font-size:10px}
#model-dialog #model-options{max-height:48dvh}
.message-body .tool-run{margin:12px 0 14px;border:0;border-left:2px solid var(--line);background:transparent;padding:0 0 0 12px;white-space:normal}
.tool-run summary{padding:0;gap:8px;min-height:30px;font:12px/1.6 var(--mono)}
.tool-run summary code{min-width:0;overflow-wrap:anywhere;font:inherit;color:var(--ink)}
.tool-run summary::before{font-size:15px}
.tool-status{margin-left:auto;color:var(--teal);font:12px var(--mono);padding-right:2px}
.tool-output{margin:5px 0 0;padding:10px 12px;background:#ebe6db;color:#70695e;font:11px/1.8 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto}
.message-body .after-tool{margin:0}
@media(max-width:760px){#model-dialog{width:100%;max-width:none;padding:14px 16px max(18px,env(safe-area-inset-bottom));box-shadow:0 -3px var(--lilac)}#model-dialog .handle{margin-bottom:16px}.message-body .tool-run{padding-left:10px}.tool-output{font-size:11px}}

/* Position identifies the speaker; tools stay inline. */
#conversation .message{margin:0 0 24px;min-width:0}
#conversation .user{display:flex;justify-content:flex-end;margin-top:32px;margin-bottom:20px}
#conversation .user:first-child{margin-top:0}
#conversation .user .message-body{width:fit-content;max-width:85%;padding:10px 14px;background:#e9e0ee;border:0;border-radius:2px;overflow-wrap:anywhere}
#conversation .assistant .message-body{padding:0;background:none;border:0;overflow-wrap:anywhere}
.message-body .tool-run{margin:12px 0 14px;padding:0;border:0;border-radius:2px;background:#ebe6db;overflow:hidden}
.tool-run summary{min-height:44px;padding:9px 12px;gap:9px;font:12px/1.6 var(--mono)}
.tool-status{padding:0 1px 0 8px}
.tool-output{margin:0;padding:0 14px 12px 34px;background:transparent;color:#70695e;max-height:200px}
@media(max-width:760px){#conversation .user .message-body{max-width:90%;padding:9px 12px}#conversation .user{margin-top:28px}.message-body .tool-run{padding:0}}

/* Markdown blocks share the conversation rhythm. */
#conversation .user .message-body{max-width:100%}
#conversation .user .message-body,#conversation .assistant .message-body{font-size:15px;line-height:1.8}
.message-body.markdown,.message-body .markdown{white-space:normal;min-width:0}
.markdown p{margin:0 0 12px;white-space:normal;overflow-wrap:anywhere}
.markdown p:last-child{margin-bottom:0}
.markdown h1{font:650 23px/1.35 var(--sans);margin:24px 0 12px}
.markdown h2{font:650 19px/1.4 var(--sans);margin:24px 0 10px;letter-spacing:0}
.markdown h3,.markdown h4,.markdown h5,.markdown h6{font:650 16px/1.5 var(--sans);margin:20px 0 8px;letter-spacing:0}
.markdown>:first-child{margin-top:0}
.markdown ul,.markdown ol{margin:10px 0 16px;padding-left:24px}
.markdown li{margin:4px 0}.markdown li p{margin-bottom:4px}
.markdown li ul,.markdown li ol{margin:4px 0}
.markdown .task-item{list-style:none;position:relative}
.markdown .task-item input{position:absolute;left:-23px;top:6px;width:14px;height:14px;margin:0;accent-color:var(--teal)}
.markdown blockquote{margin:16px 0;padding:2px 0 2px 14px;border-left:2px solid var(--teal);color:#655f56}
.markdown a{color:var(--dark);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.markdown code{font:12px/1.7 var(--mono);background:#e7e1d6;padding:2px 4px;border-radius:2px}
.markdown .code-block{margin:16px 0;background:#ebe6db;border-radius:2px;overflow:hidden;max-width:100%}
.code-block figcaption{font:10px/1.5 var(--mono);color:var(--muted);padding:9px 12px 0}
.code-block pre{margin:0;padding:12px;overflow-x:auto;max-width:100%;white-space:pre;tab-size:2;overscroll-behavior-x:contain}
.code-block pre code{background:none;padding:0;font:12px/1.8 var(--mono);white-space:pre;overflow-wrap:normal}
.markdown .table-scroll{max-width:100%;overflow-x:auto;margin:16px 0;overscroll-behavior-x:contain}
.markdown table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.6}
.markdown th,.markdown td{padding:9px 12px;border-bottom:1px solid #d7cebf;min-width:110px;text-align:left;vertical-align:top}
.markdown th{background:#ebe6db;font-weight:600;color:#514b42}
.markdown hr{border:0;border-top:1px solid var(--line);margin:24px 0}

/* Context sources stay quiet until opened. */
#conversation .session-details{border:0;background:none;margin:0 0 22px;padding:0}
.session-details>summary{min-height:44px;padding:0;gap:8px;color:var(--muted);font:11px/1.6 var(--mono)}
.session-details>summary::before{font-size:15px}
.session-details>summary::after{content:'';height:1px;flex:1;margin-left:6px;background:#ddd5c8}
.session-details[open]>summary{color:var(--dark)}
.session-details-body{padding:8px 14px 10px;background:#eee8dd;border-radius:2px}
.session-details-caption{font:10px/1.5 var(--mono);color:var(--muted);margin:6px 0}
.session-details .context-source{margin:0;border:0;background:none}
.context-source>summary{padding:8px 0;gap:9px;min-height:44px;color:var(--dark);font:11px/1.7 var(--mono)}
.context-source>summary span{overflow-wrap:anywhere;min-width:0}
.context-content{padding:4px 0 12px 18px;font:13px/1.7 var(--sans);color:#514b42}
.context-content.markdown h1,.context-content.markdown h2{font-size:14px;line-height:1.5;margin:0 0 8px}
.context-source+.context-source{border-top:1px solid #ddd5c8}
#conversation .session-details+.user{margin-top:0}
@media(min-width:761px){.session-details-body{max-width:560px}}

/* Single-line composer grows into a full-width editor and bottom actions. */
#composer{grid-template-columns:34px minmax(0,1fr) 40px;gap:6px;align-items:end}
#attach-image{width:34px;height:40px;display:grid;place-items:center;color:var(--muted);padding:0;align-self:end}
#attach-image:hover{color:var(--dark);background:var(--pale)}
#message{display:block;min-width:0;min-height:30px;height:30px;max-height:180px;margin:5px 0;padding:2px 4px;font:15px/26px var(--sans);white-space:pre-wrap;overflow-wrap:anywhere;overflow-y:auto;outline:none;border:0;background:none;scrollbar-width:thin}
#message[data-empty="true"]::before{content:attr(data-placeholder);color:#a09686;pointer-events:none;float:left;height:0}
#attachment-notice{font:11px/1.6 var(--sans);color:#8d4c38;margin:9px 0 0}
.sent-image{display:block;max-width:100%;padding:0;margin:10px 0;background:none}
.sent-image img{display:block;max-width:100%;max-height:280px;object-fit:contain;border-radius:2px}
.sent-image:first-child{margin-top:0}.sent-image:last-child{margin-bottom:0}
#image-dialog{width:min(800px,calc(100vw - 32px));padding:16px;max-height:90dvh}
#image-dialog .panel-heading{margin-bottom:12px;gap:12px}
#image-dialog h2{font:12px/1.6 var(--mono);margin:0;overflow-wrap:anywhere}
#preview-image{display:block;max-width:100%;max-height:72dvh;object-fit:contain;margin:auto}
@media(max-width:760px){#message{font-size:16px}#composer{grid-template-columns:34px minmax(0,1fr) 40px;gap:4px}#image-dialog{bottom:auto;inset:0;margin:auto;width:calc(100vw - 24px);max-width:none}}

#attach-image{grid-column:1;grid-row:1}
#message{grid-column:2;grid-row:1}
#send{grid-column:3;grid-row:1}
#image-attachments{grid-column:1/-1;display:flex;gap:10px;overflow-x:auto;padding:4px 2px 6px;max-width:100%}
#composer.expanded{row-gap:8px;padding:10px}
#composer.expanded #message{grid-column:1/-1;grid-row:1;margin:0;padding:2px 3px}
#composer.expanded #image-attachments{grid-row:2}
#composer.expanded #attach-image{grid-row:3}
#composer.expanded #send{grid-row:3}
.image-attachment{position:relative;flex:0 0 76px;height:60px;border:1px solid var(--line);background:var(--paper);border-radius:2px}
.image-chip-preview{padding:0;display:block;width:100%;height:100%}
.image-chip-preview img{display:block;width:100%;height:100%;object-fit:cover}
.image-chip-remove{position:absolute;right:-1px;top:-1px;width:24px;height:24px;padding:0;background:var(--surface);border:1px solid var(--line);font:16px/20px var(--mono);color:var(--muted)}
@media(max-width:760px){#composer.expanded{padding:8px;row-gap:6px}}

/* Quiet actions and small, on-demand attachments. */
#attach-image,#send{border:0;background:transparent;box-shadow:none;width:40px;height:40px;min-height:40px;padding:0;display:grid;place-items:center;font:27px/1 var(--mono);font-weight:400}
#attach-image{color:#82796c}
#send{color:var(--teal)}
#send:disabled{background:transparent;color:#c4bbad;opacity:1}
#attach-image:hover,#send:not(:disabled):hover{background:transparent;color:var(--dark);filter:none}
#composer{grid-template-columns:40px minmax(0,1fr) 40px;gap:4px;padding:4px;box-shadow:2px 2px var(--lilac)}
#composer.expanded{padding:8px;row-gap:6px}
#composer.expanded #message{padding:2px 4px}
#composer.expanded #image-attachments{grid-column:2;grid-row:2;padding:4px 0;gap:8px;align-self:center}
#composer.expanded #attach-image,#composer.expanded #send{grid-row:2;align-self:end}
.image-attachment{flex-basis:58px;height:58px;border:0;border-radius:3px;overflow:hidden}
.image-chip-preview img{border-radius:3px}
.image-chip-remove{top:0;right:0;width:26px;height:26px;border:0;background:#fbf8f0ed;font:18px/26px var(--mono);color:#514b42;border-bottom-left-radius:3px}
@media(hover:hover) and (pointer:fine) and (min-width:761px){
 .image-chip-remove{opacity:0;transition:opacity .12s}
 .image-attachment:hover .image-chip-remove,.image-attachment:focus-within .image-chip-remove{opacity:1}
 .image-attachment:hover .image-chip-preview img{filter:brightness(.85)}
}
@media(max-width:760px){#composer.expanded{padding:6px;row-gap:4px}}

/* Text actions outside the input, with attachments immediately after + Image. */
#composer,#composer.expanded{display:flex;flex-direction:column;gap:6px;border:0;background:none;box-shadow:none;padding:0;margin-right:3px}
.text-editor{width:100%;min-width:0;padding:7px 10px;border:1px solid #978a75;background:var(--surface);box-shadow:2px 2px var(--lilac)}
.text-editor:focus-within{border-color:var(--teal)}
#composer #message,#composer.expanded #message{width:100%;margin:0;padding:2px 0}
.composer-actions{display:flex;align-items:center;gap:10px;width:100%;min-width:0}
#composer #attach-image,#composer #send{display:block;width:auto;min-width:52px;height:40px;min-height:40px;flex:0 0 auto;padding:0;font:11px/1.6 var(--mono);border:0;background:none;box-shadow:none;align-self:center}
#composer #attach-image{text-align:left;color:var(--muted)}
#composer #send{text-align:right;color:var(--teal);margin-left:auto}
#composer #send:disabled{color:#b7ad9e}
#composer #attach-image:hover,#composer #send:not(:disabled):hover{color:var(--dark)}
#composer #image-attachments,#composer.expanded #image-attachments{display:flex;flex:1 1 0;min-width:0;gap:7px;max-width:100%;padding:2px 0;align-items:center;overflow-x:auto;scrollbar-width:thin}
.image-attachment{flex:0 0 44px;width:44px;height:44px;border-radius:2px}
.image-chip-preview img{border-radius:2px}
.image-chip-remove{width:22px;height:22px;font:16px/22px var(--mono)}
@media(max-width:760px){#composer #attach-image,#composer #send{height:44px;min-height:44px}.composer-actions{gap:9px}}

/* Compact shared rhythm; keep readable body text and quiet attachment labels. */
#conversation{padding:16px 22px 18px}
footer{padding:4px 22px 8px}
#conversation .message{margin-bottom:16px}
#conversation .user{margin-top:22px;margin-bottom:14px}
#conversation .user .message-body{padding:7px 10px}
#conversation .user .message-body,#conversation .assistant .message-body{font-size:15px;line-height:1.65}
#conversation .session-details{margin-bottom:10px}
.session-details>summary{min-height:34px}
.session-details-body{padding:6px 12px 8px}
.message-body .tool-run{margin:9px 0 11px}
.tool-run summary{min-height:36px;padding:7px 10px}
.markdown p{margin-bottom:10px}
.markdown h1{margin:20px 0 10px}
.markdown h2{margin:18px 0 8px}
.markdown h3,.markdown h4,.markdown h5,.markdown h6{margin:16px 0 7px}
.markdown ul,.markdown ol{margin:8px 0 12px;padding-left:22px}
.markdown li{margin:2px 0}
.markdown blockquote{margin:12px 0}
.markdown .code-block,.markdown .table-scroll{margin:12px 0}
.code-block pre{padding:9px 10px}
.markdown th,.markdown td{padding:7px 10px}
.markdown hr{margin:18px 0}
#rail{width:228px;padding:22px 16px 16px}
.brand{font-size:27px;margin-bottom:24px}
.new{min-height:40px;padding:10px;margin-bottom:22px}
.section-head{margin-bottom:10px}
.name-row{min-height:54px;padding:10px 9px;gap:8px}
.selected-directory{margin-top:14px;padding:0 9px}
.rail-foot{padding-top:22px}
#composer,#composer.expanded{gap:2px}
.text-editor{padding:5px 9px}
.composer-context{margin-bottom:1px;padding:0 1px}
#choose-model{min-height:28px}
#composer #attach-image,#composer #send{font-size:11px;min-height:34px;height:34px}
#composer #image-attachments,#composer.expanded #image-attachments{padding:0;gap:10px}
.image-attachment{display:inline-flex;align-items:center;flex:0 0 auto;width:auto;height:34px;overflow:visible;border:0;border-radius:0;background:none}
.image-chip-preview{display:block;width:auto;height:34px;padding:0;font:11px/1.6 var(--mono);color:#514b42;white-space:nowrap}
.image-chip-preview:hover{color:var(--dark);text-decoration:underline;text-underline-offset:3px}
.image-chip-remove{position:static;width:24px;height:34px;min-width:24px;padding:0;margin:0;border:0;border-radius:0;background:none;font:16px/1 var(--mono);color:var(--muted);opacity:1}
#model-dialog .model-option{min-height:44px;padding:6px 10px}
@media(max-width:760px){
 header{height:52px;min-height:52px;padding:0 10px;gap:7px}
 #open-nav{height:44px;min-width:36px}
 #conversation{padding:10px 14px 14px}
 footer{padding:3px 14px max(4px,env(safe-area-inset-bottom))}
 #conversation .user{margin-top:20px}
 .session-details>summary{min-height:44px}
 .tool-run summary{min-height:44px}
 #choose-model{min-height:30px}
 #composer #attach-image,#composer #send,.image-chip-preview,.image-chip-remove,.image-attachment{height:44px;min-height:44px}
 .composer-actions{gap:8px}
 #composer #image-attachments,#composer.expanded #image-attachments{gap:8px}
}

/* Attachment names stay compact; full names are available on hover and preview. */
.image-chip-preview{max-width:160px;min-width:0;overflow:hidden;text-overflow:ellipsis;text-align:left}
@media(max-width:760px){.image-chip-preview{max-width:120px}}

/* Further density adjustments apply only to mobile. */
@media(max-width:760px){
 header{height:48px;min-height:48px}
 #conversation{padding:4px 12px 12px}
 #conversation .message{margin-bottom:14px}
 #conversation .user{margin-top:18px;margin-bottom:12px}
 #conversation .user .message-body{padding:6px 9px}
 #conversation .session-details{margin-bottom:4px}
 .message-body .tool-run{margin:8px 0 10px}
 footer{padding:0 12px max(2px,env(safe-area-inset-bottom))}
 .composer-context{margin:0 3px 0 0;padding:0}
 #choose-model{min-height:26px;gap:4px}
 #composer,#composer.expanded{gap:0}
 .text-editor{padding:3px 8px}
 #composer #message,#composer.expanded #message{min-height:28px;height:28px;font-size:16px;line-height:24px;padding:2px 0}
 .composer-actions{gap:8px}
 #composer #image-attachments,#composer.expanded #image-attachments{gap:6px}
 .image-chip-preview{max-width:112px}
}

/* Match the mobile action row to the 26px directory/model row. */
@media(max-width:760px){
 #composer #attach-image,#composer #send,.image-chip-preview,.image-chip-remove,.image-attachment{height:26px;min-height:26px}
 .composer-actions{min-height:26px}
}
/* Secondary details share the quiet tool treatment. */
.thinking-run,.history-diagnostic{margin:8px 0;color:var(--muted);font-size:13px}
.thinking-run>summary,.history-diagnostic>summary{cursor:pointer;font-family:var(--mono);padding:6px 0}
.thinking-content{padding:4px 0 8px}
.tool-caption{padding:0 14px 4px 34px;font:10px/1.6 var(--mono);color:var(--muted)}
.tool-run.error{border-left:2px solid var(--danger,#a65b51)}
`;
