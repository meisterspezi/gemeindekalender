// PDF-Erzeugung im Browser (jsPDF): Jahresübersicht A4 quer (2 Halbjahre) + Terminliste
(function () {
  const K = window.KAL;
  const W = 297, H = 210, M = 8;
  const BRAND = [29, 78, 95];
  const INK = [29, 39, 48];
  const MUTED = [110, 118, 125];

  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const tint = (c, f) => c.map(v => Math.round(v + (255 - v) * f));

  function fit(doc, text, width) {
    if (doc.getTextWidth(text) <= width) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + '…') > width) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  function header(doc, o, sub) {
    let tx = M;
    if (o.logo) { try { doc.addImage(o.logo, 'PNG', M, 2.6, 12, 12); tx = M + 14.5; } catch (e) { /* ohne Logo */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...BRAND);
    doc.text(`${o.title} – ${sub}`, tx, 11.2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    const auswahl = o.allGroups ? 'alle Gruppen' : o.groups.map(g => g.label).join(', ');
    doc.text(fit(doc, `${o.subtitle} · Auswahl: ${auswahl}`, 150), W - M, 8.5, { align: 'right' });
    doc.text('Stand: ' + K.fmtLong(K.today()), W - M, 12.5, { align: 'right' });
  }

  function legend(doc, o, y) {
    doc.setFontSize(7.5);
    let x = M;
    o.groups.forEach(g => {
      const c = rgb(g.color);
      doc.setFillColor(...c); doc.rect(x, y - 2.6, 3.2, 3.2, 'F');
      doc.setTextColor(...INK); doc.text(g.label, x + 4.4, y);
      x += 4.4 + doc.getTextWidth(g.label) + 6;
    });
    if (o.holidays && !o.noFerienLegend) {
      doc.setFillColor(234, 243, 246); doc.setDrawColor(185, 210, 220); doc.setLineWidth(0.2);
      doc.rect(x, y - 2.6, 3.2, 3.2, 'FD');
      doc.setTextColor(...INK); doc.text('Schulferien Bayern', x + 4.4, y);
    }
  }

  function halfYear(doc, o, half, byDay) {
    header(doc, o, half === 0 ? '1. Halbjahr' : '2. Halbjahr');
    const top = 17, headH = 7, legendH = 8;
    const cw = (W - 2 * M) / 6;
    const rh = (H - M - legendH - top - headH) / 31;
    const labeled = new Set();
    for (let c = 0; c < 6; c++) {
      const m = half * 6 + c;
      const x = M + c * cw;
      doc.setFillColor(...BRAND); doc.rect(x, top, cw - 0.6, headH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
      doc.text(K.MONTHS[m], x + (cw - 0.6) / 2, top + 4.9, { align: 'center' });
      const days = new Date(o.year, m + 1, 0).getDate();
      for (let d = 1; d <= 31; d++) {
        const y = top + headH + (d - 1) * rh;
        if (d > days) { doc.setFillColor(232, 232, 232); doc.rect(x, y, cw - 0.6, rh, 'F'); continue; }
        const ds = `${o.year}-${K.pad(m + 1)}-${K.pad(d)}`;
        const wd = K.wd(ds);
        const fer = o.holidays && (o.holidays[ds] || {}).ferien;
        if (fer) { doc.setFillColor(...(wd === 0 ? [214, 229, 236] : wd === 6 ? [224, 236, 242] : [234, 243, 246])); doc.rect(x, y, cw - 0.6, rh, 'F'); }
        else if (wd === 0) { doc.setFillColor(233, 230, 222); doc.rect(x, y, cw - 0.6, rh, 'F'); }
        else if (wd === 6) { doc.setFillColor(245, 243, 238); doc.rect(x, y, cw - 0.6, rh, 'F'); }
        if (fer && !(byDay[ds] || []).length && !labeled.has(fer + m)) {
          labeled.add(fer + m);
          doc.setFont('helvetica', 'italic'); doc.setFontSize(5.8); doc.setTextColor(90, 120, 135);
          doc.text(fer, x + 9.4, y + rh / 2 + 1.0);
        }
        doc.setDrawColor(215, 210, 200); doc.setLineWidth(0.15); doc.line(x, y + rh, x + cw - 0.6, y + rh);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...INK);
        doc.text(String(d), x + 1, y + rh / 2 + 1.2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
        doc.text(K.WD[wd], x + 4.6, y + rh / 2 + 1.1);
        const evs = byDay[ds] || [];
        if (!evs.length) continue;
        const tx = x + 9.4, tw = cw - 0.6 - 9.4 - 0.6;
        const lines = evs.length === 1 ? [evs[0]] : evs.slice(0, 2);
        const lh = (rh - 0.6) / lines.length;
        lines.forEach((e, i) => {
          const c = rgb((K.byslug[e.grp] || {}).color || '#888888');
          const ly = y + 0.3 + i * lh;
          doc.setFillColor(...tint(c, 0.78)); doc.rect(tx, ly, tw, lh - 0.25, 'F');
          doc.setFillColor(...c); doc.rect(tx, ly, 1, lh - 0.25, 'F');
          doc.setFont('helvetica', i === 0 && lines.length === 1 ? 'bold' : 'normal');
          doc.setFontSize(lines.length === 1 ? 6.6 : 5.6); doc.setTextColor(...INK);
          let text = (e.start_time && e.start_date === ds ? e.start_time + ' ' : '') + e.title;
          if (i === 1 && evs.length > 2) text += ` (+${evs.length - 2})`;
          doc.text(fit(doc, text, tw - 2), tx + 1.6, ly + lh / 2 + (lines.length === 1 ? 0.95 : 0.8));
        });
      }
    }
    legend(doc, o, H - M - 1.5);
  }

  function list(doc, o) {
    const cols = [
      { t: 'Datum', w: 40 }, { t: 'Zeit', w: 30 }, { t: 'Termin', w: 92 }, { t: 'Gruppe', w: 48 }, { t: 'Ort', w: W - 2 * M - 210 },
    ];
    const rowH = 6.4, top = 22;
    let y = top, page = 0, lastMonth = '';
    const head = () => {
      header(doc, o, 'Terminliste' + (page > 0 ? ' (Fortsetzung)' : ''));
      let x = M;
      doc.setFillColor(...BRAND); doc.rect(M, 15.5, W - 2 * M, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
      cols.forEach(c => { doc.text(c.t, x + 2.5, 19.6); x += c.w; });
      y = top + 1;
    };
    head();
    o.events.forEach(e => {
      const mon = e.start_date.slice(0, 7);
      const needMonth = mon !== lastMonth;
      if (y + rowH * (needMonth ? 2 : 1) > H - M - 4) {
        legend(doc, { ...o, noFerienLegend: true }, H - M - 1.5);
        doc.addPage('a4', 'landscape'); page++; head();
      }
      if (needMonth) {
        lastMonth = mon;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...BRAND);
        doc.text(`${K.MONTHS[Number(mon.slice(5, 7)) - 1]} ${mon.slice(0, 4)}`, M + 1, y + 4.6);
        y += rowH;
      }
      const c = rgb((K.byslug[e.grp] || {}).color || '#888888');
      doc.setFillColor(...tint(c, 0.85)); doc.rect(M, y, W - 2 * M, rowH - 0.4, 'F');
      doc.setFillColor(...c); doc.rect(M, y, 1.4, rowH - 0.4, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK);
      const vals = [
        K.dateText(e), K.timeText(e).replace(' Uhr', '') + (e.start_time ? ' Uhr' : ''), e.title,
        (K.byslug[e.grp] || {}).label || e.grp, e.location || '',
      ];
      let x = M;
      vals.forEach((v, i) => {
        doc.setFont('helvetica', i === 2 ? 'bold' : 'normal');
        doc.text(fit(doc, v, cols[i].w - 4), x + 2.5, y + 4.2);
        x += cols[i].w;
      });
      y += rowH;
    });
    legend(doc, { ...o, noFerienLegend: true }, H - M - 1.5);
  }

  function create(o) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setProperties({ title: `${o.title} – FBG Eichstätt`, author: 'FBG Eichstätt', creator: 'Gemeindekalender' });
    const byDay = {};
    o.events.forEach(e => K.eventDays(e).forEach(d => (byDay[d] = byDay[d] || []).push(e)));
    halfYear(doc, o, 0, byDay);
    doc.addPage('a4', 'landscape');
    halfYear(doc, o, 1, byDay);
    if (o.withList) { doc.addPage('a4', 'landscape'); list(doc, o); } // Terminliste nur auf Wunsch
    const name = `FBG-Kalender-${o.year}${o.allGroups ? '' : '-Auswahl'}.pdf`;
    if (o.returnDoc) return doc;
    doc.save(name);
  }

  window.KAL_PDF = { create };
})();
