// Set soalan sendiri (A / B sahaja). Disimpan dalam localStorage pelayar guru.
window.CUSTOM = (() => {
  const KEY = "sdz-custom-sets";
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const persist = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };
  const str = v => String(v == null ? "" : v).trim();
  const cleanQ = q => ({ q: str(q && q.q), o: [str(q && q.o && q.o[0]), str(q && q.o && q.o[1])], a: q && Number(q.a) === 1 ? 1 : 0, why: str(q && q.why) });
  const newId = () => "c-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  function toGameSet(s) {
    const questions = (s.questions || []).map((q, i) => ({ ...cleanQ(q), tag: `Soalan ${i + 1}` }));
    return { id: s.id, title: s.title || "Soalan saya", emoji: s.emoji || "📝", subtitle: `${questions.length} soalan • A / B • soalan sendiri`, custom: true, questions };
  }
  const all = () => [...window.QUIZ_SETS, ...load().map(toGameSet)];
  const get = id => all().find(s => s.id === id) || null;

  // pulangkan mesej ralat (atau null jika sah)
  function validate(set) {
    if (!str(set.title)) return { msg: "Masukkan tajuk set soalan." };
    if (!set.questions || !set.questions.length) return { msg: "Tambah sekurang-kurangnya satu soalan." };
    for (let i = 0; i < set.questions.length; i++) {
      const q = cleanQ(set.questions[i]);
      if (!q.q || !q.o[0] || !q.o[1]) return { msg: `Soalan ${i + 1}: lengkapkan soalan dan kedua-dua jawapan A dan B.`, index: i };
    }
    return null;
  }
  function upsert(set) {
    const list = load();
    const rec = { id: set.id || newId(), title: str(set.title).slice(0, 50), emoji: set.emoji || "📝", questions: set.questions.map(cleanQ), updated: Date.now() };
    const i = list.findIndex(s => s.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    if (!persist(list)) throw new Error("Ruang simpanan pelayar penuh.");
    return rec.id;
  }
  function remove(id) { persist(load().filter(s => s.id !== id)); }

  function exportJSON(set) {
    return JSON.stringify({ format: "kuiz-sdz", version: 1, sets: [{ title: str(set.title), emoji: set.emoji || "📝", questions: set.questions.map(cleanQ) }] }, null, 2);
  }
  // terima { sets: [...] }, satu set, atau senarai set
  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("Fail ini bukan fail soalan yang sah."); }
    const sets = Array.isArray(data) ? data : (data && Array.isArray(data.sets) ? data.sets : [data]);
    const out = [];
    for (const s of sets) {
      if (!s || !Array.isArray(s.questions)) continue;
      const qs = s.questions.filter(q => q && Array.isArray(q.o) && q.o.length === 2).map(cleanQ).filter(q => q.q && q.o[0] && q.o[1]);
      if (qs.length) out.push({ title: str(s.title) || "Soalan import", emoji: s.emoji || "📥", questions: qs });
    }
    if (!out.length) throw new Error("Tiada soalan A / B yang sah dalam fail ini.");
    return out;
  }
  return { all, get, validate, upsert, remove, exportJSON, parseImport };
})();
