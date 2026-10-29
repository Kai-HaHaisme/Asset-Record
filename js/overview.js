/* 總覽頁：目前總資產、類別圓環圖、記錄這次資產（快照）、補登過去、資產走勢圖（純 SVG）、快照紀錄、90 天內到期與繳費。
   快照存各類別總額（TWD 最小單位）、當時匯率，並把每個項目的名稱與市值一併存下，所以日後刪掉某個帳戶或股票，歷史走勢與明細都不會變。 */
const OverviewPage = (() => {
  let P = null, del = null, msg = null, metric = 'total', range = '1y', showAll = false, openId = null, CH = null;
  const CATS = [['cash', '現金與存款', '--c1'], ['stock', '股票', '--c2'], ['bond', '債券與基金', '--c3'], ['other', '其他', '--c4']];
  const RANGES = [['6m', '近 6 個月'], ['1y', '近 1 年'], ['all', '全部']];
  const sgn = m => (m >= 0 ? '+' : '−') + fmtMinor(Math.abs(m), 'TWD'), cls = m => m > 0 ? 'gain' : m < 0 ? 'loss' : '';
  const reset = () => { P = null; del = null; msg = null; showAll = false; openId = null; };
  const inRange = S => { if (range == 'all') return S; const cut = new Date(Date.now() - (range == '6m' ? 183 : 365) * DAY); const c = new Date(cut.getTime() - cut.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return S.filter(s => s.date >= c); };
  const hv = h => mulDiv(h.sh, h.price, 10000);

  async function render() {
    const A = await loadAssets(), snaps = await DB.all('snapshots'), tw = m => fmtMinor(m, 'TWD'), last = snaps[snaps.length - 1], SR = inRange(snaps);
    const [ins] = [await DB.all('insurance')];
    // 需要更新的項目（超過 7 天沒更新：活存、股票、債券與基金）
    const stale = [...A.acc.filter(a => a.t == 'D').map(a => a.at), ...A.hold.map(h => h.at), ...A.oth.filter(o => o.k != 'other').map(o => o.at)].filter(d => d && dAgo(d) >= 7);
    const dl = last ? A.total - last.total : 0;
    let left = `<div class="card"><div class="sec">目前總資產</div><div class="big">${tw(A.total)}</div>
      <div class="mt">${last ? `較上次記錄（${last.date}）<span class="${cls(dl)}">${sgn(dl)}（${dl >= 0 ? '+' : '−'}${last.total ? Math.abs(dl / last.total * 100).toFixed(1) : '0.0'}%）</span>` : '還沒有記錄'}</div>
      <div class="mt">${RATES.FOREIGN.map(c => `${c} ${rfmt(RATES.rate(c))}`).join('、')}（1 單位外幣 = 幾 TWD）｜保險不計入總資產</div>${missWarn(A.miss)}
      <div class="bar"><button class="btn main" data-a="rec">記錄這次資產</button><button class="btn" data-a="back">補登過去</button></div>${msgHtml(msg ? { t: msg } : null)}`;
    if (P && P.k == 'rec') left += `<div class="panel"><b>記錄這次資產</b><div class="mt">把目前各類別的總額與每個項目的明細存成一筆快照。記錄的是現在的金額；要補過去的資產請用「補登過去」。</div>
      <input type="date" id="pd" value="${todayStr()}" aria-label="快照日期" style="margin:8px 0"><table>${CATS.map(([k, n]) => `<tr><td>${n}</td><td>${tw(A.cat[k].s)}</td></tr>`).join('')}<tr><td><b>總資產</b></td><td><b>${tw(A.total)}</b></td></tr></table>
      ${stale.length ? `<div class="warn">有 ${stale.length} 項（活存餘額、股票現價、債券與基金價值）超過 7 天沒更新，記錄的金額可能不準。建議先到各頁更新。</div>` : ''}${missWarn(A.miss)}<div class="err" id="pe"></div>
      <div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="rok">確認記錄</button></div></div>`;
    if (P && P.k == 'back') left += `<div class="panel"><b>補登過去的資產</b><div class="mt">只填各類別總額（換算成 NT$）；補登的快照沒有項目明細。</div>
      <input type="date" id="pd" aria-label="快照日期" style="margin:8px 0"><div class="g2">${CATS.map(([k, n]) => `<label class="mt">${n}<input type="number" min="0" step="any" inputmode="decimal" id="b-${k}" placeholder="0"></label>`).join('')}</div><div class="err" id="pe"></div>
      <div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="bok">補登</button></div></div>`;
    left += '</div>';
    left += donutHtml(CATS.map(([k, n, c]) => [n, A.cat[k].s, c]), '資產分布', '總資產', '資產分布圓環圖');
    /* 右欄：走勢圖、近期到期、快照紀錄 */
    let right = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="sec" style="margin:0">資產走勢</div><div style="display:flex;gap:8px;flex-wrap:wrap"><div class="seg">${RANGES.map(([k, n]) => `<button data-rg="${k}" class="${range == k ? 'on' : ''}">${n}</button>`).join('')}</div><div class="seg"><button data-m="total" class="${metric == 'total' ? 'on' : ''}">總額</button><button data-m="cat" class="${metric == 'cat' ? 'on' : ''}">各類別</button></div></div></div>${chart(SR)}<div id="ro"></div></div>`;
    const up = [];
    A.acc.filter(a => a.t == 'T' && days(a.mat) <= 90).forEach(a => up.push({ n: `${a.bank}${a.n ? ' ' + a.n : ''}`, d: a.mat, t: '定存到期' }));
    ins.filter(a => a.status != 'ended' && !InsurancePage.complete(a)).forEach(a => {
      if (InsurancePage.payState(a) != 'paid' && days(a.due) <= 90) up.push({ n: `${a.co}${a.n ? ' ' + a.n : ''}`, d: a.due, t: '保險繳費' });
      if (a.end && days(a.end) <= 90) up.push({ n: `${a.co}${a.n ? ' ' + a.n : ''}`, d: a.end, t: '保障到期' });
    });
    up.sort((a, b) => a.d.localeCompare(b.d));
    right += `<div class="card"><div class="sec">90 天內到期與繳費（含已逾期）</div>${up.map(x => `<div class="up"><span>${esc(x.n)}<span class="tag">${x.t}</span></span><span class="d${days(x.d) <= 30 ? ' s' : ''}">${x.d}（${days(x.d) < 0 ? '已過 ' + (-days(x.d)) + ' 天' : days(x.d) == 0 ? '今天' : days(x.d) + ' 天後'}）</span></div>`).join('') || '<div class="mt">近期沒有。</div>'}</div>`;
    const list = snaps.slice().reverse(), shown = showAll ? list : list.slice(0, 6);
    right += `<div class="card"><div class="sec">快照紀錄（${list.length}）</div><div class="sc"><table><tr><th>日期</th><th>總資產</th>${CATS.map(x => `<th>${x[1]}</th>`).join('')}<th></th></tr>${shown.map(s => `<tr><td>${s.date}${s.note ? `<span class="tag">${esc(s.note)}</span>` : ''}</td><td>${tw(s.total)}</td>${CATS.map(x => `<td>${tw(s[x[0]])}</td>`).join('')}<td>${del == s.id ? `<span class="err">刪除？</span> <button class="btn sm" data-a="dc">取消</button> <button class="btn sm" data-a="dok" data-id="${s.id}">刪除</button>` : `${(s.items || []).length ? `<button class="btn sm" data-a="det" data-id="${s.id}">${openId == s.id ? '收起' : '明細'}</button> ` : ''}<button class="btn sm" data-a="del" data-id="${s.id}">刪除</button>`}</td></tr>${openId == s.id ? `<tr><td colspan="7" style="text-align:left;white-space:normal">${detailHtml(s)}</td></tr>` : ''}`).join('')}</table></div>${list.length > 6 ? `<div class="r"><button class="btn sm" data-a="all">${showAll ? '只顯示最近 6 筆' : '顯示全部'}</button></div>` : ''}${list.length ? '' : '<div class="mt">還沒有快照。按「記錄這次資產」開始。</div>'}</div>`;
    return `<div class="cols"><div>${left}</div><div>${right}</div></div>`;
  }
  const detailHtml = s => CATS.map(([k, n]) => { const l = (s.items || []).filter(i => i.k == k); return l.length ? `<div class="sec" style="margin:8px 0 2px">${n}</div>${l.map(i => `<div class="up"><span>${esc(i.n)}</span><span>${fmtMinor(i.v, 'TWD')}</span></div>`).join('')}` : ''; }).join('') + `<div class="mt" style="margin-top:6px">${s.rates ? '當時匯率：' + Object.entries(s.rates).map(([c, v]) => `${c} ${rfmt(v)}`).join('、') : ''}</div>`;

  /* 走勢圖（純 SVG）。數值用 TWD 最小單位，座標軸顯示成 K／M。 */
  function chart(S) {
    CH = null;
    if (S.length < 2) return '<div class="mt" style="padding:20px 0">這個範圍內不到 2 筆快照，畫不出走勢。請改選較長的範圍，或先記錄一筆。</div>';
    const keys = metric == 'total' ? [['total', '總資產', '--ink']] : CATS, W = 640, H = 240, L = 46, R = 12, T = 12, B = 26, t0 = new Date(S[0].date), t1 = new Date(S[S.length - 1].date), span = (t1 - t0) || 1;
    const mx = Math.max(1, ...S.flatMap(s => keys.map(k => s[k[0]]))) / 100, e = Math.pow(10, Math.floor(Math.log10(mx / 4))), step = [1, 2, 5, 10].map(m => m * e).find(x => x * 4 >= mx) || mx / 4, ymax = step * Math.ceil(mx / step);
    const X = s => L + (new Date(s.date) - t0) / span * (W - L - R), Y = v => T + (1 - (v / 100) / ymax) * (H - T - B);
    CH = { S, keys, X, W };
    let g = '';
    for (let v = 0; v <= ymax + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v * 100)}" y2="${Y(v * 100)}" stroke="var(--line)" stroke-width=".7"/><text x="${L - 6}" y="${Y(v * 100) + 4}" text-anchor="end" font-size="11" fill="var(--sub)">${wan(Math.round(v))}</text>`;
    const xs = [S[0], S[Math.floor((S.length - 1) / 2)], S[S.length - 1]];
    g += xs.map((s, i) => `<text x="${X(s)}" y="${H - 6}" text-anchor="${i == 0 ? 'start' : i == 2 ? 'end' : 'middle'}" font-size="11" fill="var(--sub)">${s.date.slice(0, 7)}</text>`).join('');
    keys.forEach(k => { g += `<polyline fill="none" stroke="var(${k[2]})" stroke-width="2" points="${S.map(s => X(s).toFixed(1) + ',' + Y(s[k[0]]).toFixed(1)).join(' ')}"/>` + S.map(s => `<circle cx="${X(s).toFixed(1)}" cy="${Y(s[k[0]]).toFixed(1)}" r="2.6" fill="var(${k[2]})"/>`).join(''); });
    return `<svg id="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="資產走勢折線圖" style="width:100%;height:auto;display:block;touch-action:pan-y">${g}<line id="mk" y1="${T}" y2="${H - B}" stroke="var(--sub)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
  }
  function bindChart() {
    const svg = $('#ch'), ro = $('#ro'); if (!svg || !CH) return;
    const show = i => { const s = CH.S[i], x = CH.X(s), mk = $('#mk'); mk.setAttribute('x1', x); mk.setAttribute('x2', x); mk.setAttribute('visibility', 'visible');
      ro.innerHTML = `<b>${s.date}</b>　` + CH.keys.map(k => `<span style="white-space:nowrap">${CH.keys.length > 1 ? `<i style="display:inline-block;width:8px;height:8px;background:var(${k[2]});margin-right:4px"></i>${k[1]} ` : ''}${fmtMinor(s[k[0]], 'TWD')}</span>`).join('　'); };
    show(CH.S.length - 1);
    const mv = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * CH.W; let bi = 0; CH.S.forEach((s, i) => { if (Math.abs(CH.X(s) - x) < Math.abs(CH.X(CH.S[bi]) - x)) bi = i; }); show(bi); };
    svg.addEventListener('pointermove', mv); svg.addEventListener('pointerdown', mv);
  }

  /* 記錄快照：每個項目的名稱與市值（TWD 最小單位）一起存，之後項目被刪除也不影響歷史 */
  async function snapItems(A) {
    const out = [], add = (k, n, m, c) => { const t = cvt(m, c); if (t != null) out.push({ k, n, v: t }); };
    A.acc.forEach(a => add('cash', `${a.bank}${a.n ? ' ' + a.n : ''}（${a.t == 'D' ? '活存' : '定存'}）`, a.v, a.c));
    A.hold.forEach(h => add('stock', `${h.sym} ${h.n}`, hv(h), h.m == 'TW' ? 'TWD' : 'USD'));
    A.oth.forEach(o => add(o.k == 'other' ? 'other' : 'bond', o.n, o.v, o.c));
    return out;
  }
  async function addSnap(date, cats, note, items) {
    if (!date) return errTo('請選擇日期'); if (date > todayStr()) return errTo('不能記錄未來的日期');
    if ((await DB.all('snapshots')).some(s => s.date == date)) return errTo(`${date} 已經有一筆快照。請改日期，或先刪除舊的那筆。`);
    const row = { id: DB.uid('s'), date, cash: cats.cash, stock: cats.stock, bond: cats.bond, other: cats.other, total: cats.cash + cats.stock + cats.bond + cats.other };
    if (note) row.note = note; if (items) { row.items = items; row.rates = { USD: RATES.rate('USD'), JPY: RATES.rate('JPY') }; }
    await DB.put('snapshots', row); return true;
  }
  async function click(e) {
    const rg = e.target.closest('[data-rg]'); if (rg) { range = rg.dataset.rg; return true; }
    const m = e.target.closest('[data-m]'); if (m) { metric = m.dataset.m; return true; }
    const b = e.target.closest('[data-a]'); if (!b) return false;
    const a = b.dataset.a; msg = null;
    if (a == 'rec') P = { k: 'rec' }; else if (a == 'back') P = { k: 'back' }; else if (a == 'pc') P = null;
    else if (a == 'rok') {
      const A = await loadAssets(); if (A.miss) return errTo('有外幣項目沒有匯率，記錄的總額會不準。請先到「設定」更新或手動輸入匯率。');
      const r = await addSnap(val('pd'), { cash: A.cat.cash.s, stock: A.cat.stock.s, bond: A.cat.bond.s, other: A.cat.other.s }, '', await snapItems(A)); if (r !== true) return 'stay';
      P = null; msg = '已記錄這次資產。';
    }
    else if (a == 'bok') {
      const v = {}; for (const [k] of CATS) { const s = val('b-' + k); const x = s === '' ? 0 : parseMinor(s); if (x == null || x < 0) return errTo('金額要是 0 或正數'); v[k] = x; }
      if (Object.values(v).every(x => !x)) return errTo('請至少填一個類別的金額');
      const r = await addSnap(val('pd'), v, '補登', null); if (r !== true) return 'stay';
      P = null; msg = '已補登。';
    }
    else if (a == 'del') del = b.dataset.id; else if (a == 'dc') del = null;
    else if (a == 'dok') { await DB.del('snapshots', b.dataset.id); del = null; if (openId == b.dataset.id) openId = null; msg = '已刪除一筆快照。'; }
    else if (a == 'det') openId = openId == b.dataset.id ? null : b.dataset.id;
    else if (a == 'all') showAll = !showAll;
    else return false;
    return true;
  }
  return { render, click, after: bindChart, reset };
})();
