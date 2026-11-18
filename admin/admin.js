// Admin-Bereich Gemeindekalender
(function () {
  const C = window.KAL_CONFIG, K = window.KAL;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const SKEY = 'fbgKalenderAdmin';
  const YEAR = C.YEAR;

  const st = {
    token: null, name: '', events: [], series: [], last: null,
    tab: 'liste', month: 0, grp: '', unchecked: false, q: '', editing: null, editingSeries: null,
  };
  try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s && s.expires > new Date().toISOString()) Object.assign(st, { token: s.token, name: s.name }); } catch { }
  const now = K.today();
  st.month = now.slice(0, 4) === String(YEAR) ? Number(now.slice(5, 7)) - 1 : 0;

  // ---------------- Hilfen ----------------
  let toastT;
  function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
  const color = g => (K.byslug[g] || {}).color || '#888';
  const glabel = g => (K.byslug[g] || {}).label || g;

  async function api(method, path, body) {
    const r = await fetch(C.API + '/api/admin/' + path, {
      method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.token },
      body: body ? JSON.stringify(body) : undefined,
    });
    let d = {};
    try { d = await r.json(); } catch { }
    if (r.status === 401) { logoutLocal(); throw new Error(d.error || 'Bitte neu anmelden.'); }
    if (!r.ok) { const e = new Error(d.error || 'Fehler ' + r.status); e.data = d; throw e; }
    return d;
  }

  function confirmDlg(title, text, { yes = 'Ja', date = null } = {}) {
    return new Promise(res => {
      const d = $('#dlg-confirm');
      $('#cf-title').textContent = title; $('#cf-text').textContent = text; $('#cf-yes').textContent = yes;
      $('#cf-date-wrap').hidden = !date; if (date) $('#cf-date').value = date;
      d.returnValue = '';
      d.onclose = () => res(d.returnValue === 'yes' ? (date ? $('#cf-date').value : true) : false);
      d.showModal();
    });
  }

  const privacyCheck = text => /(\+49|\b0\d{2,5})[\s/-]?\d{3,}/.test(text) || /\b[\wäöüß-]+(straße|str\.|weg|gasse|allee|ring)\s*\d+/i.test(text);

  // ---------------- Login ----------------
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    $('#login-err').textContent = '';
    f.querySelector('button').disabled = true;
    try {
      const r = await fetch(C.API + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      st.token = d.token; st.name = d.name;
      localStorage.setItem(SKEY, JSON.stringify({ token: d.token, name: d.name, expires: d.expires }));
      f.password.value = '';
      start();
    } catch (err) { $('#login-err').textContent = err.message || 'Anmeldung fehlgeschlagen.'; }
    finally { f.querySelector('button').disabled = false; }
  });
  function logoutLocal() {
    st.token = null; localStorage.removeItem(SKEY);
    $('#main').hidden = true; $('#who').hidden = true; $('#login').hidden = false;
  }
  $('#btn-logout').addEventListener('click', async () => { try { await api('POST', 'logout'); } catch { } logoutLocal(); });

  // ---------------- Start ----------------
  function start() {
    $('#login').hidden = true; $('#main').hidden = false; $('#who').hidden = false;
    $('#who-name').textContent = st.name;
    reload();
  }
  async function reload() {
    try {
      const d = await api('GET', 'data');
      st.events = d.events; st.series = d.series; st.last = d.lastChange;
      render();
    } catch (err) { toast(err.message); }
  }

  // Gruppen-Auswahlfelder füllen
  const grpOptions = K.GROUPS.map(g => `<option value="${g.slug}">${g.label}</option>`).join('');
  $('#f-grp').insertAdjacentHTML('beforeend', grpOptions);
  $$('select[name=grp]').forEach(s => (s.innerHTML = grpOptions));
  const WDs = [1, 2, 3, 4, 5, 6, 0];
  $('select[name=mweekday]').innerHTML = WDs.map(w => `<option value="${w}">${K.WDL[w]}</option>`).join('');
  $('.wdays').innerHTML = WDs.map(w => `<label class="check"><input type="checkbox" name="wd" value="${w}"> ${K.WD[w]}</label>`).join('');

  // Tabs & Filter
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; render(); }));
  $('#f-grp').addEventListener('change', e => { st.grp = e.target.value; render(); });
  $('#f-unchecked').addEventListener('change', e => { st.unchecked = e.target.checked; render(); });
  $('#f-q').addEventListener('input', e => { st.q = e.target.value.toLowerCase(); render(); });
  $('#btn-new').addEventListener('click', () => openEvent(null));
  $('#btn-new-series').addEventListener('click', () => openSeries(null));
  $('#btn-undo').addEventListener('click', async () => {
    if (!st.last) return;
    if (!await confirmDlg('Rückgängig machen?', st.last.summary, { yes: 'Rückgängig' })) return;
    try { const r = await api('POST', 'undo'); toast('Rückgängig: ' + r.summary); reload(); } catch (err) { toast(err.message); }
  });

  // ---------------- Darstellung ----------------
  const active = () => st.events.filter(e => !e.deleted_at);
  function filtered() {
    return active().filter(e => (!st.grp || e.grp === st.grp) && (!st.unchecked || e.unchecked) &&
      (!st.q || (e.title + ' ' + (e.location || '') + ' ' + (e.note || '') + ' ' + (e.description || '')).toLowerCase().includes(st.q)))
      .sort(K.sortEvents);
  }

  function render() {
    $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
    $$('.tab').forEach(s => (s.hidden = s.id !== 'tab-' + st.tab));
    $('#toolbar').hidden = !['liste', 'monat'].includes(st.tab);
    $('#undo-bar').hidden = !st.last;
    if (st.last) $('#undo-text').textContent = `${st.last.summary} (${st.last.user}, ${new Date(st.last.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })})`;
    const unc = active().filter(e => e.unchecked).length;
    $('#unchecked-count').textContent = unc || '';
    $('#trash-count').textContent = st.events.filter(e => e.deleted_at).length || '';
    $('#orte').innerHTML = [...new Set(active().map(e => e.location).filter(Boolean))].sort().map(o => `<option value="${K.esc(o)}">`).join('');
    ({ liste: renderList, monat: renderMonth, serien: renderSeries, papierkorb: renderTrash, protokoll: renderAudit, daten: () => {}, konto: () => {} })[st.tab]();
  }

  function renderList() {
    const list = filtered();
    let lastM = '';
    const rows = list.map(e => {
      let head = '';
      const m = e.start_date.slice(0, 7);
      if (m !== lastM) { lastM = m; head = `<tr class="month"><td colspan="6">${K.MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</td></tr>`; }
      return head + `<tr class="clickable" data-id="${e.id}">
        <td>${K.dateText(e)}</td>
        <td class="hide-m">${K.timeText(e)}</td>
        <td><strong>${K.esc(e.title)}</strong> ${e.series_id ? '<span class="ser">Serie</span>' : ''}
          ${e.unchecked ? `<br><span class="flag">ungeprüft</span> <span class="note">${K.esc(e.note || '')}</span>` : ''}</td>
        <td><span class="gdot" style="background:${color(e.grp)}"></span>${glabel(e.grp)}</td>
        <td class="hide-m">${K.esc(e.location || '')}</td>
        <td class="acts">
          <button class="btn small" data-act="dup" data-id="${e.id}" title="Duplizieren">⧉</button>
          <button class="btn small danger" data-act="del" data-id="${e.id}" title="Löschen">🗑</button>
        </td></tr>`;
    }).join('');
    $('#tab-liste').innerHTML = list.length
      ? `<table class="t"><thead><tr><th>Datum</th><th class="hide-m">Zeit</th><th>Titel</th><th>Gruppe</th><th class="hide-m">Ort</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">Keine Termine für diesen Filter.</p>';
  }

  function renderMonth() {
    const m = st.month;
    const first = `${YEAR}-${K.pad(m + 1)}-01`;
    const days = new Date(YEAR, m + 1, 0).getDate();
    const offset = (K.wd(first) + 6) % 7;
    const hol = K.holidayInfo(YEAR);
    const byDay = {};
    filtered().forEach(e => K.eventDays(e).forEach(d => (byDay[d] = byDay[d] || []).push(e)));
    let cells = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<div class="wh">${w}</div>`).join('');
    for (let i = 0; i < offset; i++) cells += '<div class="cell out"></div>';
    for (let d = 1; d <= days; d++) {
      const ds = `${YEAR}-${K.pad(m + 1)}-${K.pad(d)}`;
      const h = hol[ds] || {};
      cells += `<div class="cell ${K.wd(ds) % 6 === 0 ? 'we' : ''} ${h.ferien ? 'ferien' : ''} ${h.feiertag ? 'feiertag' : ''}" data-day="${ds}">
        <span class="num">${d}</span>${h.feiertag ? `<span class="hn">${K.esc(h.feiertag)}</span>` : ''}
        ${(byDay[ds] || []).map(e => `<span class="e ${e.unchecked ? 'uc' : ''}" draggable="true" data-id="${e.id}" style="--c:${color(e.grp)}" title="${K.esc(e.title)}${e.unchecked ? ' (ungeprüft)' : ''}">${e.start_time && e.start_date === ds ? e.start_time + ' ' : ''}${K.esc(e.title)}</span>`).join('')}
        <button class="add" data-add="${ds}" title="Neuer Termin an diesem Tag">＋</button></div>`;
    }
    $('#tab-monat').innerHTML = `<div class="mnav">
        <button data-mon="-1" ${m === 0 ? 'disabled' : ''}>‹</button><h3>${K.MONTHS[m]} ${YEAR}</h3>
        <button data-mon="1" ${m === 11 ? 'disabled' : ''}>›</button></div>
      <p class="hint">Termine mit der Maus auf einen anderen Tag ziehen, um sie zu verschieben. Antippen öffnet den Termin.</p>
      <div class="grid amonth">${cells}</div>`;
  }

  function renderSeries() {
    const list = st.series.filter(s => !s.deleted_at);
    $('#tab-serien').innerHTML = `<div class="toolbar"><button class="btn primary" data-act="newseries">＋ Neue Serie</button></div>` + (list.length
      ? `<table class="t"><thead><tr><th>Titel</th><th>Regel</th><th>Zeitraum</th><th>Termine</th><th>Ausnahmen</th></tr></thead><tbody>` +
        list.map(s => {
          const n = active().filter(e => e.series_id === s.id).length;
          const ex = JSON.parse(s.exdates || '[]');
          return `<tr class="clickable" data-series="${s.id}"><td><span class="gdot" style="background:${color(s.grp)}"></span><strong>${K.esc(s.title)}</strong></td>
            <td>${ruleText(JSON.parse(s.rule))}${s.start_time ? ', ' + s.start_time + ' Uhr' : ''}</td>
            <td>${K.fmtShort(s.from_date)} – ${K.fmtLong(s.until_date)}</td><td>${n}</td>
            <td>${ex.map(K.fmtShort).join(', ') || '–'}</td></tr>`;
        }).join('') + '</tbody></table>'
      : '<p class="empty">Noch keine Serien. Beispiel: „Gebetskreis, jeden 1. und 3. Freitag“.</p>');
  }

  function renderTrash() {
    const del = st.events.filter(e => e.deleted_at).sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    const delSeries = st.series.filter(s => s.deleted_at);
    $('#tab-papierkorb').innerHTML = `<p class="hint">Gelöschte Termine bleiben 90 Tage im Papierkorb und können wiederhergestellt werden.</p>` +
      (delSeries.length ? `<h3>Gelöschte Serien</h3><table class="t"><tbody>${delSeries.map(s => `<tr><td><strong>${K.esc(s.title)}</strong></td><td>${ruleText(JSON.parse(s.rule))}</td>
        <td class="acts"><button class="btn small" data-act="srestore" data-id="${s.id}">Wiederherstellen</button></td></tr>`).join('')}</tbody></table><h3>Gelöschte Termine</h3>` : '') +
      (del.length ? `<table class="t"><thead><tr><th>Datum</th><th>Titel</th><th>Gruppe</th><th class="hide-m">Gelöscht</th><th></th></tr></thead><tbody>${del.map(e => `<tr>
        <td>${K.dateText(e)}</td><td><strong>${K.esc(e.title)}</strong></td><td>${glabel(e.grp)}</td>
        <td class="hide-m muted">${new Date(e.deleted_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · ${K.esc(e.deleted_by || '')}</td>
        <td class="acts"><button class="btn small" data-act="restore" data-id="${e.id}">Wiederherstellen</button>
          <button class="btn small danger" data-act="purge" data-id="${e.id}">Endgültig löschen</button></td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Der Papierkorb ist leer.</p>');
  }

  async function renderAudit() {
    $('#tab-protokoll').innerHTML = '<p class="empty">Lade …</p>';
    try {
      const d = await api('GET', 'audit');
      $('#tab-protokoll').innerHTML = `<table class="t"><thead><tr><th>Wann</th><th>Wer</th><th>Was</th></tr></thead><tbody>${d.audit.map(a => `<tr>
        <td>${new Date(a.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${K.esc(a.user)}</td>
        <td>${a.undone && a.action !== 'undo' && a.action !== 'import' ? '<s>' + K.esc(a.summary) + '</s> <span class="muted">(rückgängig gemacht)</span>' : K.esc(a.summary)}</td></tr>`).join('')}</tbody></table>`;
    } catch (err) { $('#tab-protokoll').innerHTML = `<p class="err">${K.esc(err.message)}</p>`; }
  }

  function ruleText(r) {
    if (r.type === 'weekly') return (r.interval > 1 ? `alle ${r.interval} Wochen ` : 'jeden ') + r.weekdays.map(w => K.WDL[w]).join(', ');
    return 'jeden ' + r.nth.map(n => (n === -1 ? 'letzten' : n + '.')).join(' und ') + ' ' + K.WDL[r.weekday];
  }

  // ---------------- Klicks ----------------
  document.addEventListener('click', async e => {
    const t = e.target;
    const mon = t.closest('[data-mon]');
    if (mon) { st.month += Number(mon.dataset.mon); return render(); }
    const add = t.closest('[data-add]');
    if (add) return openEvent(null, add.dataset.add);
    const act = t.closest('[data-act]');
    if (act) {
      e.stopPropagation();
      const id = act.dataset.id;
      const ev = st.events.find(x => x.id === id);
      if (act.dataset.act === 'newseries') return openSeries(null);
      if (act.dataset.act === 'dup') return duplicate(ev);
      if (act.dataset.act === 'del') return remove(ev);
      if (act.dataset.act === 'restore') return run(() => api('POST', `events/${id}/restore`), 'Wiederhergestellt ✓');
      if (act.dataset.act === 'srestore') return run(() => api('POST', `series/${id}/restore`), 'Serie wiederhergestellt ✓');
      if (act.dataset.act === 'purge') {
        if (await confirmDlg('Endgültig löschen?', `„${ev.title}“ (${K.fmtLong(ev.start_date)}) wird endgültig entfernt.`, { yes: 'Endgültig löschen' }))
          return run(() => api('POST', `events/${id}/purge`), 'Endgültig gelöscht');
        return;
      }
    }
    const row = t.closest('tr[data-id], .e[data-id]');
    if (row && !t.closest('dialog')) return openEvent(st.events.find(x => x.id === row.dataset.id));
    const srow = t.closest('tr[data-series]');
    if (srow) return openSeries(st.series.find(s => s.id === srow.dataset.series));
  });

  async function run(fn, msg) {
    try { await fn(); if (msg) toast(msg); await reload(); return true; }
    catch (err) { toast(err.message, 6000); return false; }
  }

  // Drag & Drop in der Monatsansicht
  let dragId = null;
  document.addEventListener('dragstart', e => { const el = e.target.closest && e.target.closest('.e[data-id]'); if (el) { dragId = el.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } });
  document.addEventListener('dragover', e => { const c = e.target.closest && e.target.closest('.cell[data-day]'); if (c && dragId) { e.preventDefault(); $$('.cell.drop').forEach(x => x.classList.remove('drop')); c.classList.add('drop'); } });
  document.addEventListener('dragend', () => { $$('.cell.drop').forEach(x => x.classList.remove('drop')); dragId = null; });
  document.addEventListener('drop', async e => {
    const c = e.target.closest && e.target.closest('.cell[data-day]');
    if (!c || !dragId) return;
    e.preventDefault();
    const ev = st.events.find(x => x.id === dragId);
    dragId = null;
    $$('.cell.drop').forEach(x => x.classList.remove('drop'));
    if (!ev || ev.start_date === c.dataset.day) return;
    const shift = K.dayDiff(ev.start_date, c.dataset.day);
    const body = { start_date: c.dataset.day, end_date: ev.end_date ? K.addDays(ev.end_date, shift) : null };
    run(() => api('PUT', 'events/' + ev.id, body), `„${ev.title}“ verschoben auf ${K.fmtLong(c.dataset.day)} ✓`);
  });

  // ---------------- Termin-Dialog ----------------
  const ef = $('#ev-form');
  function openEvent(ev, date) {
    st.editing = ev;
    ef.reset();
    $('#ev-err').textContent = '';
    $('#ev-title').textContent = ev ? 'Termin bearbeiten' : 'Neuer Termin';
    $('#ev-delete').hidden = $('#ev-dup').hidden = !ev;
    const v = ev || { title: '', grp: 'fuer-alle', start_date: date || now, start_time: '19:00' };
    ['title', 'grp', 'start_date', 'end_date', 'start_time', 'end_time', 'location', 'description', 'note'].forEach(k => (ef[k].value = v[k] || ''));
    ef.unchecked.checked = !!v.unchecked;
    ef.allday.checked = !v.start_time;
    toggleAllday();
    const s = ev && ev.series_id && st.series.find(x => x.id === ev.series_id);
    $('#ev-series-info').hidden = !s;
    if (s) $('#ev-series-info').innerHTML = `Teil der Serie <strong>${K.esc(s.title)}</strong> (${ruleText(JSON.parse(s.rule))}). Änderungen hier gelten <strong>nur für diesen Termin</strong>. <button type="button" class="btn small" id="ev-open-series">Ganze Serie bearbeiten</button>`;
    $('#dlg-event').showModal();
  }
  function toggleAllday() { const a = ef.allday.checked; ef.start_time.disabled = ef.end_time.disabled = a; if (a) { ef.start_time.value = ef.end_time.value = ''; } }
  ef.allday.addEventListener('change', toggleAllday);
  $('#ev-cancel').addEventListener('click', () => $('#dlg-event').close());
  $('#dlg-event').addEventListener('click', e => { if (e.target.id === 'ev-open-series') { $('#dlg-event').close(); openSeries(st.series.find(s => s.id === st.editing.series_id)); } });
  ef.addEventListener('submit', async e => {
    e.preventDefault();
    const body = {};
    ['title', 'grp', 'start_date', 'end_date', 'start_time', 'end_time', 'location', 'description', 'note'].forEach(k => (body[k] = ef[k].value.trim() || null));
    body.unchecked = ef.unchecked.checked;
    if (ef.allday.checked) body.start_time = body.end_time = null;
    if (privacyCheck([body.title, body.location, body.description].join(' ')) &&
      !await confirmDlg('Datenschutz', 'Der Text sieht nach einer Telefonnummer oder Privatadresse aus. Trotzdem speichern?', { yes: 'Trotzdem speichern' })) return;
    $('#ev-save').disabled = true;
    try {
      if (st.editing) await api('PUT', 'events/' + st.editing.id, body);
      else await api('POST', 'events', body);
      $('#dlg-event').close();
      toast('Gespeichert ✓');
      reload();
    } catch (err) { $('#ev-err').textContent = err.message; }
    finally { $('#ev-save').disabled = false; }
  });
  $('#ev-delete').addEventListener('click', async () => { const ev = st.editing; $('#dlg-event').close(); remove(ev); });
  $('#ev-dup').addEventListener('click', async () => { const ev = st.editing; $('#dlg-event').close(); duplicate(ev); });

  async function remove(ev) {
    const extra = ev.series_id ? ' Nur dieser eine Termin der Serie wird gelöscht.' : '';
    if (await confirmDlg('Termin löschen?', `„${ev.title}“ am ${K.fmtLong(ev.start_date)} kommt in den Papierkorb.${extra}`, { yes: 'Löschen' }))
      run(() => api('DELETE', 'events/' + ev.id), 'In den Papierkorb gelegt');
  }
  async function duplicate(ev) {
    const d = await confirmDlg('Termin duplizieren', `Kopie von „${ev.title}“ anlegen am:`, { yes: 'Kopie anlegen', date: K.addDays(ev.start_date, 7) });
    if (d) run(() => api('POST', `events/${ev.id}/duplicate`, { start_date: d }), 'Kopie angelegt ✓');
  }

  // ---------------- Serien-Dialog ----------------
  const sf = $('#se-form');
  function openSeries(s) {
    st.editingSeries = s;
    sf.reset();
    $('#se-err').textContent = '';
    $('#se-title').textContent = s ? 'Serie bearbeiten' : 'Neue Serie';
    $('#se-delete').hidden = !s;
    const v = s || { title: '', grp: 'fuer-alle', start_time: '19:00', from_date: `${YEAR}-01-01`, until_date: `${YEAR}-12-31`, rule: '{"type":"monthly","weekday":5,"nth":[1,3]}' };
    ['title', 'grp', 'location', 'start_time', 'end_time', 'from_date', 'until_date', 'description'].forEach(k => (sf[k].value = v[k] || ''));
    const r = JSON.parse(v.rule);
    sf.querySelector(`[name=type][value=${r.type}]`).checked = true;
    $$('#se-form [name=nth]').forEach(c => (c.checked = r.type === 'monthly' && r.nth.includes(Number(c.value))));
    $$('#se-form [name=wd]').forEach(c => (c.checked = r.type === 'weekly' && r.weekdays.includes(Number(c.value))));
    sf.mweekday.value = r.type === 'monthly' ? r.weekday : 5;
    sf.interval.value = r.interval || 1;
    $('#dlg-series').showModal();
    preview();
  }
  function seriesBody() {
    const type = sf.querySelector('[name=type]:checked').value;
    const rule = type === 'monthly'
      ? { type, weekday: Number(sf.mweekday.value), nth: $$('#se-form [name=nth]:checked').map(c => Number(c.value)) }
      : { type, weekdays: $$('#se-form [name=wd]:checked').map(c => Number(c.value)), interval: Number(sf.interval.value) || 1 };
    const b = { rule };
    ['title', 'grp', 'location', 'start_time', 'end_time', 'from_date', 'until_date', 'description'].forEach(k => (b[k] = sf[k].value.trim() || null));
    return b;
  }
  let pvT;
  function preview() {
    clearTimeout(pvT);
    pvT = setTimeout(async () => {
      const b = seriesBody();
      try {
        const d = await api('POST', 'series/preview', { rule: b.rule, from_date: b.from_date, until_date: b.until_date });
        const ex = st.editingSeries ? JSON.parse(st.editingSeries.exdates || '[]') : [];
        $('#se-preview').innerHTML = `<strong>${d.text}: ${d.dates.filter(x => !ex.includes(x)).length} Termine</strong><br>` +
          d.dates.map(x => ex.includes(x) ? `<s>${K.fmtShort(x)}</s>` : K.fmtShort(x)).join(', ');
        $('#se-err').textContent = '';
      } catch (err) { $('#se-preview').textContent = ''; $('#se-err').textContent = err.message; }
    }, 250);
  }
  sf.addEventListener('input', preview);
  sf.addEventListener('change', preview);
  $('#se-cancel').addEventListener('click', () => $('#dlg-series').close());
  sf.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = st.editingSeries ? await api('PUT', 'series/' + st.editingSeries.id, seriesBody()) : await api('POST', 'series', seriesBody());
      $('#dlg-series').close();
      toast(`Serie gespeichert: ${r.count} Termine ✓`);
      reload();
    } catch (err) { $('#se-err').textContent = err.message; }
  });
  $('#se-delete').addEventListener('click', async () => {
    const s = st.editingSeries;
    $('#dlg-series').close();
    if (await confirmDlg('Serie löschen?', `Alle Termine der Serie „${s.title}“ kommen in den Papierkorb.`, { yes: 'Serie löschen' }))
      run(() => api('DELETE', 'series/' + s.id), 'Serie gelöscht');
  });

  // ---------------- Passwort ----------------
  $('#pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    $('#pw-err').textContent = '';
    if (f.new.value !== f.new2.value) { $('#pw-err').textContent = 'Die neuen Passwörter stimmen nicht überein.'; return; }
    try { await api('POST', 'password', { old: f.old.value, new: f.new.value }); f.reset(); toast('Passwort geändert ✓'); }
    catch (err) { $('#pw-err').textContent = err.message; }
  });

  // ---------------- Export ----------------
  const HEAD = ['Datum', 'Tag', 'Titel', 'Gruppe', 'Beginn', 'Ende', 'Bis (mehrtägig)', 'Ort', 'Beschreibung', 'Prüfen / Hinweis', 'ID'];
  function exportRows() {
    return active().sort(K.sortEvents).map(e => [
      K.fmtLong(e.start_date), K.WD[K.wd(e.start_date)], e.title, glabel(e.grp), e.start_time || '', e.end_time || '',
      e.end_date ? K.fmtLong(e.end_date) : '', e.location || '', e.description || '', e.unchecked ? (e.note || 'ungeprüft') : '', e.id,
    ]);
  }
  const stampName = () => `Kalender-Sicherung-${new Date().toISOString().slice(0, 10)}`;
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('#btn-csv').addEventListener('click', () => {
    const q = v => /[";\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
    const csv = [HEAD, ...exportRows()].map(r => r.map(q).join(';')).join('\r\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), stampName() + '.csv');
  });
  $('#btn-xlsx').addEventListener('click', async () => {
    await K.loadScript('../vendor/xlsx.mini.min.js');
    const ws = XLSX.utils.aoa_to_sheet([HEAD, ...exportRows()]);
    ws['!cols'] = [12, 5, 32, 22, 8, 8, 14, 22, 30, 36, 18].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Termine');
    XLSX.writeFile(wb, stampName() + '.xlsx');
  });

  // ---------------- Import ----------------
  const COLMAP = [
    [/^datum/, 'start_date'], [/^titel|^termin/, 'title'], [/^gruppe/, 'grp'], [/^beginn|^von$|^start/, 'start_time'],
    [/^ende/, 'end_time'], [/^bis/, 'end_date'], [/^ort/, 'location'], [/^beschreibung/, 'description'], [/^pr(ü|ue)fen|^hinweis/, 'note'],
  ];
  const serialDate = n => { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000); return d.toISOString().slice(0, 10); };
  function toDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return serialDate(v);
    if (v instanceof Date) return K.iso(v);
    const s = String(v).trim();
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${K.pad(m[2])}-${K.pad(m[1])}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[0] : s;
  }
  function toTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') { const mins = Math.round((v % 1) * 1440); return K.pad(Math.floor(mins / 60) % 24) + ':' + K.pad(mins % 60); }
    const m = /^(\d{1,2})[:.](\d{2})/.exec(String(v).trim());
    return m ? K.pad(m[1]) + ':' + m[2] : String(v);
  }
  let importRows = [];
  $('#imp-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    $('#imp-preview').innerHTML = '<p>Lese Datei …</p>';
    try {
      await K.loadScript('../vendor/xlsx.mini.min.js');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: file.name.endsWith('.csv') });
      let rows = null;
      for (const name of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
        const hi = aoa.findIndex(r => r.some(c => /^datum$/i.test(String(c).trim())));
        if (hi >= 0) { rows = { aoa, hi }; break; }
      }
      if (!rows) throw new Error('Keine Spalte „Datum“ gefunden.');
      const head = rows.aoa[rows.hi].map(h => String(h).trim().toLowerCase());
      const idx = {};
      head.forEach((h, i) => { const f = COLMAP.find(([re]) => re.test(h)); if (f && idx[f[1]] === undefined) idx[f[1]] = i; });
      importRows = rows.aoa.slice(rows.hi + 1).map((r, i) => ({ r, n: rows.hi + i + 2 })).filter(x => x.r[idx.start_date] !== '' && x.r[idx.title] !== '').map(({ r, n }) => {
        const g = v => (idx[v] === undefined ? null : r[idx[v]]);
        const o = {
          _row: n, start_date: toDate(g('start_date')), title: String(g('title') || '').trim(), grp: String(g('grp') || '').trim(),
          start_time: toTime(g('start_time')), end_time: toTime(g('end_time')), end_date: toDate(g('end_date')),
          location: String(g('location') || '').trim() || null, description: String(g('description') || '').trim() || null,
          note: String(g('note') || '').trim() || null,
        };
        o.ok = !!K.GROUPS.find(x => x.label.toLowerCase() === o.grp.toLowerCase() || x.slug === o.grp) && /^\d{4}-\d{2}-\d{2}$/.test(o.start_date || '');
        return o;
      });
      const years = [...new Set(importRows.map(r => (r.start_date || '').slice(0, 4)))];
      $('#imp-year').value = years[0] || YEAR + 1;
      const bad = importRows.filter(r => !r.ok).length;
      $('#imp-preview').innerHTML = `<p><strong>${importRows.length} Termine</strong> gefunden (Jahr ${years.join(', ')}), davon
        ${importRows.filter(r => r.note).length} mit Prüfhinweis.${bad ? ` <span class="err">${bad} Zeile(n) mit Fehler (rot) – bitte in der Datei korrigieren.</span>` : ''}</p>
        <div class="row"><button class="btn primary" id="imp-go" ${bad ? 'disabled' : ''}>Jetzt importieren</button></div>
        <div style="max-height:360px;overflow:auto"><table class="t"><thead><tr><th>Zeile</th><th>Datum</th><th>Titel</th><th>Gruppe</th><th>Zeit</th><th>Bis</th><th>Ort</th><th>Hinweis</th></tr></thead><tbody>
        ${importRows.map(r => `<tr class="${r.ok ? '' : 'bad'}"><td>${r._row}</td><td>${K.esc(r.start_date)}</td><td>${K.esc(r.title)}</td><td>${K.esc(r.grp)}</td>
          <td>${K.esc(r.start_time || '')}${r.end_time ? '–' + K.esc(r.end_time) : ''}</td><td>${K.esc(r.end_date || '')}</td><td>${K.esc(r.location || '')}</td><td>${K.esc(r.note || '')}</td></tr>`).join('')}
        </tbody></table></div>`;
    } catch (err) { $('#imp-preview').innerHTML = `<p class="err">${K.esc(err.message)}</p>`; }
  });
  document.addEventListener('click', async e => {
    if (e.target.id !== 'imp-go') return;
    const mode = document.querySelector('[name=imp-mode]:checked').value;
    const year = $('#imp-year').value;
    const text = mode === 'replace'
      ? `${importRows.length} Termine importieren. Vorher kommen alle Einzeltermine des Jahres ${year} in den Papierkorb.`
      : `${importRows.length} Termine zusätzlich importieren.`;
    if (!await confirmDlg('Import starten?', text, { yes: 'Importieren' })) return;
    try {
      const rows = importRows.map(({ ok, ...r }) => r);
      const d = await api('POST', 'import', { rows, mode, year });
      toast(`Import fertig: ${d.count} Termine` + (d.removed ? `, ${d.removed} alte im Papierkorb` : '') + ' ✓', 6000);
      $('#imp-preview').innerHTML = ''; $('#imp-file').value = '';
      reload();
    } catch (err) {
      const list = (err.data && err.data.errors || []).map(x => `Zeile ${x.row}: ${x.error}`).join('\n');
      $('#imp-preview').insertAdjacentHTML('afterbegin', `<p class="err">${K.esc(err.message)}\n${K.esc(list)}</p>`);
    }
  });

  // ---------------- los ----------------
  if (st.token) start(); else { $('#login').hidden = false; }
})();
