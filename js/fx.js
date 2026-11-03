// Kesan visual: konfeti & letupan bintang pada kanvas penuh skrin.
window.FX = (() => {
  const cv = document.createElement("canvas");
  cv.id = "fx-canvas";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(cv));
  const c = cv.getContext("2d");
  let parts = [], running = false, W = 0, H = 0, dpr = 1;
  const COLORS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#51cf66", "#cc5de8", "#ff922b"];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize); resize();

  function loop() {
    c.clearRect(0, 0, W, H);
    parts = parts.filter(p => p.life > 0 && p.y < H + 40);
    for (const p of parts) {
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      const a = Math.min(1, p.life / 30);
      c.save(); c.globalAlpha = a; c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color;
      if (p.shape === "rect") { c.scale(1, Math.cos(p.rot * 2)); c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
      else if (p.shape === "circle") { c.beginPath(); c.arc(0, 0, p.s / 2, 0, 7); c.fill(); }
      else { star(p.s / 2); }
      c.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; c.clearRect(0, 0, W, H); }
  }
  function star(r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }
  function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
  const rnd = (a, b) => a + Math.random() * (b - a);

  function confetti(n = 160) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) n = Math.round(n / 4);
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * rnd(0.5, 0.9),
        vx: (fromLeft ? 1 : -1) * rnd(6, 16), vy: -rnd(10, 22),
        g: 0.35, drag: 0.985, rot: rnd(0, 6), vr: rnd(-0.3, 0.3),
        s: rnd(8, 14), color: COLORS[i % COLORS.length],
        shape: ["rect", "rect", "circle", "star"][i % 4], life: rnd(160, 260)
      });
    }
    start();
  }
  function rain(n = 120) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x: rnd(0, W), y: rnd(-H * 0.6, -10), vx: rnd(-1, 1), vy: rnd(2, 5),
        g: 0.06, drag: 0.995, rot: rnd(0, 6), vr: rnd(-0.2, 0.2),
        s: rnd(8, 13), color: COLORS[i % COLORS.length],
        shape: ["rect", "circle", "star"][i % 3], life: 400
      });
    }
    start();
  }
  function burst(x, y, n = 30, colors = COLORS) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, sp = rnd(3, 9);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.15, drag: 0.94,
        rot: rnd(0, 6), vr: rnd(-0.3, 0.3), s: rnd(8, 14),
        color: colors[i % colors.length], shape: "star", life: rnd(40, 70)
      });
    }
    start();
  }
  function burstAt(el, n, colors) {
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, n, colors);
  }
  return { confetti, rain, burst, burstAt };
})();
