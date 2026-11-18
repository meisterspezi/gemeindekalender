// Öffentliche Kalenderseite
(function () {
  const C = window.KAL_CONFIG, K = window.KAL;
  const $ = s => document.querySelector(s);
  const STORE = 'fbgKalender';
  const YEAR = C.YEAR;

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { saved = {}; }
  const params = new URLSearchParams(location.search);

  const state = {
    key: params.get('k') || saved.k || '',
    sel: params.has('g') ? parseSel(params.get('g')) : (saved.g ? parseSel(saved.g) : K.PRESETS.alles.groups.slice()),
    view: ['liste', 'monat', 'jahr'].includes(params.get('v')) ? params.get('v') : 'jahr', // Startwert Jahresansicht
    ferien: params.has('f') ? params.get('f') === '1' : (saved.f === undefined ? true : !!saved.f), // Ferien standardmäßig an
    past: false,
    month: null,
    panel: 'ansicht',
    events: [],
  };
  function parseSel(s) {
    if (s === 'alle') return K.PRESETS.alles.groups.slice();
    return String(s || '').split(',').filter(x => K.SELECTABLE.includes(x));
  }
  const selParam = () => (state.sel.length === K.SELECTABLE.length ? 'alle' : state.sel.join(',') || 'keine');

  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify({ k: state.key, g: selParam(), v: state.view, f: state.ferien ? 1 : 0 })); } catch { /* privat */ }
    const p = new URLSearchParams();
    p.set('k', state.key); p.set('g', selParam()); p.set('v', state.view);
    p.set('f', state.ferien ? '1' : '0');
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }

  let toastTimer;
  function toast(msg, ms = 3500) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------------- Start ----------------
  $('#title').textContent = C.TITLE;
  $('#subtitle').textContent = C.SUBTITLE;
  if (!state.key) { $('#nokey').hidden = false; return; }
  $('#app').hidden = false;
  const now = K.today();
  state.month = now.slice(0, 4) === String(YEAR) ? Number(now.slice(5, 7)) - 1 : 0;

  buildFilter();
  bindUi();
  persist();
  load();

  async function load() {
    $('#view').innerHTML = '<p class="empty">Termine werden geladen …</p>';
    try {
      const r = await fetch(`${C.API}/api/public/events?k=${encodeURIComponent(state.key)}`, { cache: 'no-store' });
      if (r.status === 403) { $('#app').hidden = true; $('#nokey').hidden = false; return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      state.events = d.events;
      try { localStorage.setItem(STORE + ':cache', JSON.stringify({ t: Date.now(), events: d.events })); } catch { }
      $('#stand').textContent = 'Stand: ' + new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr';
    } catch (err) {
      const c = JSON.parse(localStorage.getItem(STORE + ':cache') || 'null');
      if (c) {
        state.events = c.events;
        $('#stand').textContent = 'Keine Verbindung – gespeicherter Stand vom ' + new Date(c.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
      } else {
        $('#view').innerHTML = '<p class="empty">Die Termine konnten nicht geladen werden. Bitte später erneut versuchen.</p>';
        return;
      }
    }
    render();
  }

  // ---------------- Filter ----------------
  function buildFilter() {
    const chips = document.querySelector('.chips');
    chips.innerHTML = K.GROUPS.filter(g => !g.derived).map(g => g.always
      ? `<span class="chip locked" aria-pressed="true"><span class="dot" style="background:${g.color}">✓</span>${g.label} <span class="lock">(immer)</span></span>`
      : `<button class="chip" data-g="${g.slug}" aria-pressed="false"><span class="dot" style="background:${g.color}">✓</span>${g.label}</button>`).join('');
    syncFilter();
  }
  function syncFilter() {
    document.querySelectorAll('.chip[data-g]').forEach(b => {
      const on = state.sel.includes(b.dataset.g);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.dot').textContent = on ? '✓' : '';
    });
    const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    $('#ferien').checked = state.ferien;
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
    updateAbo();
  }

  function bindUi() {
    document.addEventListener('click', e => {
      const chip = e.target.closest('.chip[data-g]');
      if (chip) {
        const g = chip.dataset.g;
        state.sel = state.sel.includes(g) ? state.sel.filter(x => x !== g) : [...state.sel, g];
        changed();
      }
      const v = e.target.closest('[data-view]');
      if (v) { state.view = v.dataset.view; changed(); }
      const go = e.target.closest('[data-go]');
      if (go) showPanel(go.dataset.go);
      const mv = e.target.closest('[data-month]');
      if (mv) { state.month = Math.min(11, Math.max(0, state.month + Number(mv.dataset.month))); render(); }
    });
    $('#ferien').addEventListener('change', e => { state.ferien = e.target.checked; changed(); });
    $('#past').addEventListener('change', e => { state.past = e.target.checked; render(); });
    $('#btn-pdf').addEventListener('click', makePdf);
    $('#abo-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(feedUrl()); toast('Abo-Link kopiert ✓'); }
      catch { prompt('Abo-Link zum Kopieren:', feedUrl()); }
    });
  }
  function changed() { syncFilter(); persist(); render(); }

  function showPanel(id) {
    state.panel = id;
    $('#ansicht').hidden = id !== 'ansicht';
    $('#abo').hidden = id !== 'abo';
    document.querySelectorAll('[data-go]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.go === id)));
    if (id === 'abo') $('#abo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------- Abo ----------------
  function feedUrl() {
    return `${C.API}/kal/${encodeURIComponent(state.key)}.ics?g=${encodeURIComponent(selParam())}`;
  }
  function updateAbo() {
    const vis = K.visible(state.sel);
    $('#abo-groups').textContent = K.GROUPS.filter(g => vis.has(g.slug)).map(g => g.label).join(', ');
    const https = feedUrl();
    const webcal = https.replace(/^https?:/, 'webcal:');
    $('#abo-webcal').href = webcal;
    $('#abo-google').href = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal);
    $('#abo-ics').href = https + '&download=1';
  }

  // ---------------- Daten ----------------
  function filtered() {
    const vis = K.visible(state.sel);
    return state.events.filter(e => vis.has(e.grp)).sort(K.sortEvents);
  }
  const color = g => (K.byslug[g] || {}).color || '#888';
  const label = g => (K.byslug[g] || {}).label || g;

  function render() {
    const showPast = state.view === 'liste';
    $('#past-wrap').hidden = !showPast || now.slice(0, 4) !== String(YEAR);
    if (state.view === 'monat') renderMonth(); else if (state.view === 'jahr') renderYear(); else renderList();
  }

  let holMap = K.holidayInfo(YEAR);
  function evCard(e) {
    const fer = state.ferien && (holMap[e.start_date] || {}).ferien;
    const meta = [K.timeText(e)];
    if (e.end_date) meta[0] = (e.start_time ? e.start_time + ' Uhr · ' : '') + 'bis ' + K.WDL[K.wd(e.end_date)] + ', ' + K.fmtShort(e.end_date);
    if (e.location) meta.push('📍 ' + K.esc(e.location));
    return `<article class="ev${fer ? ' inferien' : ''}" style="--c:${color(e.grp)}">
      <div class="d"><span class="wd">${K.WD[K.wd(e.start_date)]}</span><span class="n">${Number(e.start_date.slice(8, 10))}.</span></div>
      <div><div class="t">${K.esc(e.title)}</div>
        <div class="m">${meta.map(m => `<span>${m}</span>`).join('')}</div>
        ${e.description ? `<div class="m">${K.esc(e.description)}</div>` : ''}
        <span class="pill" style="background:${color(e.grp)}">${label(e.grp)}</span>${fer ? `<span class="fertag">${fer}</span>` : ''}</div>
    </article>`;
  }

  function holidayRows(month) {
    if (!state.ferien) return [];
    const rows = [];
    const mm = `${YEAR}-${K.pad(month + 1)}`;
    (K.FERIEN[YEAR] || []).forEach(([a, b, n]) => {
      const first = a < mm + '-01' ? mm + '-01' : a;
      if (first.slice(0, 7) === mm && first <= b) rows.push({ d: first, html: `<div class="hol ferien">🏖️ <strong>${n}</strong> ${K.fmtShort(a)} – ${K.fmtShort(b)}</div>` });
    });
    (K.FEIERTAGE[YEAR] || []).forEach(([d, n]) => {
      if (d.slice(0, 7) === mm) rows.push({ d, html: `<div class="hol feiertag">🎉 ${K.WD[K.wd(d)]} ${K.fmtShort(d)} <strong>${n}</strong></div>` });
    });
    return rows;
  }

  function renderList() {
    const list = filtered().filter(e => state.past || now.slice(0, 4) !== String(YEAR) || (e.end_date || e.start_date) >= now);
    let html = '';
    for (let m = 0; m < 12; m++) {
      const mm = `${YEAR}-${K.pad(m + 1)}`;
      if (!state.past && now.slice(0, 4) === String(YEAR) && mm < now.slice(0, 7)) continue;
      const evs = list.filter(e => e.start_date.slice(0, 7) === mm).map(e => ({ d: e.start_date, html: evCard(e) }));
      const rows = [...holidayRows(m), ...evs].sort((a, b) => a.d.localeCompare(b.d));
      if (!rows.length) continue;
      html += `<h3 class="month-h">${K.MONTHS[m]} ${YEAR}</h3>` + rows.map(r => r.html).join('');
    }
    $('#view').innerHTML = html || '<p class="empty">Für diese Auswahl gibt es keine Termine.</p>';
  }

  function renderMonth() {
    const m = state.month;
    const first = `${YEAR}-${K.pad(m + 1)}-01`;
    const days = new Date(YEAR, m + 1, 0).getDate();
    const offset = (K.wd(first) + 6) % 7;
    const hol = state.ferien ? K.holidayInfo(YEAR) : {};
    const byDay = {};
    filtered().forEach(e => K.eventDays(e).forEach(d => (byDay[d] = byDay[d] || []).push(e)));
    let cells = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<div class="wh">${w}</div>`).join('');
    for (let i = 0; i < offset; i++) cells += '<div class="cell out"></div>';
    for (let d = 1; d <= days; d++) {
      const ds = `${YEAR}-${K.pad(m + 1)}-${K.pad(d)}`;
      const h = hol[ds] || {};
      const cls = ['cell', K.wd(ds) % 6 === 0 ? 'we' : '', h.ferien ? 'ferien' : '', h.feiertag ? 'feiertag' : '', ds === now ? 'today' : ''].join(' ');
      const evs = byDay[ds] || [];
      const ferStart = h.ferien && (d === 1 || !(hol[K.addDays(ds, -1)] || {}).ferien);
      cells += `<div class="${cls}"><span class="num">${d}</span>` +
        (h.feiertag ? `<span class="hn">${K.esc(h.feiertag)}</span>` : '') +
        (ferStart ? `<span class="fn">${K.esc(h.ferien)}</span>` : '') +
        evs.map(e => `<span class="e" style="--c:${color(e.grp)}" title="${K.esc(e.title)}">${e.start_time && e.start_date === ds ? e.start_time + ' ' : ''}${K.esc(e.title)}</span>`).join('') +
        `<span class="dots">${evs.map(e => `<i style="--c:${color(e.grp)}"></i>`).join('')}</span></div>`;
    }
    const mm = `${YEAR}-${K.pad(m + 1)}`;
    const monthEvents = filtered().filter(e => e.start_date.slice(0, 7) === mm || (e.end_date && e.start_date < mm && e.end_date >= mm + '-01'));
    const rows = [...holidayRows(m), ...monthEvents.map(e => ({ d: e.start_date, html: evCard(e) }))].sort((a, b) => a.d.localeCompare(b.d));
    $('#view').innerHTML = `
      <div class="mnav">
        <button data-month="-1" aria-label="Vorheriger Monat" ${m === 0 ? 'disabled' : ''}>‹</button>
        <h3>${K.MONTHS[m]} ${YEAR}</h3>
        <button data-month="1" aria-label="Nächster Monat" ${m === 11 ? 'disabled' : ''}>›</button>
      </div>
      <div class="grid">${cells}</div>
      ${state.ferien ? '<p class="legend"><i class="sw fer"></i> Schulferien Bayern <i class="sw fei"></i> Feiertag</p>' : ''}
      <div class="mlist">${rows.map(r => r.html).join('') || '<p class="empty">Keine Termine in diesem Monat.</p>'}</div>`;
  }

  function renderYear() {
    const hol = state.ferien ? K.holidayInfo(YEAR) : {};
    const byDay = {};
    filtered().forEach(e => K.eventDays(e).forEach(d => (byDay[d] = byDay[d] || []).push(e)));
    let html = '';
    for (let half = 0; half < 2; half++) {
      let cols = '';
      for (let c = 0; c < 6; c++) {
        const m = half * 6 + c;
        const days = new Date(YEAR, m + 1, 0).getDate();
        let rows = '';
        const labeled = new Set();
        for (let d = 1; d <= 31; d++) {
          if (d > days) { rows += '<div class="yd none"></div>'; continue; }
          const ds = `${YEAR}-${K.pad(m + 1)}-${K.pad(d)}`;
          const w = K.wd(ds);
          const h = hol[ds] || {};
          const evs = byDay[ds] || [];
          const cls = ['yd', w === 0 ? 'so' : w === 6 ? 'sa' : '', h.ferien ? 'ferien' : '', h.feiertag ? 'feiertag' : '', ds === now ? 'today' : ''].join(' ');
          let inner = evs.slice(0, 2).map(e => `<span class="ye" style="--c:${color(e.grp)}" title="${K.esc(e.title)}">${e.start_time && e.start_date === ds ? e.start_time + ' ' : ''}${K.esc(e.title)}</span>`).join('');
          if (evs.length > 2) inner += `<span class="ymore">+${evs.length - 2}</span>`;
          if (!evs.length && h.feiertag) inner = `<span class="yh">${K.esc(h.feiertag)}</span>`;
          else if (!evs.length && h.ferien && !labeled.has(h.ferien)) { labeled.add(h.ferien); inner = `<span class="yh">${K.esc(h.ferien)}</span>`; }
          const tip = evs.map(e => `${e.start_time && e.start_date === ds ? e.start_time + ' ' : ''}${e.title}`).concat(h.feiertag || [], h.ferien || []).join(' · ');
          rows += `<div class="${cls}" title="${K.esc(tip)}"><b>${d}</b><i>${K.WD[w]}</i><span class="yev">${inner}</span></div>`;
        }
        cols += `<div class="ycol"><div class="ym">${K.MONTHS[m]}</div>${rows}</div>`;
      }
      html += `<h3 class="month-h ystatic">${half + 1}. Halbjahr ${YEAR}</h3><p class="yhint">↔ Zum Blättern seitlich wischen</p><div class="yscroll"><div class="year">${cols}</div></div>`;
    }
    if (state.ferien) html += '<p class="legend"><i class="sw fer"></i> Schulferien Bayern <i class="sw fei"></i> Feiertag</p>';
    $('#view').innerHTML = `<div class="ywide">${html}</div>`;
  }

  // Logo für das PDF (einmal laden)
  let logoData = null;
  async function loadLogo() {
    if (logoData) return logoData;
    try {
      const blob = await (await fetch('logo.png')).blob();
      logoData = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    } catch { logoData = null; }
    return logoData;
  }

  // ---------------- PDF ----------------
  async function makePdf() {
    const btn = $('#btn-pdf');
    btn.disabled = true;
    toast('PDF wird erstellt …', 8000);
    try {
      await K.loadScript('vendor/jspdf.umd.min.js');
      const logo = await loadLogo();
      const vis = K.visible(state.sel);
      window.KAL_PDF.create({
        year: YEAR, title: C.TITLE, subtitle: C.SUBTITLE, events: filtered(),
        holidays: state.ferien ? K.holidayInfo(YEAR) : null, logo,
        groups: K.GROUPS.filter(g => vis.has(g.slug)), allGroups: state.sel.length === K.SELECTABLE.length,
      });
      toast('PDF ist fertig ✓');
    } catch (err) {
      console.error(err);
      toast('Das PDF konnte nicht erstellt werden. Bitte erneut versuchen.');
    } finally { btn.disabled = false; }
  }
})();
