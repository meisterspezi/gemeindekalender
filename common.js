// Gemeinsame Daten und Hilfsfunktionen für öffentliche Seite, PDF und Admin
(function () {
  // Gruppenfarben: Apple-Systemfarben, „Für alle“ in Logo-Schwarz
  const GROUPS = [
    { slug: 'fuer-alle',        label: 'Für alle',              color: '#1D1D1F', always: true },
    { slug: 'pastor',           label: 'Pastor & Überregional', color: '#8E8E93' },
    { slug: 'kinder',           label: 'Kinder',                color: '#34C759' },
    { slug: 'jugend',           label: 'Jugend',                color: '#FF9500' },
    { slug: 'kinder-jugend',    label: 'Kinder + Jugend',       color: '#FFCC00', derived: true },
    { slug: 'junge-erwachsene', label: 'Junge Erwachsene',      color: '#32ADE6' },
    { slug: 'maenner',          label: 'Männer',                color: '#0040DD' },
    { slug: 'frauen',           label: 'Frauen',                color: '#FF2D55' },
    { slug: 'ehepaare',         label: 'Ehepaare',              color: '#AF52DE' },
    { slug: 'mission',          label: 'Mission & Einsätze',    color: '#A2845E' },
  ];
  const SELECTABLE = GROUPS.filter(g => !g.always && !g.derived).map(g => g.slug);
  const PRESETS = {
    gemeinde: { label: 'Nur Gemeinde', groups: ['pastor'] },
    familie: { label: 'Familie', groups: ['pastor', 'kinder', 'jugend', 'ehepaare'] },
    alles: { label: 'Alles', groups: SELECTABLE.slice() },
  };
  const byslug = Object.fromEntries(GROUPS.map(g => [g.slug, g]));

  /** gewählte Gruppen -> sichtbare Gruppen (inkl. Für alle und Kinder + Jugend) */
  function visible(selected) {
    const v = new Set(selected.filter(s => SELECTABLE.includes(s)));
    v.add('fuer-alle');
    if (v.has('kinder') || v.has('jugend')) v.add('kinder-jugend');
    return v;
  }

  // ---------- Feiertage & Schulferien Bayern (nur Anzeige) ----------
  // Quelle: Bayerisches Kultusministerium (km.bayern.de), Stand Nov. 2026
  const FEIERTAGE = {
    2027: [
      ['2027-01-01', 'Neujahr'], ['2027-01-06', 'Heilige Drei Könige'], ['2027-03-26', 'Karfreitag'],
      ['2027-03-28', 'Ostersonntag'], ['2027-03-29', 'Ostermontag'], ['2027-05-01', 'Tag der Arbeit'],
      ['2027-05-06', 'Christi Himmelfahrt'], ['2027-05-16', 'Pfingstsonntag'], ['2027-05-17', 'Pfingstmontag'],
      ['2027-05-27', 'Fronleichnam'], ['2027-08-15', 'Mariä Himmelfahrt'], ['2027-10-03', 'Tag der Deutschen Einheit'],
      ['2027-11-01', 'Allerheiligen'], ['2027-11-17', 'Buß- und Bettag (schulfrei)'],
      ['2027-12-25', '1. Weihnachtstag'], ['2027-12-26', '2. Weihnachtstag'],
    ],
  };
  const FERIEN = {
    2027: [
      ['2026-12-24', '2027-01-08', 'Weihnachtsferien'], ['2027-02-08', '2027-02-12', 'Frühjahrsferien'],
      ['2027-03-22', '2027-04-02', 'Osterferien'], ['2027-05-18', '2027-05-28', 'Pfingstferien'],
      ['2027-08-02', '2027-09-13', 'Sommerferien'], ['2027-11-02', '2027-11-05', 'Herbstferien'],
      ['2027-12-24', '2028-01-07', 'Weihnachtsferien'],
    ],
  };
  function holidayInfo(year) {
    const map = {};
    (FEIERTAGE[year] || []).forEach(([d, n]) => { (map[d] = map[d] || {}).feiertag = n; });
    (FERIEN[year] || []).forEach(([a, b, n]) => {
      for (let d = a; d <= b; d = addDays(d, 1)) (map[d] = map[d] || {}).ferien = n;
    });
    return map;
  }

  // ---------- Datum ----------
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  const wd = s => parse(s).getDay();
  const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const fmtShort = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
  const fmtLong = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  const today = () => iso(new Date());

  function timeText(e) {
    if (!e.start_time) return e.end_date ? 'mehrtägig' : 'ganztägig';
    return e.end_time ? `${e.start_time}–${e.end_time} Uhr` : `${e.start_time} Uhr`;
  }
  function dateText(e) {
    if (e.end_date) return `${WD[wd(e.start_date)]} ${fmtShort(e.start_date)} – ${WD[wd(e.end_date)]} ${fmtShort(e.end_date)}`;
    return `${WD[wd(e.start_date)]} ${fmtShort(e.start_date)}`;
  }
  /** Alle Tage, an denen ein Termin stattfindet */
  function eventDays(e) {
    const out = [e.start_date];
    if (e.end_date) for (let d = addDays(e.start_date, 1); d <= e.end_date; d = addDays(d, 1)) out.push(d);
    return out;
  }
  const sortEvents = (a, b) => (a.start_date + (a.start_time || '00:00') + a.title).localeCompare(b.start_date + (b.start_time || '00:00') + b.title);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Laden fehlgeschlagen: ' + src));
      document.head.appendChild(s);
    });
  }

  // Designs (Web + PDF)
  const DESIGNS = {
    1: { name: 'Weiß & Klar',     pdf: { mFill: [255, 255, 255], mInk: [29, 29, 31], mLine: [227, 6, 19], title: [29, 29, 31] } },
    2: { name: 'Schwarz & Edel',  pdf: { mFill: [29, 29, 31],   mInk: [255, 255, 255], mLine: null, title: [29, 29, 31], rule: [227, 6, 19] } },
    3: { name: 'Rot & Lebendig',  pdf: { mFill: [215, 0, 21],   mInk: [255, 255, 255], mLine: null, title: [215, 0, 21] } },
  };

  window.KAL = { DESIGNS,
    GROUPS, SELECTABLE, PRESETS, byslug, visible, holidayInfo, FEIERTAGE, FERIEN,
    WD, WDL, MONTHS, pad, iso, parse, addDays, wd, dayDiff, fmtShort, fmtLong, today, timeText, dateText,
    eventDays, sortEvents, esc, loadScript,
  };
})();
