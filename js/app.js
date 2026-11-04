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
    document.body.classList.toggle("playing", ["h-intro", "h-question", "h-scan", "h-board"].includes(id));
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
  let afterAdmin = null;
  function requireAdmin(fn) {
    if (store.get("sdz-admin", false)) return fn();
    afterAdmin = fn;
    $("#in-admin").value = ""; $("#admin-err").textContent = "";
    dlgAdmin.showModal();
    setTimeout(() => $("#in-admin").focus(), 50);
  }
  $("#btn-admin").onclick = () => {
    SFX.click();
    afterAdmin = null;
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
      dlgAdmin.close(); SFX.correct();
      const fn = afterAdmin; afterAdmin = null;
      fn ? fn() : Host.enter();
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
      const pq = $("#pa-q"); pq.innerHTML = "";
      if (m.pic) pq.append(el("span", "p-pic", m.pic));
      pq.append(document.createTextNode(m.q));
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
      peer: null, pin: null, selId: store.get("sdz-sel", "misi2", localStorage), set: null, time: 20, shuffle: false, explain: true,
      questions: [], players: new Map(), phase: "setup", qIdx: -1, qStart: 0, qEnd: 0,
      answers: new Map(), timer: null, introT: null, lastResults: new Map(),
      order: [], startIdx: 0, resumed: false, played: 0,
      mode: store.get("sdz-mode", "paper", localStorage), // pilihan di skrin tetapan
      paper: false,   // mod permainan semasa tanpa peranti murid (kad kertas atau Q-Card)
      qcard: false,   // mod Q-Card (imbas kamera)
      scanner: null,
      flip: [],       // tukar kedudukan A/B bagi setiap soalan
      marks: new Set(), ready: false
    };
    const GROUP_AV = [19, 4, 12, 14, 7, 3, 16, 21, 8, 10, 18, 22];
    const sets = () => CUSTOM.all();
    const selSet = () => sets().find(x => x.id === H.selId) || sets()[0];
    const flipQ = (q, f) => f ? { ...q, o: [q.o[1], q.o[0]], a: 1 - q.a } : q;

    // --- simpan kemajuan supaya guru boleh sambung semula jika tab tertutup
    const SAVE_KEY = "sdz-host";
    function save(next) {
      store.set(SAVE_KEY, {
        pin: H.pin, set: H.set, qcard: H.qcard, time: H.time, explain: H.explain, order: H.order, next, played: H.played, at: Date.now(),
        paper: H.paper, flip: H.flip,
        players: [...H.players.values()].map(p => ({ cid: p.cid, name: p.name, avatar: p.avatar, score: p.score, streak: p.streak, correct: p.correct }))
      }, localStorage);
    }
    function loadSaved() {
      const sv = store.get(SAVE_KEY, null, localStorage);
      if (!sv || !sv.set || !Array.isArray(sv.set.questions) || !Array.isArray(sv.order) || Date.now() - sv.at > 12 * 3600e3) return null;
      if (sv.order.some(i => !sv.set.questions[i])) return null;
      if (sv.next >= sv.order.length) return null;
      return sv;
    }
    const clearSaved = () => store.del(SAVE_KEY, localStorage);

    function refreshSetup() {
      renderSetGrid();
      const set = selSet();
      const sel = $("#sel-start");
      sel.innerHTML = "";
      set.questions.forEach((q, i) => { const o = el("option", null, `${i + 1}. ${q.tag}`); o.value = i; sel.append(o); });
      sel.disabled = $("#opt-shuffle").checked;
      const sv = loadSaved();
      $("#resume-card").hidden = !sv;
      if (sv) {
        const ss = sv.set;
        const ago = Math.max(1, Math.round((Date.now() - sv.at) / 60000));
        $("#resume-text").textContent = `${ss.emoji} ${ss.title} • sambung dari soalan ${sv.next + 1} / ${sv.order.length} • ${sv.qcard ? "📷 Q-Card" : sv.paper ? "📄 kad kertas" : "📱 peranti"} • ${sv.players.length} ${sv.qcard ? "murid" : sv.paper ? "kumpulan" : "pemain"} • ${ago} minit lalu`;
      }
    }
    $("#opt-shuffle").addEventListener("change", () => { const sel = $("#sel-start"); sel.disabled = $("#opt-shuffle").checked; if (sel.disabled) sel.value = 0; });
    $("#btn-resume-discard").onclick = () => { SFX.click(); if (confirm("Buang permainan yang belum selesai?")) { clearSaved(); refreshSetup(); } };
    $("#btn-resume").onclick = () => {
      SFX.click();
      const sv = loadSaved(); if (!sv) return refreshSetup();
      H.set = sv.set; H.time = sv.time;
      if (sets().some(x => x.id === sv.set.id)) H.selId = sv.set.id; H.explain = sv.explain; H.order = sv.order;
      H.startIdx = sv.next; H.played = sv.played || 0; H.resumed = true;
      H.flip = Array.isArray(sv.flip) ? sv.flip : [];
      if (sv.paper) {
        stopRoom();
        H.paper = true; H.qcard = !!sv.qcard;
        for (const sp of sv.players) H.players.set(sp.cid, { ...sp, last: 0, connected: true, conn: null });
        H.phase = "lobby"; showLobby();
        return;
      }
      if (H.paper) { H.players.clear(); H.paper = false; H.qcard = false; }
      for (const sp of sv.players) {
        const ex = H.players.get(sp.cid);
        if (ex) Object.assign(ex, { score: sp.score, streak: sp.streak, correct: sp.correct });
        else H.players.set(sp.cid, { ...sp, last: 0, connected: false, conn: null });
      }
      if (H.peer && !H.peer.destroyed && H.peer.open) { H.phase = "lobby"; showLobby(); broadcast({ t: "wait", msg: "Permainan akan disambung semula… 🎲" }); }
      else createRoom(0, sv.pin);
    };

    // --- skrin tetapan: cara menjawab & kumpulan
    function applyModeUI(paper, qcard) { document.body.classList.toggle("paper", paper); document.body.classList.toggle("qcard", !!qcard); }
    function setMode(m) {
      if (!["paper", "device", "qcard"].includes(m)) m = "paper";
      H.mode = m; store.set("sdz-mode", m, localStorage);
      $("#seg-mode").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.v === m));
      $("#btn-create").textContent = m === "paper" ? "Teruskan 📄" : m === "qcard" ? "Teruskan 📷" : "Cipta Bilik 🎉";
      applyModeUI(m !== "device", m === "qcard");
    }

    // senarai nama murid untuk Q-Card (baris N = kad nombor N)
    const rosterIn = $("#in-roster");
    const rosterNames = () => rosterIn.value.split("\n").map(x => x.replace(/\s+/g, " ").trim().slice(0, 16)).filter(Boolean).slice(0, QCARD.MAX);
    function rosterChanged() {
      const n = rosterNames();
      store.set("sdz-roster", n, localStorage);
      const total = rosterIn.value.split("\n").filter(x => x.trim()).length;
      $("#roster-count").textContent = n.length ? `${n.length} murid` + (total > QCARD.MAX ? ` (maksimum ${QCARD.MAX})` : "") : "";
    }
    rosterIn.value = store.get("sdz-roster", [], localStorage).join("\n");
    rosterIn.addEventListener("input", rosterChanged);
    $("#btn-roster-fill").onclick = () => {
      SFX.click();
      if (rosterIn.value.trim() && !confirm("Ganti senarai nama sedia ada dengan Murid 1–30?")) return;
      rosterIn.value = Array.from({ length: 30 }, (_, i) => `Murid ${i + 1}`).join("\n");
      rosterChanged();
    };
    rosterChanged();
    $("#seg-mode").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; SFX.click(); setMode(b.dataset.v); });

    let groups = store.get("sdz-groups", ["Kumpulan 1", "Kumpulan 2", "Kumpulan 3", "Kumpulan 4"], localStorage);
    const saveGroups = () => store.set("sdz-groups", groups, localStorage);
    function renderGroups(focusLast) {
      const box = $("#groups-edit"); box.innerHTML = "";
      groups.forEach((g, i) => {
        const it = el("div", "g-item");
        const inp = el("input"); inp.value = g; inp.maxLength = 16; inp.placeholder = `Kumpulan ${i + 1}`;
        inp.setAttribute("aria-label", `Nama kumpulan ${i + 1}`);
        inp.oninput = () => { groups[i] = inp.value; saveGroups(); };
        const del = el("button", null, "×"); del.type = "button"; del.title = "Buang kumpulan";
        del.onclick = () => { SFX.click(); groups.splice(i, 1); saveGroups(); renderGroups(); };
        it.append(el("span", "avatar", AVATARS[GROUP_AV[i % GROUP_AV.length]]), inp, del);
        box.append(it);
        if (focusLast && i === groups.length - 1) setTimeout(() => { inp.focus(); inp.select(); }, 0);
      });
      $("#btn-group-add").disabled = groups.length >= 12;
    }
    $("#btn-group-add").onclick = () => { SFX.pop(); groups.push(`Kumpulan ${groups.length + 1}`); saveGroups(); renderGroups(true); };
    renderGroups();

    function startQcard() {
      const names = rosterNames();
      if (!names.length) { $("#setup-err").textContent = "Masukkan senarai nama murid untuk Q-Card dahulu."; SFX.wrong(); rosterIn.focus(); return; }
      stopRoom();
      H.paper = true; H.qcard = true;
      names.forEach((name, i) => H.players.set("s" + i, { cid: "s" + i, name, avatar: i % AVATARS.length, score: 0, streak: 0, correct: 0, last: 0, connected: true, conn: null }));
      H.phase = "lobby";
      showLobby();
    }
    function stopRoom() {
      if (H.peer) { broadcast({ t: "wait", msg: "Guru telah menukar permainan. Tengok skrin di hadapan." }); try { H.peer.destroy(); } catch {} }
      H.peer = null; H.pin = null; H.players.clear();
    }
    function startPaper() {
      stopRoom();
      H.paper = true; H.qcard = false;
      const seen = new Set();
      groups.map(g => g.replace(/\s+/g, " ").trim()).filter(Boolean).forEach((name, i) => {
        let n = name; let k = 2; while (seen.has(n.toLowerCase())) n = `${name} ${k++}`;
        seen.add(n.toLowerCase());
        H.players.set("g" + i, { cid: "g" + i, name: n, avatar: GROUP_AV[i % GROUP_AV.length], score: 0, streak: 0, correct: 0, last: 0, connected: true, conn: null });
      });
      H.phase = "lobby";
      showLobby();
    }

    // --- skrin tetapan: senarai set soalan
    const grid = $("#set-grid");
    function renderSetGrid() {
      const cur = selSet();
      grid.innerHTML = "";
      sets().forEach((st, i) => {
        const b = el("div", "set-card" + (st.id === cur.id ? " on" : ""));
        b.setAttribute("role", "button"); b.tabIndex = 0;
        b.append(el("span", "emo", st.emoji || "📝"));
        const d = el("div"); d.append(el("b", null, st.title), el("span", null, st.subtitle || ""));
        if (st.custom) d.append(el("span", "set-tag", "Soalan sendiri"));
        b.append(d);
        const act = el("button", "set-act", st.custom ? "✏️ Sunting" : "📋 Salin");
        act.type = "button";
        act.title = st.custom ? "Sunting set soalan ini" : "Salin set ini untuk diubah suai";
        act.onclick = e => { e.stopPropagation(); SFX.click(); openEditor(st, !st.custom); };
        b.append(act);
        const choose = () => { SFX.pop(); H.selId = st.id; store.set("sdz-sel", st.id, localStorage); refreshSetup(); };
        b.onclick = choose;
        b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } };
        grid.append(b);
      });
    }
    $("#btn-new-set").onclick = () => { SFX.click(); openEditor(null); };
    $("#btn-be-camera").onclick = () => {
      SFX.click();
      const code = (prompt("Masukkan kod kamera 6 digit yang dipaparkan di skrin guru (📱 Guna kamera telefon):") || "").replace(/\D/g, "");
      if (!code) return;
      if (code.length !== 6) { toast("Kod mesti 6 nombor."); return; }
      exit(); Cam.start(code);
    };
    $("#btn-import-set").onclick = () => { SFX.click(); $("#in-import").click(); };
    $("#in-import").onchange = async e => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      try {
        const list = CUSTOM.parseImport(await f.text());
        let last = null;
        for (const st of list) last = CUSTOM.upsert(st);
        H.selId = last; store.set("sdz-sel", last, localStorage);
        refreshSetup(); SFX.correct();
        toast(`📥 ${list.length} set soalan diimport`);
      } catch (err) { SFX.wrong(); toast("⚠️ " + err.message, 4000); }
    };
    $("#seg-time").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      SFX.click(); H.time = Number(b.dataset.v);
      $("#seg-time").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    });
    $("#btn-setup-back").onclick = () => {
      SFX.click();
      if (H.ready) { H.phase = "lobby"; showLobby(); }
      else exit();
    };
    $("#btn-create").onclick = () => {
      SFX.click();
      $("#setup-err").textContent = "";
      const chosen = selSet();
      if (!chosen || !chosen.questions.length) { $("#setup-err").textContent = "Set soalan ini kosong."; return; }
      H.set = JSON.parse(JSON.stringify({ id: chosen.id, title: chosen.title, emoji: chosen.emoji, questions: chosen.questions }));
      H.shuffle = $("#opt-shuffle").checked;
      H.explain = $("#opt-explain").checked;
      const n = H.set.questions.length;
      H.order = [...Array(n).keys()];
      if (H.shuffle) for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [H.order[i], H.order[j]] = [H.order[j], H.order[i]]; }
      H.startIdx = H.shuffle ? 0 : Number($("#sel-start").value) || 0;
      H.played = 0; H.resumed = false;
      H.flip = H.set.questions.map(() => $("#opt-flip").checked && Math.random() < 0.5);
      if (H.mode === "paper") return startPaper();
      if (H.mode === "qcard") return startQcard();
      if (H.paper) { H.players.clear(); H.paper = false; H.qcard = false; }
      if (H.peer && !H.peer.destroyed && H.peer.open) { H.phase = "lobby"; showLobby(); broadcast({ t: "wait", msg: "Guru sedang menyediakan permainan baharu… 🎲" }); }
      else createRoom();
    };
    $("#btn-start").onclick = () => { SFX.click(); startGame(); };
    $("#btn-skip").onclick = () => { SFX.click(); H.paper ? paperRaise() : endQuestion(); };
    $("#btn-show-answer").onclick = () => { SFX.click(); H.qcard ? openScan() : endQuestion(); };
    $("#btn-scan-reveal").onclick = () => { SFX.click(); endQuestion(); };
    $("#btn-cam-switch").onclick = () => { SFX.click(); H.scanner?.switchCamera(); };

    // --- hentikan permainan
    const dlgStop = $("#dlg-stop");
    $("#btn-stop").onclick = () => { SFX.click(); dlgStop.showModal(); };
    $("#stop-cancel").onclick = () => { SFX.click(); dlgStop.close(); };
    $("#stop-results").onclick = () => { SFX.click(); dlgStop.close(); stopGame(true); };
    $("#stop-menu").onclick = () => { SFX.click(); dlgStop.close(); stopGame(false); };
    function stopGame(showResults) {
      clearInterval(H.timer); clearTimeout(H.introT);
      H.scanner?.pause();
      SFX.stopMusic();
      $("#h-question").classList.remove("raising");
      if (showResults) return podium();
      H.phase = "setup";
      clearSaved();
      H.scanner?.stop();
      broadcast({ t: "wait", msg: "Guru telah menghentikan permainan. Tengok skrin di hadapan." });
      setMode(H.mode);
      refreshSetup();
      show("h-setup");
    }

    // --- editor soalan sendiri (A / B sahaja)
    const ED_EMOJI = ["📝", "🧪", "🔢", "🌏", "📚", "🎨", "🎵", "⚽", "🐾", "💡", "🛡️", "🚀", "🍎", "🕌", "💻", "🌱"];
    let ed = null, edDirty = false;
    function openEditor(src, asCopy) {
      ed = src
        ? { id: asCopy ? null : src.id, title: asCopy ? `${src.title} (salinan)`.slice(0, 50) : src.title, emoji: src.emoji || "📝",
            questions: src.questions.map(q => ({ q: q.q, o: [q.o[0], q.o[1]], a: q.a, why: q.why || "", pic: q.pic || "" })) }
        : { id: null, title: "", emoji: "📝", questions: [{ q: "", o: ["", ""], a: 0, why: "" }] };
      edDirty = !!asCopy;
      $("#ed-err").textContent = "";
      $("#ed-title").value = ed.title;
      $("#ed-emoji").textContent = ed.emoji;
      $("#ed-delete").style.display = ed.id ? "" : "none";
      renderEditor();
      show("h-editor");
      if (!src) setTimeout(() => $("#ed-title").focus(), 300);
    }
    $("#ed-title").oninput = e => { ed.title = e.target.value; edDirty = true; };
    $("#ed-emoji").onclick = () => { SFX.pop(); ed.emoji = ED_EMOJI[(ED_EMOJI.indexOf(ed.emoji) + 1) % ED_EMOJI.length]; $("#ed-emoji").textContent = ed.emoji; edDirty = true; };
    function renderEditor(focusIdx) {
      const list = $("#ed-list"); list.innerHTML = "";
      ed.questions.forEach((q, i) => {
        const card = el("div", "ed-q"); card.dataset.i = i;
        const head = el("div", "ed-q-head");
        head.append(el("b", null, `Soalan ${i + 1}`));
        const mk = (txt, title, fn, cls) => { const b = el("button", cls || null, txt); b.type = "button"; b.title = title; b.onclick = () => { SFX.click(); fn(); edDirty = true; }; return b; };
        if (i > 0) head.append(mk("↑", "Naik", () => { [ed.questions[i - 1], ed.questions[i]] = [ed.questions[i], ed.questions[i - 1]]; renderEditor(); }));
        if (i < ed.questions.length - 1) head.append(mk("↓", "Turun", () => { [ed.questions[i + 1], ed.questions[i]] = [ed.questions[i], ed.questions[i + 1]]; renderEditor(); }));
        head.append(mk("⧉", "Salin soalan", () => { ed.questions.splice(i + 1, 0, JSON.parse(JSON.stringify(q))); renderEditor(i + 1); }));
        head.append(mk("🗑", "Padam soalan", () => {
          if ((q.q || q.o[0] || q.o[1]) && !confirm(`Padam soalan ${i + 1}?`)) return;
          ed.questions.splice(i, 1);
          if (!ed.questions.length) ed.questions.push({ q: "", o: ["", ""], a: 0, why: "" });
          renderEditor();
        }, "del"));
        const ta = el("textarea"); ta.rows = 2; ta.maxLength = 300; ta.placeholder = "Tulis soalan di sini…"; ta.value = q.q;
        ta.oninput = () => { q.q = ta.value; edDirty = true; card.classList.remove("bad"); };
        const pic = el("input", "ed-pic"); pic.maxLength = 16; pic.placeholder = "🖼️ Gambar emoji (pilihan), cth: 💻 atau 🤖➡️⭐"; pic.value = q.pic || "";
        pic.oninput = () => { q.pic = pic.value; edDirty = true; };
        card.append(head, ta, pic);
        const okBtns = [];
        [0, 1].forEach(k => {
          const row = el("div", "ed-opt");
          const inp = el("input"); inp.maxLength = 160; inp.placeholder = `Jawapan ${LETTERS[k]}`; inp.value = q.o[k];
          inp.oninput = () => { q.o[k] = inp.value; edDirty = true; card.classList.remove("bad"); };
          const ok = el("button", "ok", "✔ Betul"); ok.type = "button"; ok.title = `Tandakan ${LETTERS[k]} sebagai jawapan betul`;
          ok.onclick = () => { SFX.pop(); q.a = k; edDirty = true; okBtns.forEach((b, j) => b.classList.toggle("on", j === k)); };
          okBtns.push(ok);
          row.append(el("span", `lt c${k}`, LETTERS[k]), inp, ok);
          card.append(row);
        });
        okBtns.forEach((b, j) => b.classList.toggle("on", j === q.a));
        const why = el("input", "ed-why"); why.maxLength = 200; why.placeholder = "💡 Penerangan jawapan (pilihan)"; why.value = q.why;
        why.oninput = () => { q.why = why.value; edDirty = true; };
        card.append(why);
        list.append(card);
        if (focusIdx === i) setTimeout(() => { card.scrollIntoView({ behavior: "smooth", block: "center" }); ta.focus(); }, 50);
      });
    }
    $("#ed-add").onclick = () => {
      SFX.pop();
      ed.questions.push({ q: "", o: ["", ""], a: 0, why: "" });
      edDirty = true;
      renderEditor(ed.questions.length - 1);
    };
    function closeEditor() { setMode(H.mode); refreshSetup(); show("h-setup"); }
    $("#ed-back").onclick = () => { SFX.click(); if (edDirty && !confirm("Keluar tanpa menyimpan perubahan?")) return; closeEditor(); };
    $("#ed-save").onclick = () => {
      document.querySelectorAll(".ed-q.bad").forEach(c => c.classList.remove("bad"));
      const bad = CUSTOM.validate(ed);
      if (bad) {
        SFX.wrong(); $("#ed-err").textContent = bad.msg;
        if (bad.index != null) { const c = document.querySelector(`.ed-q[data-i="${bad.index}"]`); if (c) { c.classList.add("bad"); c.scrollIntoView({ behavior: "smooth", block: "center" }); } }
        else if (!String(ed.title).trim()) $("#ed-title").focus();
        return;
      }
      try {
        const id = CUSTOM.upsert(ed);
        H.selId = id; store.set("sdz-sel", id, localStorage);
        edDirty = false; SFX.correct(); toast("💾 Set soalan disimpan");
        closeEditor();
      } catch (err) { SFX.wrong(); $("#ed-err").textContent = err.message; }
    };
    $("#ed-delete").onclick = () => {
      if (!ed.id || !confirm(`Padam set "${ed.title}"? Tindakan ini tidak boleh dibatalkan.`)) return;
      CUSTOM.remove(ed.id);
      if (H.selId === ed.id) { H.selId = "misi2"; store.set("sdz-sel", H.selId, localStorage); }
      SFX.click(); toast("🗑️ Set soalan dipadam");
      closeEditor();
    };
    $("#ed-export").onclick = () => {
      SFX.click();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([CUSTOM.exportJSON(ed)], { type: "application/json" }));
      a.download = `soalan-${(ed.title || "kuiz").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kuiz"}.json`;
      document.body.append(a); a.click(); a.remove();
    };
    $("#btn-reveal-next").onclick = () => { SFX.click(); afterReveal(); };
    $("#btn-board-next").onclick = () => { SFX.click(); nextQuestion(); };
    $("#btn-new").onclick = () => {
      SFX.click();
      H.phase = "setup";
      SFX.stopMusic();
      setMode(H.mode);
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

    // butang "seterusnya" yang aktif (untuk papan kekunci & alat kawalan telefon)
    function nextButton(withSkip) {
      const b = document.querySelector(".screen.active #btn-start:not(:disabled), .screen.active.raising #btn-show-answer, .screen.active #btn-scan-reveal, .screen.active.revealed #btn-reveal-next, .screen.active #btn-board-next");
      if (b && b.offsetParent !== null) return b;
      if (withSkip && H.phase === "question") { const k = $("#btn-skip"); if (k.offsetParent !== null) return k; }
      return null;
    }

    // --- telefon sebagai kamera Q-Card
    H.camPeer = null; H.camPin = null; H.cams = new Set();
    const dlgPhone = $("#dlg-phone");
    document.querySelectorAll("[data-phone]").forEach(b => b.onclick = () => { SFX.click(); openPhoneDialog(); });
    function openPhoneDialog() { ensureCamRoom(); renderPhone(); dlgPhone.showModal(); }
    function ensureCamRoom(attempt = 0) {
      if (H.camPeer && !H.camPeer.destroyed) return;
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const peer = new Peer(PREFIX + "cam-" + pin, peerOptions());
      H.camPeer = peer; H.camPin = null;
      peer.on("open", () => { H.camPin = pin; renderPhone(); });
      peer.on("connection", conn => {
        conn.on("data", m => onCamData(conn, m));
        conn.on("close", () => { H.cams.delete(conn); camUI(); });
        conn.on("error", () => { H.cams.delete(conn); camUI(); });
      });
      peer.on("disconnected", () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1000); });
      peer.on("error", err => {
        if (err.type === "unavailable-id" && attempt < 5) { try { peer.destroy(); } catch {} H.camPeer = null; ensureCamRoom(attempt + 1); return; }
        if (err.type === "peer-unavailable") return;
        if (!H.camPin) { $("#phone-status").textContent = "⚠️ Tidak dapat menyambung ke internet. Cuba lagi."; try { peer.destroy(); } catch {} H.camPeer = null; }
      });
    }
    function renderPhone() {
      const st = $("#phone-status"), box = $("#phone-qr");
      if (!H.camPin) { $("#phone-pin").textContent = "··· ···"; box.innerHTML = ""; if (!st.textContent.startsWith("⚠️")) st.textContent = "Menyediakan…"; st.classList.remove("ok"); return; }
      $("#phone-pin").textContent = H.camPin.slice(0, 3) + " " + H.camPin.slice(3);
      if (box.dataset.pin !== H.camPin) {
        box.innerHTML = ""; box.dataset.pin = H.camPin;
        try {
          const qr = qrcode(0, "M"); qr.addData(location.origin + location.pathname + "?cam=" + H.camPin); qr.make();
          const img = new Image(); img.alt = "Kod QR kamera telefon"; img.src = qr.createDataURL(6, 0); box.append(img);
        } catch {}
      }
      st.textContent = H.cams.size ? `✅ ${H.cams.size} telefon disambung` : "Menunggu telefon…";
      st.classList.toggle("ok", H.cams.size > 0);
    }
    function camUI() {
      document.querySelectorAll("[data-phone-count]").forEach(b => b.textContent = H.cams.size || "");
      renderPhone();
      if (H.phase === "scan") scanSource();
    }
    function camNames() {
      if (H.qcard) { const a = []; for (const p of H.players.values()) a[Number(p.cid.slice(1))] = p.name; return a; }
      return rosterNames();
    }
    function camState() {
      const b = nextButton(true);
      return {
        t: "state", phase: H.phase, q: H.qIdx + 1, total: H.questions.length, students: H.players.size,
        scanned: H.phase === "scan" ? [...H.answers.keys()].map(c => Number(c.slice(1))) : [],
        action: b ? (b.innerText || b.textContent).replace(/\s+/g, " ").trim() : "", key: H.qIdx + ":" + H.phase
      };
    }
    function onCamData(conn, m) {
      if (!m || typeof m !== "object") return;
      conn.seen = Date.now();
      if (m.t === "hello") {
        const isNew = !H.cams.has(conn);
        H.cams.add(conn);
        try { conn.send({ t: "roster", names: camNames() }); conn.send(camState()); } catch {}
        camUI();
        if (isNew) { SFX.correct(); toast("📱 Telefon kamera disambung"); }
      } else if (!H.cams.has(conn)) {
        return;
      } else if (m.t === "scan") {
        const idx = Number(m.idx), ans = Number(m.ans);
        if (Number.isInteger(idx) && (ans === 0 || ans === 1)) onScanRead(idx, ans);
      } else if (m.t === "action") {
        const b = nextButton(true);
        if (b) b.click();
      }
    }
    setInterval(() => {
      if (!H.cams.size) return;
      const st = camState();
      let names = null;
      for (const c of [...H.cams]) {
        if (Date.now() - (c.seen || 0) > 9000) { H.cams.delete(c); try { c.close(); } catch {} camUI(); continue; }
        try { if (c.open) { c.send(st); if (c.rosterKey !== H.players.size + ":" + H.qcard) { names = names || camNames(); c.send({ t: "roster", names }); c.rosterKey = H.players.size + ":" + H.qcard; } } } catch {}
      }
    }, 700);
    // semasa imbasan: guna telefon jika ada, jika tidak guna kamera komputer
    let forceLocal = false;
    function scanSource() {
      const phone = H.cams.size > 0 && !forceLocal;
      $("#btn-cam-local").style.display = phone ? "" : "none";
      if (phone) {
        H.scanner?.stop();
        $("#hs-msg").textContent = "📱 Telefon sedang mengimbas… Halakan kamera telefon ke arah kad murid.";
        $("#btn-cam-switch").style.display = "none";
        return;
      }
      if (!H.scanner) {
        H.scanner = QCARD.createScanner({
          video: $("#hs-video"), overlay: $("#hs-overlay"), onRead: onScanRead,
          label: idx => { const p = H.players.get("s" + idx); return p ? `${idx + 1}. ${p.name}` : `Kad ${idx + 1} (tiada nama)`; },
          onStatus: m => { $("#hs-msg").textContent = m; }
        });
      }
      if (H.scanner.isOn()) { H.scanner.start(); return; }
      $("#btn-cam-switch").style.display = "none";
      H.scanner.start().then(() => { $("#btn-cam-switch").style.display = H.scanner.canSwitch() ? "" : "none"; });
    }
    $("#btn-cam-local").onclick = () => { SFX.click(); forceLocal = true; scanSource(); };

    // pintasan papan kekunci untuk guru
    document.addEventListener("keydown", e => {
      if (!document.body.classList.contains("is-host")) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        const btn = nextButton();
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
      setMode(H.mode);
      refreshSetup();
      show("h-setup");
    }
    function exit() {
      SFX.stopMusic();
      try { H.peer?.destroy(); } catch {}
      H.peer = null; H.players.clear(); H.ready = false; H.paper = false; H.qcard = false;
      H.scanner?.stop();
      try { H.camPeer?.destroy(); } catch {}
      H.camPeer = null; H.camPin = null; H.cams.clear();
      document.body.classList.remove("is-host", "paper", "qcard");
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
      const set = H.set;
      if (!H.order.length || H.order.some(i => !set.questions[i])) H.order = [...set.questions.keys()];
      H.questions = H.order.map(i => flipQ(set.questions[i], H.flip[i]));
      H.ready = true;
      applyModeUI(H.paper, H.qcard);
      $("#hl-count-lbl").textContent = H.qcard ? "murid" : H.paper ? "kumpulan" : "pemain";
      $("#hl-empty").textContent = H.paper ? "Tiada kumpulan: permainan tanpa markah." : "Menunggu pemain masuk…";
      $("#hl-set").textContent = `${set.emoji} ${set.title} • ${H.questions.length} soalan • ${H.time}s`;
      $("#btn-start").textContent = H.startIdx > 0 ? `Mula dari soalan ${H.startIdx + 1} ▶` : "Mula ▶";
      if (H.paper) {
        if (!H.resumed) for (const p of H.players.values()) { p.score = 0; p.streak = 0; p.correct = 0; p.last = 0; }
        renderPlayers();
        show("h-lobby");
        SFX.music("lobby");
        return;
      }
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
      if (H.paper) { c.classList.add("static"); c.tabIndex = -1; return c; }
      c.title = "Klik untuk keluarkan " + p.name;
      c.onclick = () => { if (confirm(`Keluarkan ${p.name} daripada permainan?`)) kick(p.cid); };
      return c;
    }
    function updateCount() {
      const n = [...H.players.values()].filter(p => p.connected).length;
      $("#hl-count").textContent = n;
      $("#hl-empty").style.display = H.players.size ? "none" : "";
      $("#btn-start").disabled = !H.paper && n === 0;
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
      if (!H.paper && !connected().length) return;
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
      return { t: "question", idx: H.qIdx, total: H.questions.length, q: q.q, pic: q.pic || "", o: q.o, time: H.time * 1000, remaining };
    }
    function beginQuestion() {
      H.phase = "question";
      H.answers.clear();
      const q = H.questions[H.qIdx];
      const scr = $("#h-question"); scr.classList.remove("revealed", "raising");
      $("#hq-num").textContent = `${H.qIdx + 1} / ${H.questions.length}`;
      $("#hq-tag").textContent = q.tag;
      const qb = $("#hq-q"); qb.innerHTML = ""; qb.classList.toggle("has-pic", !!q.pic);
      if (q.pic) qb.append(el("div", "hq-pic", q.pic));
      qb.append(el("div", "hq-text", q.q));
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
        if (left <= 0) H.paper ? paperRaise() : endQuestion();
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
    // mod kertas: masa tamat -> murid angkat kad -> guru dedahkan jawapan
    function paperRaise() {
      if (H.phase !== "question") return;
      H.phase = "raise";
      clearInterval(H.timer);
      SFX.stopMusic();
      SFX.timeUp();
      setTimeout(() => SFX.countdown(true), 250);
      $("#btn-skip").style.display = "none";
      $("#h-question").classList.add("raising");
    }
    // mod Q-Card: imbas kad murid dengan kamera
    function openScan() {
      if (H.phase !== "raise") return;
      H.phase = "scan";
      H.answers.clear();
      const q = H.questions[H.qIdx];
      $("#hs-num").textContent = `${H.qIdx + 1} / ${H.questions.length}`;
      $("#hs-q").textContent = (q.pic ? q.pic + "  " : "") + q.q;
      const grid = $("#hs-grid"); grid.innerHTML = "";
      for (const p of H.players.values()) {
        const c = el("div", "sc-chip"); c.dataset.cid = p.cid;
        c.append(el("b", null, Number(p.cid.slice(1)) + 1), el("span", null, p.name));
        grid.append(c);
      }
      $("#hs-count").textContent = "0";
      $("#hs-total").textContent = H.players.size;
      show("h-scan");
      forceLocal = false;
      scanSource();
    }
    function onScanRead(idx, ans) {
      if (H.phase !== "scan") return;
      const cid = "s" + idx;
      if (!H.players.has(cid)) return;
      const prev = H.answers.get(cid);
      if (!prev) {
        SFX.pop();
        const c = document.querySelector(`.sc-chip[data-cid="${cid}"]`);
        if (c) c.classList.add("done");
        $("#hs-count").textContent = H.answers.size + 1;
      }
      if (!prev || prev.choice !== ans) H.answers.set(cid, { choice: ans, ms: 0 });
    }

    function renderGroupMarks() {
      const box = $("#hq-groups"); box.innerHTML = "";
      H.marks = new Set();
      const list = [...H.players.values()];
      if (!list.length) return;
      const btns = [];
      const sync = () => btns.forEach(([b, p]) => b.classList.toggle("on", H.marks.has(p.cid)));
      list.forEach(p => {
        const b = el("button", "gm-btn"); b.type = "button";
        b.append(el("span", "ck", "✔"), el("span", "avatar", AVATARS[p.avatar]), el("span", null, p.name));
        b.onclick = () => {
          if (H.marks.has(p.cid)) { H.marks.delete(p.cid); SFX.click(); }
          else { H.marks.add(p.cid); SFX.pop(); FX.burstAt(b, 10); }
          sync();
        };
        btns.push([b, p]); box.append(b);
      });
      const all = el("button", "gm-btn all", "✔ Semua betul"); all.type = "button";
      all.onclick = () => {
        const every = list.every(p => H.marks.has(p.cid));
        H.marks = every ? new Set() : new Set(list.map(p => p.cid));
        SFX.pop(); sync();
      };
      box.append(all);
    }

    function endQuestion() {
      if (H.phase !== "question" && H.phase !== "raise" && H.phase !== "scan") return;
      const wasPaper = H.paper && !H.qcard;
      if (H.qcard) { H.scanner?.pause(); show("h-question"); $("#hq-groups").innerHTML = ""; }
      H.phase = "reveal";
      clearInterval(H.timer);
      SFX.stopMusic();
      $("#h-question").classList.remove("raising");
      const q = H.questions[H.qIdx];
      if (wasPaper) {
        renderGroupMarks();
        const last = H.qIdx >= H.questions.length - 1;
        const hasGroups = H.players.size > 0;
        $("#hq-explain").textContent = H.explain && q.why ? q.why : "";
        $("#btn-skip").style.display = "none";
        $("#btn-reveal-next").textContent = hasGroups ? (last ? "Lihat pemenang 🏆" : "Papan markah ➜") : (last ? "Tamat 🎉" : "Soalan seterusnya ➜");
        const opts = [...document.querySelectorAll("#hq-options .opt")];
        opts.forEach((o, i) => o.classList.add(i === q.a ? "right" : "wrong"));
        $("#h-question").classList.add("revealed");
        SFX.reveal();
        setTimeout(() => { SFX.correct(); if (opts[q.a]) FX.burstAt(opts[q.a], 40); }, 250);
        return;
      }
      const limit = H.time * 1000;
      // markah: 500–1000 bergantung pada kelajuan + bonus berturut-turut
      for (const p of H.players.values()) {
        const a = H.answers.get(p.cid);
        p.answered = !!a;
        if (a && a.choice === q.a) {
          p.streak++; p.correct++;
          const speed = Math.min(1, a.ms / limit);
          p.last = H.qcard ? 100 : Math.round(1000 * (1 - speed / 2)) + Math.min((p.streak - 1) * 100, 500);
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
      if (H.phase !== "reveal") return;
      if (H.paper && !H.qcard) {
        // markah kumpulan: 100 mata untuk setiap jawapan betul
        for (const p of H.players.values()) {
          if (H.marks.has(p.cid)) { p.streak++; p.correct++; p.last = 100; p.score += 100; }
          else { p.streak = 0; p.last = 0; }
        }
        H.played++;
        save(H.qIdx + 1);
        if (!H.players.size) {
          if (H.qIdx >= H.questions.length - 1) return podium();
          return nextQuestion();
        }
      }
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
      H.scanner?.stop();
      $("#h-question").classList.remove("raising");
      H.phase = "end";
      clearSaved();
      SFX.stopMusic();
      const list = sorted();
      list.forEach(p => send(p, { t: "end", rank: rankOf(list, p), total: list.length, score: p.score, correct: p.correct, questions: H.played }));
      show("h-podium");
      $("#hp-btns").classList.remove("show");
      const noScore = H.paper && !list.length;
      $("#h-podium").classList.toggle("no-score", noScore);
      if (noScore) {
        [1, 2, 3].forEach(i => $("#pod" + i).classList.remove("show"));
        $("#hp-title").textContent = "🎉 Tamat! Syabas semua! 🎉";
        SFX.fanfare(); FX.confetti(220);
        setTimeout(() => { if (H.phase === "end") { $("#hp-btns").classList.add("show"); FX.rain(100); } }, 1800);
        return;
      }
      $("#hp-title").textContent = "Dan pemenangnya ialah…";
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
      a.download = `keputusan-${H.set.id}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(a); a.click(); a.remove();
    }

    return { enter };
  })();

  // ======================================================================
  //                   TELEFON SEBAGAI KAMERA Q-CARD
  // ======================================================================
  const Cam = (() => {
    const C = { peer: null, conn: null, pin: null, state: null, names: [], scanner: null, sent: new Map(), retry: 0, retryT: null, on: false, seen: 0, wake: null, key: "" };
    function setStatus(txt, ok) { $("#cc-status").textContent = txt; $("#cc-dot").classList.toggle("on", !!ok); }
    function start(pin) {
      C.pin = pin; C.on = true; C.retry = 0;
      Player.stop();
      document.body.classList.add("in-game");
      history.replaceState?.(null, "", location.pathname + "?cam=" + pin + (params.get("peer") ? "&peer=" + params.get("peer") : ""));
      show("c-cam");
      renderState();
      connect();
      if (!C.scanner) {
        C.scanner = QCARD.createScanner({
          video: $("#cc-video"), overlay: $("#cc-overlay"), onRead,
          label: idx => C.names[idx] ? `${idx + 1}. ${C.names[idx]}` : `Kad ${idx + 1}`,
          onStatus: m => { $("#cc-msg").textContent = m; }
        });
      }
      $("#cc-switch").style.display = "none";
      C.scanner.start().then(() => { $("#cc-switch").style.display = C.scanner.canSwitch() ? "" : "none"; });
      keepAwake();
    }
    async function keepAwake() { try { C.wake = await navigator.wakeLock?.request("screen"); } catch {} }
    document.addEventListener("visibilitychange", () => { if (C.on && document.visibilityState === "visible") keepAwake(); });
    function connect() {
      clearTimeout(C.retryT);
      try { C.conn?.close(); } catch {}
      try { C.peer?.destroy(); } catch {}
      setStatus(C.retry ? `Menyambung semula… (${C.retry})` : "Menyambung ke skrin guru…", false);
      const peer = new Peer(peerOptions());
      C.peer = peer;
      peer.on("open", () => {
        const conn = peer.connect(PREFIX + "cam-" + C.pin, { reliable: true });
        C.conn = conn;
        conn.on("open", () => { C.retry = 0; C.seen = Date.now(); setStatus("Disambung ke skrin guru", true); conn.send({ t: "hello" }); });
        conn.on("data", onData);
        conn.on("close", () => { if (conn === C.conn) retry(); });
        conn.on("error", () => { if (conn === C.conn) retry(); });
      });
      peer.on("error", err => {
        if (peer !== C.peer) return;
        if (err.type === "peer-unavailable") setStatus("Kod tidak dijumpai. Pastikan skrin guru membuka “📱 Guna kamera telefon”.", false);
        retry();
      });
    }
    function retry() {
      if (!C.on) return;
      C.conn = null; C.retry++;
      clearTimeout(C.retryT);
      C.retryT = setTimeout(connect, Math.min(1500 + C.retry * 700, 5000));
    }
    function send(m) { try { if (C.conn && C.conn.open) C.conn.send(m); } catch {} }
    function onData(m) {
      C.seen = Date.now();
      if (m.t === "roster") C.names = Array.isArray(m.names) ? m.names : [];
      else if (m.t === "state") {
        if (m.key !== C.key) { C.key = m.key; C.sent.clear(); }
        C.state = m;
        renderState();
      }
    }
    function renderState() {
      const st = C.state;
      const info = $("#cc-info"), ban = $("#cc-banner"), act = $("#cc-action");
      if (!st) { info.textContent = "📷 Kamera Q-Card"; ban.textContent = "⏳ Menunggu skrin guru…"; ban.classList.remove("scan"); act.hidden = true; return; }
      const scanning = st.phase === "scan";
      info.textContent = st.total && st.q > 0 && st.phase !== "lobby" && st.phase !== "setup"
        ? `Soalan ${st.q} / ${st.total}` + (scanning ? ` • ${st.scanned.length} / ${st.students} diimbas` : "")
        : `📷 Kamera Q-Card • ${st.students || 0} murid`;
      ban.classList.toggle("scan", scanning);
      ban.textContent = scanning ? "✅ Sedang mengimbas: halakan kamera ke kad murid" : st.phase === "end" ? "🏁 Permainan tamat" : "⏳ Tunggu guru buka imbasan";
      act.hidden = !st.action;
      act.textContent = st.action || "";
    }
    function onRead(idx, ans) {
      if (!C.state || C.state.phase !== "scan") return;
      const now = Date.now(), k = C.sent.get(idx);
      if (k && k.ans === ans && now - k.t < 1500) return;
      C.sent.set(idx, { ans, t: now });
      if (!k) { try { navigator.vibrate?.(30); } catch {} }
      send({ t: "scan", idx, ans });
    }
    $("#cc-action").onclick = () => { SFX.click(); send({ t: "action" }); };
    $("#cc-switch").onclick = () => { SFX.click(); C.scanner?.switchCamera(); };
    $("#cc-exit").onclick = () => {
      SFX.click();
      C.on = false; clearTimeout(C.retryT);
      try { C.conn?.close(); } catch {}
      try { C.peer?.destroy(); } catch {}
      C.scanner?.stop();
      try { C.wake?.release(); } catch {}
      document.body.classList.remove("in-game");
      history.replaceState?.(null, "", location.pathname);
      show("p-join");
    };
    // degupan: jika skrin guru senyap terlalu lama, sambung semula
    setInterval(() => {
      if (!C.on || !C.conn) return;
      send({ t: "ping" });
      if (C.conn.open && Date.now() - C.seen > 7000) retry();
    }, 2000);
    return { start };
  })();

  // ---------------------------------------------------------------- mula
  if (typeof Peer === "undefined") {
    $("#pin-err").textContent = "Gagal memuatkan modul sambungan. Muat semula halaman.";
  }
  const camPin = (params.get("cam") || "").replace(/\D/g, "");
  if (camPin.length === 6) requireAdmin(() => Cam.start(camPin));
  else Player.boot();
})();
