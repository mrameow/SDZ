// Kesan bunyi disintesis terus dengan Web Audio (tiada fail audio diperlukan).
window.SFX = (() => {
  let ctx = null, master = null, musicGain = null, muted = false;
  let musicTimer = null, musicStep = 0, musicMode = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.22;
      musicGain.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // Buka kunci audio pada sentuhan pertama (keperluan pelayar)
  ["pointerdown", "keydown", "touchstart"].forEach(ev =>
    window.addEventListener(ev, ensure, { passive: true }));

  function tone(freq, start, dur, { type = "sine", vol = 0.3, slide = 0, out = null, attack = 0.01 } = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(start, dur, { vol = 0.2, freq = 1200, q = 1, type = "bandpass" } = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime + start;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }

  const N = n => 440 * Math.pow(2, (n - 69) / 12); // nombor MIDI -> Hz

  const fx = {
    click() { tone(880, 0, 0.08, { type: "triangle", vol: 0.25, slide: 300 }); },
    pop() {
      tone(500 + Math.random() * 300, 0, 0.12, { type: "sine", vol: 0.35, slide: 600 });
      tone(1400, 0.03, 0.06, { type: "triangle", vol: 0.1 });
    },
    tick() { tone(1200, 0, 0.05, { type: "square", vol: 0.06 }); },
    tickUrgent() { tone(1600, 0, 0.07, { type: "square", vol: 0.1 }); },
    countdown(final) {
      if (final) { tone(N(84), 0, 0.5, { type: "triangle", vol: 0.35 }); tone(N(72), 0, 0.5, { type: "sine", vol: 0.25 }); }
      else tone(N(72), 0, 0.18, { type: "triangle", vol: 0.3 });
    },
    whoosh() { noise(0, 0.35, { vol: 0.25, freq: 900, q: 0.6 }); tone(300, 0, 0.3, { vol: 0.08, slide: 600 }); },
    lock() {
      tone(N(76), 0, 0.08, { type: "triangle", vol: 0.25 });
      tone(N(83), 0.06, 0.12, { type: "triangle", vol: 0.25 });
    },
    correct() {
      [72, 76, 79, 84].forEach((n, i) => tone(N(n), i * 0.08, 0.25, { type: "triangle", vol: 0.28 }));
      tone(N(96), 0.32, 0.4, { type: "sine", vol: 0.12 });
    },
    wrong() {
      tone(N(55), 0, 0.22, { type: "sawtooth", vol: 0.12, slide: -40 });
      tone(N(50), 0.18, 0.35, { type: "sawtooth", vol: 0.12, slide: -60 });
    },
    timeUp() { tone(N(67), 0, 0.15, { type: "square", vol: 0.12 }); tone(N(60), 0.15, 0.35, { type: "square", vol: 0.12 }); },
    reveal() {
      noise(0, 0.15, { vol: 0.2, freq: 3000, q: 2 });
      tone(N(79), 0.02, 0.3, { type: "triangle", vol: 0.25 });
      tone(N(84), 0.1, 0.4, { type: "triangle", vol: 0.25 });
    },
    drumroll(dur = 2.4) {
      if (!ensure()) return;
      for (let t = 0; t < dur; t += 0.05) noise(t, 0.05, { vol: 0.05 + (t / dur) * 0.15, freq: 220, q: 0.8, type: "lowpass" });
    },
    cymbal() { noise(0, 1.2, { vol: 0.3, freq: 6000, q: 0.5, type: "highpass" }); },
    fanfare() {
      const seq = [[67, 0], [72, 0.15], [76, 0.3], [79, 0.45], [76, 0.65], [79, 0.8]];
      seq.forEach(([n, t]) => { tone(N(n), t, 0.3, { type: "sawtooth", vol: 0.1 }); tone(N(n + 12), t, 0.3, { type: "triangle", vol: 0.12 }); });
      [72, 76, 79, 84].forEach(n => tone(N(n), 1.0, 1.2, { type: "triangle", vol: 0.12 }));
    },
    streak() { [79, 83, 86, 91].forEach((n, i) => tone(N(n), i * 0.05, 0.12, { type: "square", vol: 0.08 })); }
  };

  // Muzik latar ringkas: "lobby" (ceria) dan "think" (berdetak, semasa soalan)
  const LOBBY_MEL = [72, null, 76, 79, 76, null, 72, 74, 76, null, 79, 81, 79, null, 76, null,
                     74, null, 77, 81, 77, null, 74, 76, 77, null, 81, 79, 76, null, 74, null];
  const LOBBY_BASS = [48, 48, 55, 55, 53, 53, 50, 55];
  const THINK_BASS = [45, 45, 52, 45, 48, 45, 52, 47];
  function musicTickFn() {
    if (!ctx) return;
    const s = musicStep++;
    if (musicMode === "lobby") {
      const m = LOBBY_MEL[s % LOBBY_MEL.length];
      if (m) tone(N(m), 0, 0.22, { type: "triangle", vol: 0.25, out: musicGain });
      if (s % 4 === 0) tone(N(LOBBY_BASS[(s / 4) % LOBBY_BASS.length]), 0, 0.4, { type: "sine", vol: 0.4, out: musicGain });
      if (s % 2 === 1) tone(6000, 0, 0.03, { type: "square", vol: 0.03, out: musicGain });
    } else if (musicMode === "think") {
      if (s % 2 === 0) tone(N(THINK_BASS[(s / 2) % THINK_BASS.length]), 0, 0.18, { type: "triangle", vol: 0.45, out: musicGain });
      if (s % 4 === 2) tone(N(69 + (s % 16 === 2 ? 7 : 0)), 0, 0.1, { type: "sine", vol: 0.15, out: musicGain });
      tone(8000, 0, 0.02, { type: "square", vol: 0.015, out: musicGain });
    }
  }
  function music(mode) {
    if (musicMode === mode) return;
    stopMusic();
    if (!mode) return;
    if (!ensure()) return;
    musicMode = mode; musicStep = 0;
    musicTimer = setInterval(musicTickFn, mode === "think" ? 150 : 180);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; musicMode = null; }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.6;
  }

  return { ...fx, music, stopMusic, setMuted, isMuted: () => muted, unlock: ensure };
})();
