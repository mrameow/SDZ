// Q-Card: kad bercetak dengan penanda (marker) ArUco. Kamera guru mengimbas kad;
// arah kad (huruf A atau B di atas) menentukan jawapan murid.
window.QCARD = (() => {
  // 60 ID penanda yang dipilih supaya tidak keliru antara satu sama lain walaupun diputar.
  const IDS = [4, 11, 13, 16, 21, 26, 31, 33, 38, 44, 50, 55, 56, 64, 69, 74, 79, 81, 87, 88, 94, 98, 100, 105, 115, 118, 124, 129, 134, 140,
    146, 148, 153, 165, 168, 174, 176, 187, 189, 199, 200, 211, 220, 224, 234, 237, 241, 244, 257, 263, 264, 270, 274, 276, 281, 288, 293, 299, 307, 310];
  const MAX = IDS.length;
  const W = [[1, 0, 0, 0, 0], [1, 0, 1, 1, 1], [0, 1, 0, 0, 1], [0, 1, 1, 1, 0]];
  const indexOfId = new Map(IDS.map((id, i) => [id, i]));

  // grid 5x5 (1 = putih) bagi penanda; sempadan hitam ditambah semasa melukis
  function bits(id) {
    const m = [];
    for (let i = 0; i < 5; i++) {
      const b1 = (id >> (9 - 2 * i)) & 1, b3 = (id >> (8 - 2 * i)) & 1;
      m.push(W[b1 * 2 + b3]);
    }
    return m;
  }
  // SVG untuk cetakan (7x7 sel, sempadan hitam)
  function markerSVG(cardIdx) {
    const m = bits(IDS[cardIdx]);
    let r = "";
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (m[i][j]) r += `<rect x="${j + 1}" y="${i + 1}" width="1.02" height="1.02"/>`;
    return `<svg viewBox="0 0 7 7" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="7" height="7" fill="#000"/><g fill="#fff">${r}</g></svg>`;
  }

  // ---------------------------------------------------------------- pengesanan
  let det = null;
  function detect(img) {
    if (!det) det = new AR.Detector();
    CV.grayscale(img, det.grey);
    CV.adaptiveThreshold(det.grey, det.thres, 2, 7);
    det.contours = CV.findContours(det.thres, det.binary);
    let c = det.findCandidates(det.contours, img.width * 0.05, 0.05, 8);
    c = det.clockwiseCorners(c);
    c = det.notTooNear(c, 10);
    return det.findMarkers(det.grey, c, 49);
  }
  // sudut 0 -> 1 ialah tepi atas penanda. Tegak = A, terbalik = B, mengiring = abaikan.
  function answerOf(corners) {
    const dx = corners[1].x - corners[0].x, dy = corners[1].y - corners[0].y;
    const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    if (ang <= 55) return 0;
    if (ang >= 125) return 1;
    return null;
  }

  // ---------------------------------------------------------------- pengimbas kamera
  function createScanner({ video, overlay, onRead, label, onStatus }) {
    let stream = null, running = false, raf = 0, lastT = 0, devices = [], devIdx = -1;
    const work = document.createElement("canvas");
    const wctx = work.getContext("2d", { willReadFrequently: true });
    const octx = overlay.getContext("2d");

    async function start(deviceId) {
      if (stream && !deviceId) { resume(); return true; }
      stopStream();
      if (!navigator.mediaDevices?.getUserMedia) { onStatus?.("Pelayar ini tidak menyokong kamera. Guna Chrome / Safari terkini melalui https."); return false; }
      onStatus?.("Membuka kamera…");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (e) {
        onStatus?.(e && e.name === "NotAllowedError" ? "Kebenaran kamera ditolak. Benarkan kamera dalam tetapan pelayar, kemudian cuba lagi." : "Kamera tidak dapat dibuka. Pastikan peranti ada kamera dan tidak digunakan aplikasi lain.");
        return false;
      }
      video.srcObject = stream;
      video.muted = true; video.setAttribute("playsinline", "");
      try { await video.play(); } catch {}
      onStatus?.("");
      try {
        devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
        const cur = stream.getVideoTracks()[0]?.getSettings().deviceId;
        devIdx = Math.max(0, devices.findIndex(d => d.deviceId === cur));
      } catch {}
      resume();
      return true;
    }
    function resume() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }
    function pause() { running = false; cancelAnimationFrame(raf); octx.clearRect(0, 0, overlay.width, overlay.height); }
    function stopStream() {
      pause();
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; video.srcObject = null;
    }
    async function switchCamera() {
      if (devices.length < 2) return false;
      devIdx = (devIdx + 1) % devices.length;
      return start(devices[devIdx].deviceId);
    }

    // kawasan sebenar video dalam elemen (object-fit: contain)
    function contentRect() {
      const ew = video.clientWidth, eh = video.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
      const s = Math.min(ew / vw, eh / vh);
      return { x: (ew - vw * s) / 2, y: (eh - vh * s) / 2, s };
    }
    function loop(t) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (t - lastT < 110 || video.readyState < 2 || !video.videoWidth) return;
      lastT = t;
      const scale = Math.min(1, 960 / video.videoWidth);
      const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
      if (work.width !== w) { work.width = w; work.height = h; }
      wctx.drawImage(video, 0, 0, w, h);
      let markers = [];
      try { markers = detect(wctx.getImageData(0, 0, w, h)); } catch {}
      // lapisan visual
      const dpr = window.devicePixelRatio || 1;
      const ow = Math.round(video.clientWidth * dpr), oh = Math.round(video.clientHeight * dpr);
      if (overlay.width !== ow || overlay.height !== oh) { overlay.width = ow; overlay.height = oh; }
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, ow, oh);
      const r = contentRect(), k = r.s / scale;
      for (const m of markers) {
        const idx = indexOfId.get(m.id);
        if (idx == null) continue;
        const ans = answerOf(m.corners);
        const pts = m.corners.map(p => ({ x: r.x + p.x * k, y: r.y + p.y * k }));
        octx.lineWidth = 5; octx.strokeStyle = ans == null ? "#adb5bd" : "#51cf66";
        octx.fillStyle = ans == null ? "rgba(173,181,189,.25)" : "rgba(81,207,102,.3)";
        octx.beginPath(); pts.forEach((p, i) => i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)); octx.closePath(); octx.fill(); octx.stroke();
        const cx = pts.reduce((a, p) => a + p.x, 0) / 4, top = Math.min(...pts.map(p => p.y));
        const txt = label ? label(idx) : String(idx + 1);
        octx.font = "600 16px Fredoka, system-ui, sans-serif";
        const tw = octx.measureText(txt).width + 16;
        octx.fillStyle = "rgba(43,45,66,.85)";
        octx.fillRect(cx - tw / 2, top - 30, tw, 24);
        octx.fillStyle = "#fff"; octx.textAlign = "center"; octx.textBaseline = "middle";
        octx.fillText(txt, cx, top - 18);
        if (ans != null) onRead(idx, ans);
      }
    }
    return { start, pause, stop: stopStream, switchCamera, isOn: () => !!stream, canSwitch: () => devices.length > 1 };
  }

  return { IDS, MAX, bits, markerSVG, detect, answerOf, createScanner, indexOfId };
})();
