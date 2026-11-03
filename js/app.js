/* Kuiz SDZ — permainan kuiz masa nyata (host + pemain) menggunakan PeerJS (WebRTC).
 * Tiada pelayan sendiri diperlukan: skrin admin menjadi "hos", peranti pemain
 * menyambung terus kepadanya melalui kod 6 digit. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- utiliti
  const PREFIX = "sdzkuiz-v1-";
  const SHAPES = ["★", "●", "▲", "■"];
  const LETTERS = ["A", "B", "C", "D"];
  const AVATARS = ["🐱", "🐶", "🐼", "🦊", "🐸", "🐵", "🐯", "🐨", "🐰", "🐻", "🦁", "🐷", "🐧", "🐙", "🦄", "🐢", "🐳", "🦉", "🐝", "🦖", "🐬", "🦋", "🐤", "🐮"];
  const INTRO_MS = 3000;

  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const params = new URLSearchParams(location.search);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const store = {
    get(k, def, s = sessionStorage) { try { const v = s.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v, s = sessionStorage) { try { s.setItem(k, JSON.stringify(v)); } catch {} },
    del(k, s = sessionStorage) { try { s.removeItem(k); } catch {} }
  };

  function peerOptions() {
    // ?peer=host:port membolehkan pelayan PeerJS sendiri (untuk ujian / rangkaian sekolah)
    const custom = params.get("peer");
    const opts = { debug: Number(params.get("debug") || 0) };
    if (custom) {
      const [host, port] = custom.split(":");
      Object.assign(opts, { host, port: Number(port || 443), path: params.get("peerpath") || "/", secure: (port || "443") === "443" });
    }
    return opts;
  }

  function show(id) {
    document.querySelectorAll(".screen.active").forEach(s => s.classList.remove("active"));
    const s = document.getElementById(id);
    s.classList.add("active");
    s.scrollTop = 0;
    document.body.classList.remove("res-ok", "res-bad");
  }
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms);
  }
  function overlay(msg, onCancel) {
    const o = $("#overlay"), c = $("#overlay-cancel");
    c.hidden = !onCancel; c.onclick = onCancel || null;
    if (msg) { $("#overlay-msg").textContent = msg; o.classList.add("show"); } else o.classList.remove("show");
  }
  function shake(node) { node.classList.remove("shake"); void node.offsetWidth; node.classList.add("shake"); }
  function rankOf(sorted, p) {
    // kedudukan dengan markah sama berkongsi tempat
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].score < sorted[i - 1].score) rank = i + 1;
      if (sorted[i] === p) return rank;
    }
    return sorted.length;
  }
  function makeOptionContent(node, i, text) {
    node.append(el("span", "shape", SHAPES[i]));
    const t = el("span", "txt");
    t.append(el("span", "letter", LETTERS[i] + ". "), document.createTextNode(text));
    node.append(t);
  }

  // ---------------------------------------------------------------- bar atas
  const muteBtn = $("#btn-mute");
  function applyMute(m) { SFX.setMuted(m); muteBtn.textContent = m ? "🔇" : "🔊"; store.set("sdz-mute", m, localStorage); }
  applyMute(store.get("sdz-mute", false, localStorage));
  muteBtn.onclick = () => applyMute(!SFX.isMuted());
  $("#btn-full").onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };
  // Kata laluan admin (semakan di pelayar sahaja: menghalang murid, bukan keselamatan sebenar)
  const ADMIN_PASS = "0000";
  const dlgAdmin = $("#dlg-admin");
  $("#btn-admin").onclick = () => {
    SFX.click();
    if (store.get("sdz-admin", false)) return Host.enter();
    $("#in-admin").value = ""; $("#admin-err").textContent = "";
    dlgAdmin.showModal();
    setTimeout(() => $("#in-admin").focus(), 50);
  };
  $("#btn-admin-cancel").onclick = () => { SFX.click(); dlgAdmin.close(); };
  $("#form-admin").onsubmit = e => {
    e.preventDefault();
    if ($("#in-admin").value === ADMIN_PASS) {
      store.set("sdz-admin", true);
      dlgAdmin.close(); SFX.correct(); Host.enter();
    } else {
      $("#admin-err").textContent = "Kata laluan salah.";
      $("#in-admin").value = "";
      shake($("#form-admin")); SFX.wrong();
    }
  };

  // ======================================================================
  //                                PEMAIN
  // ======================================================================
  const Player = (() => {
    const P = {
      peer: null, conn: null, pin: null, cid: null, name: "", avatar: 0,
      joined: false, ended: false, retry: 0, timer: null, qIdx: -1, connecting: false
    };
    const saved = store.get("sdz-player", null);
    P.avatar = saved?.avatar ?? Math.floor(Math.random() * AVATARS.length);

    // --- borang kod
    const pinIn = $("#in-pin");
    pinIn.addEventListener("input", () => { pinIn.value = pinIn.value.replace(/\D/g, "").slice(0, 6); $("#pin-err").textContent = ""; });
    $("#form-pin").onsubmit = e => {
      e.preventDefault();
      const pin = pinIn.value.trim();
      if (!/^\d{6}$/.test(pin)) { $("#pin-err").textContent = "Kod mesti 6 nombor."; shake($("#form-pin")); SFX.wrong(); return; }
      SFX.click();
      connect(pin, false);
    };

    // --- borang nama & avatar
    const avCur = $("#av-cur");
    const setAv = i => { P.avatar = (i + AVATARS.length) % AVATARS.length; avCur.textContent = AVATARS[P.avatar]; avCur.classList.remove("pop-in"); void avCur.offsetWidth; avCur.classList.add("pop-in"); };
    $("#av-prev").onclick = () => { SFX.pop(); setAv(P.avatar - 1); };
    $("#av-next").onclick = () => { SFX.pop(); setAv(P.avatar + 1); };
    avCur.onclick = () => { SFX.pop(); setAv(Math.floor(Math.random() * AVATARS.length)); };
    $("#form-name").onsubmit = e => {
      e.preventDefault();
      const name = $("#in-name").value.replace(/\s+/g, " ").trim();
      if (name.length < 2) { $("#name-err").textContent = "Nama sekurang-kurangnya 2 huruf."; shake($("#form-name")); SFX.wrong(); return; }
      P.name = name; SFX.click();
      sendJoin();
    };
    $("#pe-again").onclick = () => { SFX.click(); leave(); };

    function setInGame(on) { document.body.classList.toggle("in-game", on); }

    function cleanup() {
      clearInterval(P.timer);
      try { P.conn?.close(); } catch {}
      try { P.peer?.destroy(); } catch {}
      P.peer = P.conn = null;
    }
    function leave(msg) {
      clearTimeout(P.retryT);
      cleanup();
      store.del("sdz-player");
      P.joined = false; P.ended = false; P.cid = null;
      setInGame(false);
      show("p-join");
      overlay(null);
      if (msg) { $("#pin-err").textContent = msg; }
      if (history.replaceState) history.replaceState(null, "", location.pathname);
    }

    function connect(pin, rejoin) {
      if (P.connecting) return;
      cleanup();
      P.connecting = true;
      P.pin = pin;
      if (!rejoin || P.retry === 0) overlay(rejoin ? "Menyambung semula…" : "Mencari permainan…");
      const peer = new Peer(peerOptions());
      P.peer = peer;
      let opened = false;
      const fail = (msg) => {
        if (P.peer !== peer) return;
        P.connecting = false;
        if (rejoin && P.joined && !P.ended && P.retry < 40) { scheduleRetry(); return; }
        overlay(null);
        cleanup();
        if (!P.joined) { $("#pin-err").textContent = msg; shake($("#form-pin")); SFX.wrong(); show("p-join"); }
        else leave(msg);
      };
      const to = setTimeout(() => { if (!opened) fail("Tidak dapat menyambung. Semak kod & internet kamu."); }, 12000);
      peer.on("open", () => {
        const conn = peer.connect(PREFIX + pin, { reliable: true });
        P.conn = conn;
        conn.on("open", () => {
          opened = true; clearTimeout(to);
          P.lastSeen = Date.now();
          P.connecting = false; P.retry = 0;
          overlay(null);
          if (P.cid && P.name) sendJoin();
          else { show("p-name"); setAv(P.avatar); setTimeout(() => $("#in-name").focus(), 300); }
        });
        conn.on("data", onData);
        conn.on("close", () => onClose(conn));
        conn.on("error", () => onClose(conn));
      });
      peer.on("error", err => {
        clearTimeout(to);
        if (err.type === "peer-unavailable") fail("Kod tidak dijumpai. Semak semula kod di skrin.");
        else if (!opened) fail("Tidak dapat menyambung. Semak internet kamu.");
      });
    }
    function scheduleRetry() {
      P.retry++;
      overlay(P.retry < 3 ? `Sambungan terputus. Menyambung semula… (${P.retry})` : `Menunggu skrin guru dibuka semula… (${P.retry})`,
        () => { SFX.click(); leave("Masukkan kod permainan untuk masuk semula."); });
      clearTimeout(P.retryT);
      P.retryT = setTimeout(() => connect(P.pin, true), Math.min(1500 + P.retry * 700, 5000));
    }
    function onClose(conn) {
      if (conn !== P.conn) return;
      clearInterval(P.timer);
      if (P.ended) return;
      if (P.joined) scheduleRetry();
    }
    function send(msg) { if (P.conn && P.conn.open) P.conn.send(msg); }
    function sendJoin() {
      if (!P.cid) P.cid = uid();
      $("#name-err").textContent = "";
      send({ t: "join", cid: P.cid, name: P.name, avatar: P.avatar });
    }

    function onData(m) {
      P.lastSeen = Date.now();
      if (P.ended && (m.t === "wait" || m.t === "ready" || m.t === "question")) {
        // guru memulakan permainan baharu dalam bilik yang sama
        P.ended = false;
        store.set("sdz-player", { pin: P.pin, cid: P.cid, name: P.name, avatar: P.avatar });
        setInGame(true);
      }
      switch (m.t) {
        case "joined":
          P.joined = true; P.name = m.name;
          store.set("sdz-player", { pin: P.pin, cid: P.cid, name: P.name, avatar: P.avatar });
          setInGame(true);
          $("#pw-avatar").textContent = AVATARS[P.avatar];
          $("#pw-name").textContent = P.name;
          $("#pres-name").textContent = P.name;
          if (!m.rejoin) { SFX.correct(); FX.burstAt($("#pw-avatar"), 26); }
          if (!m.silent) waitScreen(m.msg);
          break;
        case "error":
          if (m.code === "name") { P.cid = null; show("p-name"); $("#name-err").textContent = m.msg; shake($("#form-name")); SFX.wrong(); }
          else leave(m.msg);
          break;
        case "wait": waitScreen(m.msg); break;
        case "ready": readyScreen(m); break;
        case "question": questionScreen(m); break;
        case "ack": sentScreen(m.choice); break;
        case "result": resultScreen(m); break;
        case "end": endScreen(m); break;
        case "kicked": SFX.wrong(); leave("Kamu telah dikeluarkan daripada permainan oleh guru."); break;
      }
    }

    function waitScreen(msg) {
      clearInterval(P.timer);
      $("#pw-msg").textContent = msg || "Tengok skrin di hadapan. Permainan akan bermula sebentar lagi…";
      show("p-wait");
    }
    function readyScreen(m) {
      clearInterval(P.timer);
      $("#pr-num").textContent = `Soalan ${m.idx + 1} / ${m.total}`;
      show("p-ready");
      let n = Math.ceil((m.ms || INTRO_MS) / 1000);
      const c = $("#pr-count");
      const step = () => { c.textContent = n; c.classList.remove("tick"); void c.offsetWidth; c.classList.add("tick"); SFX.countdown(n === 1); };
      step();
      P.timer = setInterval(() => { n--; if (n <= 0) { clearInterval(P.timer); return; } step(); }, 1000);
    }
    function questionScreen(m) {
      clearInterval(P.timer);
      P.qIdx = m.idx;
      $("#pa-num").textContent = `${m.idx + 1} / ${m.total}`;
      $("#pa-q").textContent = m.q;
      const box = $("#pa-answers"); box.innerHTML = "";
      m.o.forEach((txt, i) => {
        const b = el("button", `ans c${i}`);
        b.type = "button";
        makeOptionContent(b, i, txt);
        b.onclick = () => answer(i, b);
        box.append(b);
      });
      show("p-answer");
      const end = Date.now() + m.remaining;
      const total = m.time;
      const bar = $("#pa-bar"), tEl = $("#pa-timer");
      let last = -1;
      const upd = () => {
        const left = Math.max(0, end - Date.now());
        bar.style.transform = `scaleX(${left / total})`;
        const s = Math.ceil(left / 1000);
        if (s !== last) { last = s; tEl.textContent = s; tEl.classList.toggle("urgent", s <= 5); }
        if (left <= 0) { clearInterval(P.timer); box.querySelectorAll("button").forEach(b => b.disabled = true); }
      };
      upd();
      P.timer = setInterval(upd, 100);
    }
    function answer(i, btn) {
      const box = $("#pa-answers");
      box.querySelectorAll("button").forEach(b => { b.disabled = true; if (b !== btn) b.classList.add("dim"); });
      SFX.lock();
      FX.burstAt(btn, 18);
      send({ t: "answer", idx: P.qIdx, choice: i });
    }
    function sentScreen(choice) {
      clearInterval(P.timer);
      const b = $("#ps-badge");
      b.textContent = SHAPES[choice];
      b.style.background = `var(--c${choice})`;
      setTimeout(() => show("p-sent"), 250);
    }
    function resultScreen(m) {
      clearInterval(P.timer);
      show("p-result");
      document.body.classList.add(m.correct ? "res-ok" : "res-bad");
      const icon = $("#pres-icon");
      icon.className = "result-icon" + (m.correct ? "" : " bad");
      icon.textContent = m.correct ? "✔" : (m.answered ? "✖" : "⏰");
      $("#pres-title").textContent = m.correct ? pick(["Betul!", "Hebat!", "Syabas!", "Terbaik!"]) : (m.answered ? pick(["Alamak!", "Hampir!", "Tak apa!"]) : "Masa tamat!");
      $("#pres-points").textContent = m.correct ? `+ ${m.points}` : "+ 0";
      $("#pres-streak").textContent = m.streak >= 2 ? `🔥 ${m.streak} betul berturut-turut!` : "";
      let note;
      if (!m.correct) note = `Jawapan betul: ${LETTERS[m.correctIdx]}. ${m.correctText}`;
      else if (m.rank === 1) note = "Kamu di tempat pertama! 🥇";
      else note = `Tempat ke-${m.rank}` + (m.behind ? ` • ${m.behind.diff} mata di belakang ${m.behind.name}` : "");
      $("#pres-note").textContent = note;
      $("#pres-score").textContent = m.score;
      if (m.correct) {
        SFX.correct();
        setTimeout(() => FX.burstAt(icon, 36), 200);
        if (m.streak >= 3) setTimeout(() => SFX.streak(), 500);
      } else SFX.wrong();
    }
    function endScreen(m) {
      clearInterval(P.timer);
      P.ended = true;
      store.del("sdz-player");
      setInGame(false);
      show("p-end");
      const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
      $("#pe-medal").textContent = medals[m.rank] || "🌟";
      $("#pe-title").textContent = m.rank <= 3 ? "Tahniah!" : "Syabas!";
      $("#pe-rank").textContent = `Tempat ke-${m.rank} daripada ${m.total}`;
      $("#pe-score").textContent = `${m.score} mata • ${m.correct}/${m.questions} betul`;
      $("#pe-msg").textContent = m.rank <= 3 ? "Kamu memang hebat! Terima kasih kerana bermain." : "Terus berusaha! Terima kasih kerana bermain.";
      if (m.rank <= 3) { SFX.fanfare(); FX.confetti(); }
      else { SFX.reveal(); FX.rain(60); }
    }

    // degupan: hos menghantar "ping" setiap 2s; jika senyap terlalu lama, anggap terputus
    setInterval(() => {
      if (!P.joined || P.ended || P.connecting || !P.conn) return;
      if (P.conn.open) send({ t: "ping" });
      if (Date.now() - (P.lastSeen || 0) > 7000) {
        const c = P.conn; P.conn = null;
        try { c.close(); } catch {}
        clearInterval(P.timer);
        scheduleRetry();
      }
    }, 2000);

    // sambung semula apabila tab kembali aktif (cth: telefon tidur)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && P.joined && !P.ended && !P.connecting && !(P.conn && P.conn.open)) connect(P.pin, true);
    });

    function boot() {
      const urlPin = params.get("pin");
      if (saved && saved.pin && (!urlPin || urlPin === saved.pin)) {
        P.cid = saved.cid; P.name = saved.name; P.joined = true;
        pinIn.value = saved.pin;
        connect(saved.pin, true);
      } else if (urlPin && /^\d{6}$/.test(urlPin)) {
        pinIn.value = urlPin;
        connect(urlPin, false);
      }
    }
    return { boot, leave, stop: cleanup };
  })();

  // ======================================================================
  //                                  HOS
  // ======================================================================
  const Host = (() => {
    const H = {
      peer: null, pin: null, setIdx: 0, time: 20, shuffle: false, explain: true,
      questions: [], players: new Map(), phase: "setup", qIdx: -1, qStart: 0, qEnd: 0,
      answers: new Map(), timer: null, introT: null, lastResults: new Map(),
      order: [], startIdx: 0, resumed: false, played: 0
    };

    // --- simpan kemajuan supaya guru boleh sambung semula jika tab tertutup
    const SAVE_KEY = "sdz-host";
    function save(next) {
      store.set(SAVE_KEY, {
        pin: H.pin, setIdx: H.setIdx, time: H.time, explain: H.explain, order: H.order, next, played: H.played, at: Date.now(),
        players: [...H.players.values()].map(p => ({ cid: p.cid, name: p.name, avatar: p.avatar, score: p.score, streak: p.streak, correct: p.correct }))
      }, localStorage);
    }
    function loadSaved() {
      const sv = store.get(SAVE_KEY, null, localStorage);
      if (!sv || !QUIZ_SETS[sv.setIdx] || !Array.isArray(sv.order) || Date.now() - sv.at > 12 * 3600e3) return null;
      if (sv.next >= sv.order.length) return null;
      return sv;
    }
    const clearSaved = () => store.del(SAVE_KEY, localStorage);

    function refreshSetup() {
      const set = QUIZ_SETS[H.setIdx];
      const sel = $("#sel-start");
      sel.innerHTML = "";
      set.questions.forEach((q, i) => { const o = el("option", null, `${i + 1}. ${q.tag}`); o.value = i; sel.append(o); });
      sel.disabled = $("#opt-shuffle").checked;
      const sv = loadSaved();
      $("#resume-card").hidden = !sv;
      if (sv) {
        const ss = QUIZ_SETS[sv.setIdx];
        const ago = Math.max(1, Math.round((Date.now() - sv.at) / 60000));
        $("#resume-text").textContent = `${ss.emoji} ${ss.title} • sambung dari soalan ${sv.next + 1} / ${sv.order.length} • ${sv.players.length} pemain • ${ago} minit lalu`;
      }
    }
    $("#opt-shuffle").addEventListener("change", () => { const sel = $("#sel-start"); sel.disabled = $("#opt-shuffle").checked; if (sel.disabled) sel.value = 0; });
    $("#btn-resume-discard").onclick = () => { SFX.click(); if (confirm("Buang permainan yang belum selesai?")) { clearSaved(); refreshSetup(); } };
    $("#btn-resume").onclick = () => {
      SFX.click();
      const sv = loadSaved(); if (!sv) return refreshSetup();
      H.setIdx = sv.setIdx; H.time = sv.time; H.explain = sv.explain; H.order = sv.order;
      H.startIdx = sv.next; H.played = sv.played || 0; H.resumed = true;
      for (const sp of sv.players) {
        const ex = H.players.get(sp.cid);
        if (ex) Object.assign(ex, { score: sp.score, streak: sp.streak, correct: sp.correct });
        else H.players.set(sp.cid, { ...sp, last: 0, connected: false, conn: null });
      }
      if (H.peer && !H.peer.destroyed && H.peer.open) { H.phase = "lobby"; showLobby(); broadcast({ t: "wait", msg: "Permainan akan disambung semula… 🎲" }); }
      else createRoom(0, sv.pin);
    };

    // --- skrin tetapan
    const grid = $("#set-grid");
    QUIZ_SETS.forEach((s, i) => {
      const b = el("button", "set-card pop-in" + (i === 0 ? " on" : ""));
      b.type = "button";
      b.style.animationDelay = (i * 0.08) + "s";
      b.append(el("span", "emo", s.emoji));
      const d = el("div"); d.append(el("b", null, s.title), el("span", null, s.subtitle)); b.append(d);
      b.onclick = () => { SFX.pop(); H.setIdx = i; grid.querySelectorAll(".set-card").forEach((c, j) => c.classList.toggle("on", j === i)); refreshSetup(); };
      grid.append(b);
    });
    $("#seg-time").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      SFX.click(); H.time = Number(b.dataset.v);
      $("#seg-time").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    });
    $("#btn-setup-back").onclick = () => {
      SFX.click();
      if (H.peer && !H.peer.destroyed) { H.phase = "lobby"; showLobby(); }
      else exit();
    };
    $("#btn-create").onclick = () => {
      SFX.click();
      H.shuffle = $("#opt-shuffle").checked;
      H.explain = $("#opt-explain").checked;
      const n = QUIZ_SETS[H.setIdx].questions.length;
      H.order = [...Array(n).keys()];
      if (H.shuffle) for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [H.order[i], H.order[j]] = [H.order[j], H.order[i]]; }
      H.startIdx = H.shuffle ? 0 : Number($("#sel-start").value) || 0;
      H.played = 0; H.resumed = false;
      if (H.peer && !H.peer.destroyed && H.peer.open) { H.phase = "lobby"; showLobby(); broadcast({ t: "wait", msg: "Guru sedang menyediakan permainan baharu… 🎲" }); }
      else createRoom();
    };
    $("#btn-start").onclick = () => { SFX.click(); startGame(); };
    $("#btn-skip").onclick = () => { SFX.click(); endQuestion(); };
    $("#btn-reveal-next").onclick = () => { SFX.click(); afterReveal(); };
    $("#btn-board-next").onclick = () => { SFX.click(); nextQuestion(); };
    $("#btn-new").onclick = () => {
      SFX.click();
      H.phase = "setup";
      SFX.stopMusic();
      refreshSetup();
      show("h-setup");
      broadcast({ t: "wait", msg: "Guru sedang menyediakan permainan baharu… 🎲" });
      // pemain yang sudah tamat perlu masuk semula; yang masih bersambung kekal
    };
    $("#btn-csv").onclick = downloadCsv;
    $("#btn-full-list").onclick = () => {
      const ol = $("#dlg-list-ol"); ol.innerHTML = "";
      sorted().forEach(p => ol.append(boardRow(p, rankOf(sorted(), p), false)));
      $("#dlg-list").showModal();
    };

    // pintasan papan kekunci untuk guru
    document.addEventListener("keydown", e => {
      if (!document.body.classList.contains("is-host")) return;
      if (e.target.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") {
        const btn = document.querySelector(".screen.active #btn-start:not(:disabled), .screen.active.revealed #btn-reveal-next, .screen.active #btn-board-next");
        if (btn) { e.preventDefault(); btn.click(); }
      }
    });
    window.addEventListener("beforeunload", e => {
      if (document.body.classList.contains("is-host") && H.players.size > 0 && H.phase !== "end") { e.preventDefault(); e.returnValue = ""; }
    });

    function enter() {
      Player.stop();
      document.body.classList.add("is-host");
      H.phase = "setup";
      refreshSetup();
      show("h-setup");
    }
    function exit() {
      SFX.stopMusic();
      try { H.peer?.destroy(); } catch {}
      H.peer = null; H.players.clear();
      document.body.classList.remove("is-host");
      show("p-join");
    }

    // --- bilik
    function createRoom(attempt = 0, preferPin = null) {
      $("#setup-err").textContent = "";
      overlay("Mencipta bilik…");
      // cuba guna semula kod lama supaya pemain boleh menyambung semula secara automatik
      const pin = preferPin && attempt === 0 ? preferPin : String(Math.floor(100000 + Math.random() * 900000));
      const peer = new Peer(PREFIX + pin, peerOptions());
      let ok = false;
      const to = setTimeout(() => { if (!ok) { try { peer.destroy(); } catch {} overlay(null); $("#setup-err").textContent = "Tidak dapat menyambung ke pelayan. Semak internet dan cuba lagi."; } }, 15000);
      peer.on("open", () => {
        ok = true; clearTimeout(to);
        H.peer = peer; H.pin = pin;
        overlay(null);
        H.phase = "lobby";
        showLobby();
      });
      peer.on("connection", conn => {
        conn.on("data", m => onData(conn, m));
        conn.on("close", () => onClose(conn));
        conn.on("error", () => onClose(conn));
      });
      peer.on("disconnected", () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1000); });
      peer.on("error", err => {
        if (err.type === "unavailable-id" && attempt < 5) { clearTimeout(to); try { peer.destroy(); } catch {} createRoom(attempt + 1); return; }
        if (err.type === "peer-unavailable") return;
        if (!ok) { clearTimeout(to); overlay(null); $("#setup-err").textContent = "Ralat sambungan: " + (err.type || err.message); }
      });
    }

    function showLobby() {
      const set = QUIZ_SETS[H.setIdx];
      if (!H.order.length || H.order.some(i => !set.questions[i])) H.order = [...set.questions.keys()];
      H.questions = H.order.map(i => set.questions[i]);
      const base = location.origin + location.pathname;
      const url = base + "?pin=" + H.pin;
      $("#hl-url").textContent = base.replace(/^https?:\/\//, "").replace(/\/index\.html$/, "/");
      $("#hl-pin").textContent = H.pin.slice(0, 3) + " " + H.pin.slice(3);
      $("#hl-set").textContent = `${set.emoji} ${set.title} • ${H.questions.length} soalan • ${H.time}s`;
      $("#btn-start").textContent = H.startIdx > 0 ? `Mula dari soalan ${H.startIdx + 1} ▶` : "Mula ▶";
      const qrBox = $("#hl-qr"); qrBox.innerHTML = "";
      try {
        const qr = qrcode(0, "M"); qr.addData(url); qr.make();
        const img = new Image(); img.alt = "Kod QR untuk masuk"; img.src = qr.createDataURL(8, 0); qrBox.append(img);
      } catch { qrBox.style.display = "none"; }
      // buang pemain yang sudah terputus semasa kembali ke lobi
      // (kecuali semasa sambung semula: markah & pemain lama dikekalkan sehingga mereka masuk semula)
      if (!H.resumed) {
        for (const [cid, p] of H.players) if (!p.connected) H.players.delete(cid);
        for (const p of H.players.values()) { p.score = 0; p.streak = 0; p.correct = 0; p.last = 0; }
      }
      renderPlayers();
      show("h-lobby");
      SFX.music("lobby");
    }

    function renderPlayers() {
      const box = $("#hl-players");
      box.querySelectorAll(".chip").forEach(c => c.remove());
      const list = [...H.players.values()];
      list.forEach(p => box.append(chip(p, false)));
      updateCount();
    }
    function chip(p, animate = true) {
      const c = el("button", "chip" + (p.connected ? "" : " off"));
      c.type = "button";
      c.dataset.cid = p.cid;
      if (!animate) c.style.animation = "none";
      c.append(el("span", "avatar", AVATARS[p.avatar] || "🙂"), el("span", null, p.name));
      c.title = "Klik untuk keluarkan " + p.name;
      c.onclick = () => { if (confirm(`Keluarkan ${p.name} daripada permainan?`)) kick(p.cid); };
      return c;
    }
    function updateCount() {
      const n = [...H.players.values()].filter(p => p.connected).length;
      $("#hl-count").textContent = n;
      $("#hl-empty").style.display = H.players.size ? "none" : "";
      $("#btn-start").disabled = n === 0;
    }
    function kick(cid) {
      const p = H.players.get(cid); if (!p) return;
      try { p.conn?.send({ t: "kicked" }); } catch {}
      setTimeout(() => { try { p.conn?.close(); } catch {} }, 300);
      H.players.delete(cid);
      const c = document.querySelector(`.chip[data-cid="${CSS.escape(cid)}"]`); c?.remove();
      updateCount();
      checkAllAnswered();
    }

    setInterval(() => {
      if (!H.peer || H.peer.destroyed) return;
      for (const p of H.players.values()) {
        if (!p.connected) continue;
        if (Date.now() - (p.seen || 0) > 9000) { const c = p.conn; onClose(c); try { c?.close(); } catch {} }
        else send(p, { t: "ping" });
      }
    }, 2000);

    function send(p, msg) { try { if (p.conn && p.conn.open) p.conn.send(msg); } catch {} }
    function broadcast(msg) { for (const p of H.players.values()) send(p, msg); }
    const connected = () => [...H.players.values()].filter(p => p.connected);
    const sorted = () => [...H.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    function onClose(conn) {
      for (const p of H.players.values()) {
        if (p.conn === conn) {
          p.connected = false;
          const c = document.querySelector(`.chip[data-cid="${CSS.escape(p.cid)}"]`);
          if ((H.phase === "lobby" || H.phase === "setup") && !H.resumed) { H.players.delete(p.cid); c?.remove(); }
          else c?.classList.add("off");
          updateCount();
          checkAllAnswered();
        }
      }
    }

    function onData(conn, m) {
      if (!m || typeof m !== "object") return;
      if (m.t === "join") return onJoin(conn, m);
      const p = [...H.players.values()].find(x => x.conn === conn);
      if (!p) return;
      p.seen = Date.now();
      if (m.t === "answer") onAnswer(p, m);
    }

    function onJoin(conn, m) {
      const name = String(m.name || "").replace(/\s+/g, " ").trim().slice(0, 14);
      const cid = String(m.cid || "").slice(0, 40);
      if (!cid || name.length < 2) return conn.send({ t: "error", code: "name", msg: "Nama tidak sah." });
      let p = H.players.get(cid);
      let rejoin = !!p, oldCid = cid;
      if (!p) {
        const clash = [...H.players.values()].find(x => x.name.toLowerCase() === name.toLowerCase());
        if (clash && !clash.connected) {
          // pemain lama (terputus) masuk semula dengan nama sama, cth. selepas guru buka semula bilik dengan kod baharu
          oldCid = clash.cid;
          H.players.delete(oldCid); clash.cid = cid; H.players.set(cid, clash);
          for (const mp of [H.answers, H.lastResults]) if (mp.has(oldCid)) { mp.set(cid, mp.get(oldCid)); mp.delete(oldCid); }
          p = clash; rejoin = true;
        }
      }
      if (!p) {
        const clash = [...H.players.values()].find(x => x.name.toLowerCase() === name.toLowerCase());
        if (clash) return conn.send({ t: "error", code: "name", msg: "Nama ini sudah digunakan. Cuba nama lain." });
        if (H.phase === "end") return conn.send({ t: "error", code: "closed", msg: "Permainan sudah tamat. Tunggu permainan baharu." });
        p = { cid, name, avatar: ((Number(m.avatar) || 0) % AVATARS.length + AVATARS.length) % AVATARS.length, score: 0, streak: 0, correct: 0, last: 0, connected: true, conn };
        H.players.set(cid, p);
      } else {
        if (p.conn && p.conn !== conn) { try { p.conn.close(); } catch {} }
        p.conn = conn; p.connected = true;
      }
      p.conn = conn; p.connected = true; p.seen = Date.now();

      // kemas kini paparan lobi
      if (H.phase === "lobby" || H.phase === "setup") {
        const old = document.querySelector(`.chip[data-cid="${CSS.escape(oldCid)}"]`);
        const c = chip(p);
        if (old) old.replaceWith(c); else $("#hl-players").append(c);
        if (!rejoin) { SFX.pop(); setTimeout(() => FX.burstAt(c, 14), 50); }
      } else {
        const old = document.querySelector(`.chip[data-cid="${CSS.escape(oldCid)}"]`);
        if (old) { old.dataset.cid = cid; old.classList.remove("off"); }
        if (!rejoin) toast(`${AVATARS[p.avatar]} ${p.name} telah masuk`);
      }
      updateCount();

      // hantar keadaan semasa kepada pemain
      const lobbyMsg = "Tengok skrin di hadapan. Permainan akan bermula sebentar lagi…";
      const midMsg = "Permainan sedang berjalan. Tunggu soalan seterusnya… ⏳";
      if (H.phase === "question") {
        send(p, { t: "joined", name: p.name, rejoin, silent: true });
        const a = H.answers.get(cid);
        if (a) send(p, { t: "ack", choice: a.choice });
        else send(p, questionMsg(Math.max(0, H.qEnd - Date.now())));
      } else if (H.phase === "reveal" || H.phase === "board") {
        const r = H.lastResults.get(cid);
        send(p, { t: "joined", name: p.name, rejoin, silent: !!r, msg: midMsg });
        if (r) send(p, r);
      } else if (H.phase === "intro") {
        send(p, { t: "joined", name: p.name, rejoin, msg: midMsg });
      } else {
        send(p, { t: "joined", name: p.name, rejoin, msg: H.phase === "setup" ? "Guru sedang menyediakan permainan… 🎲" : lobbyMsg });
      }
    }

    // --- aliran permainan
    function startGame() {
      if (!connected().length) return;
      if (!H.resumed) { for (const p of H.players.values()) { p.score = 0; p.streak = 0; p.correct = 0; p.last = 0; } H.played = 0; }
      H.resumed = false;
      H.qIdx = H.startIdx - 1;
      SFX.stopMusic();
      SFX.whoosh();
      nextQuestion();
    }
    function nextQuestion() {
      clearTimeout(H.introT); clearInterval(H.timer);
      H.qIdx++;
      if (H.qIdx >= H.questions.length) return podium();
      H.phase = "intro";
      H.lastResults.clear();
      const q = H.questions[H.qIdx];
      $("#hi-num").textContent = `Soalan ${H.qIdx + 1} / ${H.questions.length}`;
      $("#hi-tag").textContent = q.tag;
      const bar = $("#h-intro .intro-bar"); bar.classList.remove("go"); void bar.offsetWidth; bar.classList.add("go");
      show("h-intro");
      SFX.whoosh();
      broadcast({ t: "ready", idx: H.qIdx, total: H.questions.length, ms: INTRO_MS });
      H.introT = setTimeout(beginQuestion, INTRO_MS);
    }
    function questionMsg(remaining) {
      const q = H.questions[H.qIdx];
      return { t: "question", idx: H.qIdx, total: H.questions.length, q: q.q, o: q.o, time: H.time * 1000, remaining };
    }
    function beginQuestion() {
      H.phase = "question";
      H.answers.clear();
      const q = H.questions[H.qIdx];
      const scr = $("#h-question"); scr.classList.remove("revealed");
      $("#hq-num").textContent = `${H.qIdx + 1} / ${H.questions.length}`;
      $("#hq-tag").textContent = q.tag;
      const qb = $("#hq-q"); qb.textContent = q.q; qb.classList.remove("pop-in"); void qb.offsetWidth;
      $("#hq-answered").textContent = "0";
      $("#btn-skip").style.display = "";
      const box = $("#hq-options"); box.innerHTML = "";
      box.className = "h-options n" + q.o.length;
      q.o.forEach((txt, i) => {
        const o = el("div", `opt c${i}`);
        o.append(el("span", "fill"));
        makeOptionContent(o, i, txt);
        const cnt = el("span", "cnt"); cnt.append(el("b", null, "0"), el("small", null, "👤")); o.append(cnt);
        o.append(el("span", "tick", "✔"));
        box.append(o);
      });
      show("h-question");
      H.qStart = Date.now();
      H.qEnd = H.qStart + H.time * 1000;
      save(H.qIdx);
      broadcast(questionMsg(H.time * 1000));
      SFX.music("think");
      const ring = $("#hq-ring"), timerEl = $("#hq-timer"), tEl = $("#hq-time");
      const C = 276.46;
      ring.style.transition = "none"; ring.style.strokeDashoffset = 0; void ring.getBoundingClientRect(); ring.style.transition = "";
      let last = -1;
      const tick = () => {
        const left = Math.max(0, H.qEnd - Date.now());
        const s = Math.ceil(left / 1000);
        if (s !== last) {
          last = s;
          tEl.textContent = s;
          ring.style.strokeDashoffset = Math.min(C, C * (1 - (s - 1) / H.time));
          timerEl.classList.toggle("urgent", s <= 5);
          if (s <= 5 && s > 0) SFX.tickUrgent();
        }
        if (left <= 0) endQuestion();
      };
      tick();
      H.timer = setInterval(tick, 100);
    }
    function onAnswer(p, m) {
      if (H.phase !== "question" || m.idx !== H.qIdx || H.answers.has(p.cid)) return;
      const q = H.questions[H.qIdx];
      const choice = Number(m.choice);
      if (!(choice >= 0 && choice < q.o.length)) return;
      H.answers.set(p.cid, { choice, ms: Date.now() - H.qStart });
      send(p, { t: "ack", choice });
      const ac = $("#hq-answered"); ac.textContent = H.answers.size;
      const box = ac.parentElement; box.classList.remove("bump"); void box.offsetWidth; box.classList.add("bump");
      SFX.tick();
      checkAllAnswered();
    }
    function checkAllAnswered() {
      if (H.phase !== "question") return;
      const live = connected();
      if (live.length && live.every(p => H.answers.has(p.cid))) setTimeout(() => { if (H.phase === "question") endQuestion(); }, 600);
    }
    function endQuestion() {
      if (H.phase !== "question") return;
      H.phase = "reveal";
      clearInterval(H.timer);
      SFX.stopMusic();
      const q = H.questions[H.qIdx];
      const limit = H.time * 1000;
      // markah: 500–1000 bergantung pada kelajuan + bonus berturut-turut
      for (const p of H.players.values()) {
        const a = H.answers.get(p.cid);
        p.answered = !!a;
        if (a && a.choice === q.a) {
          p.streak++; p.correct++;
          const speed = Math.min(1, a.ms / limit);
          p.last = Math.round(1000 * (1 - speed / 2)) + Math.min((p.streak - 1) * 100, 500);
          p.score += p.last;
          p.wasRight = true;
        } else { p.streak = 0; p.last = 0; p.wasRight = false; }
      }
      H.played++;
      save(H.qIdx + 1);
      const list = sorted();
      for (const p of H.players.values()) {
        const rank = rankOf(list, p);
        const ahead = list.filter(x => x.score > p.score).pop();
        const r = {
          t: "result", correct: p.wasRight, answered: p.answered, points: p.last, score: p.score, streak: p.streak,
          rank, total: list.length, correctIdx: q.a, correctText: q.o[q.a],
          behind: ahead ? { name: ahead.name, diff: ahead.score - p.score } : null
        };
        H.lastResults.set(p.cid, r);
        send(p, r);
      }
      // paparan dedah jawapan
      const counts = q.o.map(() => 0);
      for (const a of H.answers.values()) counts[a.choice]++;
      const totalAns = Math.max(1, H.answers.size);
      const opts = [...document.querySelectorAll("#hq-options .opt")];
      opts.forEach((o, i) => {
        o.classList.add(i === q.a ? "right" : "wrong");
        o.querySelector(".cnt b").textContent = counts[i];
        setTimeout(() => { o.querySelector(".fill").style.width = (counts[i] / totalAns * 100) + "%"; }, 100);
      });
      $("#hq-explain").textContent = H.explain && q.why ? q.why : "";
      $("#btn-skip").style.display = "none";
      $("#btn-reveal-next").textContent = H.qIdx >= H.questions.length - 1 ? "Lihat pemenang 🏆" : "Papan markah ➜";
      $("#h-question").classList.add("revealed");
      SFX.timeUp();
      setTimeout(() => {
        SFX.reveal();
        const right = opts[q.a];
        if (right) FX.burstAt(right, 40);
      }, 350);
    }
    function afterReveal() {
      if (H.qIdx >= H.questions.length - 1) return podium();
      H.phase = "board";
      const ol = $("#hb-list"); ol.innerHTML = "";
      const list = sorted();
      list.slice(0, 5).forEach((p, i) => {
        const li = boardRow(p, rankOf(list, p), true);
        li.style.animationDelay = (i * 0.1) + "s";
        ol.append(li);
      });
      show("h-board");
      SFX.whoosh();
      SFX.music("lobby");
    }
    function boardRow(p, rank, withGain) {
      const li = el("li");
      li.append(el("span", "rk", rank), el("span", "avatar", AVATARS[p.avatar]));
      const nm = el("span", "nm", p.name);
      li.append(nm);
      if (withGain && p.streak >= 2) li.append(el("span", "str", `🔥${p.streak}`));
      const sc = el("span", "sc", p.score);
      if (withGain && p.last) sc.append(el("span", "up", `+${p.last}`));
      li.append(sc);
      return li;
    }

    function podium() {
      clearInterval(H.timer); clearTimeout(H.introT);
      H.phase = "end";
      clearSaved();
      SFX.stopMusic();
      const list = sorted();
      list.forEach(p => send(p, { t: "end", rank: rankOf(list, p), total: list.length, score: p.score, correct: p.correct, questions: H.played }));
      show("h-podium");
      $("#hp-title").textContent = "Dan pemenangnya ialah…";
      $("#hp-btns").classList.remove("show");
      [1, 2, 3].forEach(i => {
        const pod = $("#pod" + i); pod.classList.remove("show", "empty");
        const p = list[i - 1];
        if (!p) { pod.classList.add("empty"); return; }
        pod.querySelector(".avatar").textContent = AVATARS[p.avatar];
        pod.querySelector("b").textContent = p.name;
        pod.querySelector("span").textContent = p.score + " mata";
      });
      const t = (ms, fn) => setTimeout(() => { if (H.phase === "end") fn(); }, ms);
      t(900, () => { $("#pod3").classList.add("show"); SFX.reveal(); });
      t(2400, () => { $("#pod2").classList.add("show"); SFX.reveal(); });
      t(3200, () => SFX.drumroll(2.4));
      t(5700, () => {
        $("#pod1").classList.add("show");
        SFX.cymbal(); SFX.fanfare(); FX.confetti(220);
        $("#hp-title").textContent = list[0] ? `🎉 Tahniah, ${list[0].name}! 🎉` : "Tamat!";
      });
      t(7200, () => { $("#hp-btns").classList.add("show"); FX.rain(100); });
    }

    function downloadCsv() {
      const list = sorted();
      const rows = [["Kedudukan", "Nama", "Mata", "Betul", "Jumlah soalan"]];
      list.forEach(p => rows.push([rankOf(list, p), p.name, p.score, p.correct, H.played]));
      const csv = "﻿" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const set = QUIZ_SETS[H.setIdx];
      a.download = `keputusan-${set.id}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(a); a.click(); a.remove();
    }

    return { enter };
  })();

  // ---------------------------------------------------------------- mula
  if (typeof Peer === "undefined") {
    $("#pin-err").textContent = "Gagal memuatkan modul sambungan. Muat semula halaman.";
  }
  Player.boot();
})();
