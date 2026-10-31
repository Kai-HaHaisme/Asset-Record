/* 投資頁：股票（台股、美股）、債券與基金、其他資產；批次更新價格與價值；損益（紅漲綠跌）；調整順序。
   股數存成「股數 × 10000」，股價與成本存成「價格 × 100」，市值 = 股數 × 股價（整數運算，見 money.js）。 */
const InvestPage = (() => {
  let P = null, del = null, msg = null, order = null, tab = 'all', fx = null;
  const KN = { bond: '債券', fund: '基金', other: '其他資產' };
  const cur = m => m == 'TW' ? 'TWD' : 'USD';
  const hv = h => mulDiv(h.sh, h.price, 10000), cost = h => mulDiv(h.sh, h.cost, 10000);
  const cls = p => p > 0 ? 'gain' : p < 0 ? 'loss' : '';
  const sgn = (m, c) => (m >= 0 ? '+' : '−') + fmtMinor(Math.abs(m), c);
  const reset = () => { P = null; del = null; msg = null; order = null; tab = 'all'; fx = null; };

  async function render() {
    const hs = await DB.all('holdings'), oth = await DB.all('others'), O = order;
    const bf = oth.filter(o => o.k != 'other'), ot = oth.filter(o => o.k == 'other');
    const vis = O == 'stock' ? hs : hs.filter(h => tab == 'all' || h.m == tab);
    const tw = m => fmtMinor(m, 'TWD');
    const st = m => sumTWD(hs.filter(h => h.m == m).map(h => [hv(h), cur(m)])), sTW = st('TW'), sUS = st('US'), sBF = sumTWD(bf.map(o => [o.v, o.c])), sOT = sumTWD(ot.map(o => [o.v, o.c]));
    const stockT = sTW.s + sUS.s, miss = sTW.miss + sUS.miss + sBF.miss + sOT.miss;
    const ages = [...hs.map(h => dAgo(h.at || todayStr())), ...bf.map(o => dAgo(o.at || todayStr()))], stale = ages.filter(d => d >= 7).length, oldest = Math.max(0, ...ages);
    let left = `<div class="card"><div class="sec">投資與其他資產</div><div class="big">${tw(stockT + sBF.s + sOT.s)}</div>
      <div class="sum3"><span>股票</span><span>${tw(stockT)}</span><span>債券與基金</span><span>${tw(sBF.s)}</span><span>其他資產</span><span>${tw(sOT.s)}</span></div>
      ${RATES.FOREIGN.some(c => hs.some(h => cur(h.m) == c) || oth.some(o => o.c == c)) ? `<div class="mt" style="margin-top:8px">${RATES.FOREIGN.map(c => `${c} ${rfmt(RATES.rate(c))}`).join(' / ')}（1 單位外幣 = 幾 TWD；到「設定」可更新或手動修改）</div>` : ''}${missWarn(miss)}
      ${hs.length + bf.length ? (stale ? `<div class="warn">有 ${stale} 項（股票現價、債券與基金價值）超過 7 天沒更新，最久 ${oldest} 天。記錄資產前請先更新。</div>` : '<div class="mt" style="margin-top:6px">價格與價值都是最近更新的。</div>') : ''}
      ${O || !(hs.length + bf.length) ? '' : '<div class="bar"><button class="btn main" data-a="batch">批次更新價格與價值</button></div>'}${msgHtml(msg ? { t: msg } : null)}</div>`;
    left += donutHtml([['台股', sTW.s, '--c1'], ['美股', sUS.s, '--c3']], '股票分布（以 NT$ 計）', '股票', '台股與美股分布圓環圖');
    let r = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="sec" style="margin:0">股票（${hs.length}）</div><div class="act" style="margin:0">${ordBtn(O, 'stock')}${O ? '' : '<button class="btn sm" data-a="hadd">＋新增股票</button>'}</div></div>`;
    if (P && P.k == 'hform') r += hformHTML(P, hs);
    r += O == 'stock' ? '<div class="mt" style="margin-top:8px">排序模式：顯示全部股票，用 ▲▼ 調整順序，完成後按「完成排序」。</div>' : `<div class="tabs2" style="margin-top:10px">${[['all', '全部', hs.length], ['TW', '台股', hs.filter(h => h.m == 'TW').length], ['US', '美股', hs.filter(h => h.m == 'US').length]].map(([k, n, c]) => `<button data-t="${k}" class="${tab == k ? 'on' : ''}">${n}（${c}）</button>`).join('')}</div>`;
    r += vis.map((h, i) => {
      const c = cur(h.m), v = hv(h), ct = cost(h), p = v - ct, pp = ct ? p / ct * 100 : null, d = dAgo(h.at || todayStr()), t = cvt(v, c);
      return `<div class="hrow"><div class="hl"><b>${esc(h.n)}</b><span class="tag">${esc(h.sym)}</span><span class="tag">${h.m == 'TW' ? '台股' : '美股'}</span><div class="mt">${fmtShares(h.sh)} 股 × ${fmtPrice(h.price)}（${(h.at || '').slice(5)}${d >= 7 ? `，${d} 天前` : ''}）｜成本 ${fmtPrice(h.cost)}</div>${h.note ? `<div class="mt">${esc(h.note)}</div>` : ''}</div>
      <div class="hr"><div>${fmtMinor(v, c)}</div>${c != 'TWD' && t != null ? `<div class="mt">≈ ${tw(t)}</div>` : ''}<div class="mt ${cls(p)}">${sgn(p, c)}${pp == null ? '' : `（${pp >= 0 ? '+' : '−'}${Math.abs(pp).toFixed(1)}%）`}</div>
      <div class="act">${O == 'stock' ? mvb(vis, i, h.id, 'stock') : O ? '' : del == 'h' + h.id ? `<span class="err">刪除？</span><button class="btn sm" data-a="dc">取消</button><button class="btn sm" data-a="hdok" data-id="${h.id}">刪除</button>` : `<button class="btn sm" data-a="hedit" data-id="${h.id}">編輯</button><button class="btn sm" data-a="hdel" data-id="${h.id}">刪除</button>`}</div></div></div>`;
    }).join('') || '<div class="mt" style="padding:12px 0">這個分類沒有股票。</div>';
    const sub = m => { const l = hs.filter(h => h.m == m); if (!l.length) return ''; const c = cur(m), v = l.reduce((a, h) => a + hv(h), 0), p = l.reduce((a, h) => a + hv(h) - cost(h), 0), t = cvt(v, c); return `<div class="up"><span>${m == 'TW' ? '台股' : '美股'}小計</span><span>${fmtMinor(v, c)}${c != 'TWD' && t != null ? `（≈ ${tw(t)}）` : ''}　<span class="${cls(p)}">${sgn(p, c)}</span></span></div>`; };
    if (!O) r += (tab != 'US' ? sub('TW') : '') + (tab != 'TW' ? sub('US') : '');
    r += '</div>';
    const olist = (title, l, key) => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="sec" style="margin:0">${title}（${l.length}）</div><div class="act" style="margin:0">${ordBtn(O, key)}${O ? '' : `<button class="btn sm" data-a="oadd" data-k="${key}">＋新增</button>`}</div></div>${P && P.k == 'oform' && P.kinds == key ? oformHTML(P, oth) : ''}
      ${l.map((o, i) => { const d = dAgo(o.at || todayStr()), info = [o.k != 'other' ? `更新於 ${(o.at || '').slice(5)}${d >= 7 ? `（${d} 天前）` : ''}` : '', o.note ? esc(o.note) : ''].filter(Boolean).join('｜'), t = cvt(o.v, o.c);
        return `<div class="hrow"><div class="hl"><b>${esc(o.n)}</b><span class="tag">${KN[o.k]}</span>${info ? `<div class="mt">${info}</div>` : ''}</div><div class="hr"><div>${fmtMinor(o.v, o.c)}</div>${o.c != 'TWD' && t != null ? `<div class="mt">≈ ${tw(t)}</div>` : ''}
        <div class="act">${O == key ? mvb(l, i, o.id, key) : O ? '' : del == 'o' + o.id ? `<span class="err">刪除？</span><button class="btn sm" data-a="dc">取消</button><button class="btn sm" data-a="odok" data-id="${o.id}">刪除</button>` : `<button class="btn sm" data-a="oedit" data-id="${o.id}">編輯</button><button class="btn sm" data-a="odel" data-id="${o.id}">刪除</button>`}</div></div></div>`; }).join('') || '<div class="mt" style="padding:12px 0">還沒有項目。</div>'}
      <div class="up"><span>小計</span><span>${tw(sumTWD(l.map(o => [o.v, o.c])).s)}</span></div></div>`;
    return `<div class="cols"><div>${left}</div><div>${P && P.k == 'batch' ? batchHTML(hs, bf) : ''}${r}${olist('債券與基金', bf, 'bf')}${olist('其他資產（不動產、車輛等）', ot, 'ot')}</div></div>`;
  }
  function hformHTML(P, hs) {
    const h = P.id ? hs.find(x => x.id == P.id) || {} : {}, d = P.draft || {}, m = d.m || h.m || 'TW';
    const v = (k, f, fmt) => esc(d[k] ?? (h[k] != null ? (fmt ? fmt(h[k]) : h[k]) : (f ?? '')));
    return `<div class="panel"><b>${P.id ? '編輯股票' : '新增股票'}</b><div class="seg" style="display:flex;margin:8px 0">${[['TW', '台股'], ['US', '美股']].map(([k, n]) => `<button data-a="mk" data-m="${k}" class="${m == k ? 'on' : ''}" style="flex:1">${n}</button>`).join('')}</div>
      <div class="g2"><div><label class="flab" for="f-sym">代號</label><input id="f-sym" value="${v('sym')}" placeholder="${m == 'TW' ? '例如 2330、00878' : '例如 AAPL'}" autocapitalize="characters"></div><div><label class="flab" for="f-n">名稱</label><input id="f-n" value="${v('n')}"></div>
      <div><label class="flab" for="f-sh">股數${m == 'US' ? '（可到小數 4 位）' : ''}</label><input id="f-sh" type="number" inputmode="decimal" min="0" step="any" value="${v('sh', '', x => plainDec(x, 4))}"></div><div><label class="flab" for="f-cost">平均成本（${cur(m)}／股）</label><input id="f-cost" type="number" inputmode="decimal" min="0" step="any" value="${v('cost', '', x => plainDec(x, 2))}"></div>
      <div><label class="flab" for="f-price">現價（${cur(m)}）</label><input id="f-price" type="number" inputmode="decimal" min="0" step="any" value="${v('price', '', x => plainDec(x, 2))}" placeholder="沒有就先填成本價"></div></div>
      <label class="flab" for="f-note">備註（選填）</label><input id="f-note" value="${v('note')}"><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="hok">${P.id ? '儲存' : '新增'}</button></div></div>`;
  }
  function oformHTML(P, oth) {
    const o = P.id ? oth.find(x => x.id == P.id) || {} : {}, d = P.draft || {}, k = d.k ?? o.k ?? (P.kinds == 'bf' ? 'bond' : 'other'), v = (key, f) => esc(d[key] ?? o[key] ?? f ?? '');
    return `<div class="panel"><b>${P.id ? '編輯' : '新增'}</b><div class="g2"><div><label class="flab" for="f-k">類型</label><select id="f-k">${(P.kinds == 'bf' ? ['bond', 'fund'] : ['other']).map(x => `<option value="${x}" ${k == x ? 'selected' : ''}>${KN[x]}</option>`).join('')}</select></div><div><label class="flab" for="f-n">名稱</label><input id="f-n" value="${v('n')}"></div>
      <div><label class="flab" for="f-c">幣別</label><select id="f-c">${curOpts(o.c || 'TWD')}</select></div><div><label class="flab" for="f-v">目前價值</label><input id="f-v" type="number" inputmode="decimal" min="0" step="any" value="${o.v != null ? plainDec(o.v, 2) : ''}"></div></div>
      <label class="flab" for="f-note">備註（選填）</label><input id="f-note" value="${v('note')}"><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="ook">${P.id ? '儲存' : '新增'}</button></div></div>`;
  }
  function batchHTML(hs, bf) {
    const row = (ty, x, last, unit, what, tag) => `<div class="brow"><div><b>${esc(x.n)}</b><span class="tag">${esc(tag)}</span><div class="mt">上次 ${fmtDec(last, 2, 2).replace(/\.00$/, '')} ${unit}（${(x.at || '').slice(5)}）<span id="d-${ty}${x.id}"></span></div></div><input class="bi" inputmode="decimal" type="number" min="0" step="any" data-ty="${ty}" data-id="${x.id}" placeholder="${plainDec(last, 2)}" aria-label="${esc(x.n)} ${what}"></div>`;
    return `<div class="panel"><b>批次更新價格與價值</b><div class="mt">只填有變動的；留白就保持上次的數字。按 Enter 跳到下一項。順序和清單相同。</div><label class="flab" for="bd" style="margin-top:8px">更新日期</label><input type="date" id="bd" value="${todayStr()}" style="width:auto">
      ${hs.length ? `<div class="sec" style="margin:12px 0 0">股票現價</div>${hs.map(h => row('h', h, h.price, cur(h.m), '現價', h.sym)).join('')}` : ''}
      ${bf.length ? `<div class="sec" style="margin:12px 0 0">債券與基金的目前價值</div>${bf.map(o => row('o', o, o.v, o.c, '目前價值', KN[o.k])).join('')}` : ''}
      <div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="bok">儲存</button></div></div>`;
  }
  const draft = () => ({ sym: val('f-sym'), n: val('f-n'), sh: val('f-sh'), cost: val('f-cost'), price: val('f-price'), note: val('f-note') });
  async function saveHold(P) {
    const old = P.id ? await DB.get('holdings', P.id) : null, m = P.draft?.m || old?.m || 'TW', sym = val('f-sym').toUpperCase(), n = val('f-n');
    const sh = parseShares(val('f-sh')), cost = parsePrice(val('f-cost')), price = parsePrice(val('f-price'));
    if (!sym) return errTo('請填代號');
    if (m == 'TW' && !/^[0-9A-Z]{4,6}$/.test(sym)) return errTo('台股代號是 4 到 6 碼的數字或字母，例如 2330、00878、00679B');
    if (m == 'US' && !/^[A-Z.\-]{1,6}$/.test(sym)) return errTo('美股代號是 1 到 6 個英文字母，例如 AAPL、BRK.B');
    if (!n) return errTo('請填名稱');
    if (!(sh > 0)) return errTo('股數要大於 0');
    if (m == 'TW' && sh % 10000) return errTo('台股股數請填整數（零股也是整數）');
    if (m == 'US' && !/^\d+(\.\d{1,4})?$/.test(val('f-sh').replace(/,/g, ''))) return errTo('美股股數最多到小數 4 位');
    if (cost == null || cost < 0) return errTo('請填平均成本（不能是負數）');
    if (price == null || !(price > 0)) return errTo('請填現價；沒有的話先填成本價');
    if ((await DB.all('holdings')).some(h => h.m == m && h.sym == sym && h.id != P.id)) return errTo(`已經有 ${sym}。請直接編輯那一筆（平均成本請自行算好合併）。`);
    await DB.put('holdings', { ...(old || {}), id: old ? old.id : DB.uid('h'), m, sym, n, sh, cost, price, note: val('f-note'), at: old && old.price === price ? old.at : todayStr() });
    msg = P.id ? '已儲存。' : '已新增。'; return true;
  }
  async function saveOth(P) {
    const old = P.id ? await DB.get('others', P.id) : null, n = val('f-n'), v = parseMinor(val('f-v'));
    if (!n) return errTo('請填名稱'); if (v == null || v < 0) return errTo('請填目前價值（不能是負數）');
    await DB.put('others', { ...(old || {}), id: old ? old.id : DB.uid('o'), k: val('f-k'), n, c: val('f-c'), v, note: val('f-note'), at: old && old.v === v ? old.at : todayStr() });
    msg = P.id ? '已儲存。' : '已新增。'; return true;
  }
  async function click(e) {
    const t = e.target.closest('[data-t]');
    if (t && !t.dataset.a) { tab = t.dataset.t; return true; }
    const b = e.target.closest('[data-a]'); if (!b) return false;
    const a = b.dataset.a, id = b.dataset.id; msg = null;
    if (a == 'mk') P.draft = { ...draft(), m: b.dataset.m };
    else if (a == 'pc') P = null; else if (a == 'dc') del = null;
    else if (a == 'batch') P = { k: 'batch' }; else if (a == 'hadd') P = { k: 'hform' }; else if (a == 'hedit') P = { k: 'hform', id };
    else if (a == 'hok') { if ((await saveHold(P)) !== true) return 'stay'; P = null; }
    else if (a == 'hdel') del = 'h' + id;
    else if (a == 'hdok') { await DB.del('holdings', id); del = null; msg = '已刪除。'; }
    else if (a == 'oadd') P = { k: 'oform', kinds: b.dataset.k };
    else if (a == 'oedit') P = { k: 'oform', id, kinds: (await DB.get('others', id)).k == 'other' ? 'ot' : 'bf' };
    else if (a == 'ook') { if ((await saveOth(P)) !== true) return 'stay'; P = null; }
    else if (a == 'odel') del = 'o' + id;
    else if (a == 'odok') { await DB.del('others', id); del = null; msg = '已刪除。'; }
    else if (a == 'bok') {
      const d = val('bd'); if (!d) return errTo('請選擇更新日期'); if (d > todayStr()) return errTo('更新日期不能是未來');
      const ch = [];
      for (const i of $$('.bi')) {
        if (i.value === '') continue;
        const h = i.dataset.ty == 'h', v = h ? parsePrice(i.value) : parseMinor(i.value);
        if (v == null || (h ? !(v > 0) : v < 0)) return errTo(h ? '現價要大於 0，請檢查輸入' : '價值不能是負數，請檢查輸入');
        ch.push([i.dataset.ty, i.dataset.id, v]);
      }
      if (!ch.length) return errTo('還沒有輸入任何新數字');
      for (const [ty, id2, v] of ch) { const store = ty == 'h' ? 'holdings' : 'others', row = await DB.get(store, id2); await DB.put(store, { ...row, [ty == 'h' ? 'price' : 'v']: v, at: d }); }
      P = null; msg = `已更新 ${ch.length} 項。`;
    }
    else if (a == 'ord') { order = b.dataset.o; P = null; del = null; }
    else if (a == 'ordok') order = null;
    else if (a == 'mv') {
      const key = b.dataset.o, ok = key == 'stock' ? await moveRow('holdings', () => true, id, +b.dataset.d) : await moveRow('others', key == 'bf' ? o => o.k != 'other' : o => o.k == 'other', id, +b.dataset.d);
      if (ok) fx = { id, d: +b.dataset.d }; else return 'stay';
    }
    else return false;
    return true;
  }
  async function input(e) {
    const t = e.target; if (!t.classList.contains('bi')) return;
    const ty = t.dataset.ty, x = await DB.get(ty == 'h' ? 'holdings' : 'others', t.dataset.id), el = $('#d-' + ty + t.dataset.id); if (!x || !el) return;
    const v = ty == 'h' ? parsePrice(t.value) : parseMinor(t.value); el.innerHTML = t.value === '' || v == null ? '' : chgText(v, ty == 'h' ? x.price : x.v);
  }
  const keydown = e => { if (e.key != 'Enter' || !e.target.classList.contains('bi')) return; e.preventDefault(); const l = $$('.bi'), i = l.indexOf(e.target); (l[i + 1] || $('[data-a=bok]')).focus(); };
  const after = () => { if (P && P.k == 'batch') $$('.bi')[0]?.focus(); if (fx) { focusMoved(fx); fx = null; } };
  return { render, click, input, keydown, after, reset };
})();
