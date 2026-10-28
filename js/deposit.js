/* 存款頁：活存與定存、外幣、批次更新活存餘額、預估到期利息、調整順序。
   金額一律用整數最小單位儲存（見 money.js）；年利率存成「百分比 × 1000」。 */
const DepositPage = (() => {
  let P = null, del = null, msg = null, order = null, fx = null;
  const TN = { D: '活存', T: '定存' };
  const term = a => Math.round((new Date(a.mat + 'T00:00:00') - new Date(a.start + 'T00:00:00')) / DAY);
  const intr = a => mulDiv(mulDiv(a.v, a.rate, 100000), term(a), 365);     // 本金 × 年利率 × 存期天數 ÷ 365
  const matText = a => { const d = days(a.mat); return d < 0 ? `已過到期日 ${-d} 天，請確認是否續存或轉入活存` : d == 0 ? '今天到期' : `${d} 天後到期`; };
  const reset = () => { P = null; del = null; msg = null; order = null; fx = null; };

  async function render() {
    const all = await DB.all('accounts'), D = all.filter(a => a.t == 'D'), T = all.filter(a => a.t == 'T'), O = order;
    const sum = l => sumTWD(l.map(a => [a.v, a.c])), sD = sum(D), sT = sum(T), miss = sD.miss + sT.miss;
    const cs = CURS.filter(c => all.some(a => a.c == c));
    const stale = D.filter(a => dAgo(a.at || todayStr()) >= 7), oldest = Math.max(0, ...stale.map(a => dAgo(a.at)));
    const matured = T.filter(a => days(a.mat) < 0), next = T.filter(a => days(a.mat) >= 0).sort((a, b) => a.mat.localeCompare(b.mat))[0];
    const interest = sumTWD(T.filter(a => days(a.mat) >= 0).map(a => [intr(a), a.c]));
    const tw = m => fmtMinor(m, 'TWD');
    let left = `<div class="card"><div class="sec">存款總額</div><div class="big">${tw(sD.s + sT.s)}</div>
      <div class="sum3"><span>活存</span><span>${tw(sD.s)}</span><span>定存</span><span>${tw(sT.s)}</span></div>
      <div class="sum3" style="margin-top:4px"><span>未到期定存的預估到期利息</span><span>${tw(interest.s)}</span></div>
      ${all.length ? `<div class="sec" style="margin:12px 0 0">依幣別</div><div class="sum3">${cs.map(c => { const o = all.filter(a => a.c == c).reduce((s, a) => s + a.v, 0), t = cvt(o, c); return `<span>${c}</span><span>${fmtMinor(o, c)}${c != 'TWD' && t != null ? `（≈ ${tw(t)}）` : ''}</span>`; }).join('')}</div>` : ''}
      ${missWarn(miss)}
      ${next ? `<div class="mt" style="margin-top:8px">最近到期的定存：${esc(next.bank)}${next.n ? ' ' + esc(next.n) : ''}，${days(next.mat)} 天後（${next.mat}）</div>` : ''}
      ${matured.length ? `<div class="warn">有 ${matured.length} 筆定存已過到期日，請確認是否續存或轉入活存，並更新資料。</div>` : ''}
      ${D.length ? (stale.length ? `<div class="warn">有 ${stale.length} 筆活存餘額超過 7 天沒更新（最久 ${oldest} 天）。記錄資產前請先更新。</div>` : '<div class="mt" style="margin-top:6px">活存餘額都是最近更新的。</div>') : ''}
      ${O || !D.length ? '' : '<div class="bar"><button class="btn main" data-a="batch">批次更新活存餘額</button></div>'}${msgHtml(msg ? { t: msg } : null)}</div>`;
    left += donutHtml([['活存', sD.s, '--c1'], ['定存', sT.s, '--c3']], '活存與定存分布（以 NT$ 計）', '存款', '活存與定存分布圓環圖');
    const acts = (a, i, l, k) => O == k ? mvb(l, i, a.id, k) : O ? '' : del == a.id ? `<span class="err">刪除？</span><button class="btn sm" data-a="dc">取消</button><button class="btn sm" data-a="dok" data-id="${a.id}">刪除</button>` : `<button class="btn sm" data-a="edit" data-id="${a.id}">編輯</button><button class="btn sm" data-a="del" data-id="${a.id}">刪除</button>`;
    const conv = a => { const t = cvt(a.v, a.c); return a.c != 'TWD' && t != null ? `<div class="mt">≈ ${tw(t)}</div>` : ''; };
    const rowD = (a, i, l) => `<div class="hrow"><div class="hl"><b>${esc(a.bank)}</b>${a.n ? `<span class="tag">${esc(a.n)}</span>` : ''}${a.c != 'TWD' ? `<span class="tag">${a.c}</span>` : ''}<div class="mt">更新於 ${(a.at || '').slice(5)}${dAgo(a.at || todayStr()) >= 7 ? `（${dAgo(a.at)} 天前）` : ''}${a.note ? '｜' + esc(a.note) : ''}</div></div><div class="hr"><div>${fmtMinor(a.v, a.c)}</div>${conv(a)}<div class="act">${acts(a, i, l, 'D')}</div></div></div>`;
    const rowT = (a, i, l) => { const d = days(a.mat), it = intr(a), itw = cvt(it, a.c); return `<div class="hrow"><div class="hl"><b>${esc(a.bank)}</b>${a.n ? `<span class="tag">${esc(a.n)}</span>` : ''}${a.c != 'TWD' ? `<span class="tag">${a.c}</span>` : ''}<div class="mt">年利率 ${fmtRate(a.rate)}%｜${a.start} → ${a.mat}${a.note ? '｜' + esc(a.note) : ''}</div><div class="${d <= 30 ? 'err' : 'mt'}" style="margin-top:2px">${matText(a)}</div><div class="mt">預估到期利息 ${fmtMinor(it, a.c)}${a.c != 'TWD' && itw != null ? `（≈ ${tw(itw)}）` : ''}</div></div><div class="hr"><div>${fmtMinor(a.v, a.c)}</div>${conv(a)}<div class="act">${acts(a, i, l, 'T')}</div></div></div>`; };
    const card = (k, l, row) => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="sec" style="margin:0">${TN[k]}（${l.length}）</div><div class="act" style="margin:0">${ordBtn(O, k)}${O ? '' : `<button class="btn sm" data-a="add" data-t="${k}">＋新增${TN[k]}</button>`}</div></div>${k == 'T' ? '<div class="mt" style="margin-top:6px">預估利息 = 本金 × 年利率 × 存期天數 ÷ 365，是簡單估算，實際以銀行計算為準。</div>' : ''}${P && P.k == 'form' && P.t == k ? formHTML(P, all) : ''}${O == k ? '<div class="mt" style="margin-top:8px">排序模式：用 ▲▼ 調整順序，完成後按「完成排序」。</div>' : ''}${l.map((a, i) => row(a, i, l)).join('') || '<div class="mt" style="padding:12px 0">還沒有項目。</div>'}<div class="up"><span>小計</span><span>${tw(sum(l).s)}</span></div></div>`;
    return `<div class="cols"><div>${left}</div><div>${P && P.k == 'batch' ? batchHTML(D) : ''}${card('D', D, rowD)}${card('T', T, rowT)}</div></div>`;
  }
  function formHTML(P, all) {
    const a = P.id ? all.find(x => x.id == P.id) || {} : {}, t = P.t, v = (k, f) => esc(a[k] ?? f ?? '');
    return `<div class="panel"><b>${P.id ? '編輯' : '新增'}${TN[t]}</b><div class="g2"><div><label class="flab" for="f-bank">銀行名稱</label><input id="f-bank" value="${v('bank')}"></div><div><label class="flab" for="f-n">帳戶名稱（選填）</label><input id="f-n" value="${v('n')}" placeholder="例如 薪轉、美元定存"></div>
      <div><label class="flab" for="f-c">幣別</label><select id="f-c">${curOpts(a.c || 'TWD')}</select></div><div><label class="flab" for="f-v">${t == 'T' ? '本金' : '目前餘額'}</label><input id="f-v" type="number" inputmode="decimal" min="0" step="any" value="${a.v != null ? plainDec(a.v, 2) : ''}"></div>
      ${t == 'T' ? `<div><label class="flab" for="f-rate">年利率（%）</label><input id="f-rate" type="number" inputmode="decimal" min="0" max="20" step="any" value="${a.rate != null ? plainDec(a.rate, 3) : ''}"></div><div></div><div><label class="flab" for="f-start">起日</label><input id="f-start" type="date" value="${v('start')}"></div><div><label class="flab" for="f-mat">到期日</label><input id="f-mat" type="date" value="${v('mat')}"></div>` : ''}</div>
      <label class="flab" for="f-note">備註（選填）</label><input id="f-note" value="${v('note')}"><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="ok">${P.id ? '儲存' : '新增'}</button></div></div>`;
  }
  const batchHTML = D => `<div class="panel"><b>批次更新活存餘額</b><div class="mt">只填有變動的；留白就保持上次的餘額。按 Enter 跳到下一筆。順序和清單相同。</div><label class="flab" for="bd" style="margin-top:8px">更新日期</label><input type="date" id="bd" value="${todayStr()}" style="width:auto">
    ${D.map(a => `<div class="brow"><div><b>${esc(a.bank)}</b>${a.n ? `<span class="tag">${esc(a.n)}</span>` : ''}<div class="mt">上次 ${fmtDec(a.v, 2, 2).replace(/\.00$/, '')} ${a.c}（${(a.at || '').slice(5)}）<span id="d-${a.id}"></span></div></div><input class="bi" inputmode="decimal" type="number" min="0" step="any" data-id="${a.id}" placeholder="${plainDec(a.v, 2)}" aria-label="${esc(a.bank)} 目前餘額"></div>`).join('')}
    <div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="bok">儲存餘額</button></div></div>`;

  async function save(P) {
    const t = P.t, bank = val('f-bank'), v = parseMinor(val('f-v')), old = P.id ? await DB.get('accounts', P.id) : null;
    if (!bank) return errTo('請填銀行名稱');
    if (v == null || v < 0) return errTo(t == 'T' ? '請填本金（不能是負數）' : '請填餘額（不能是負數）');
    if (t == 'T' && !(v > 0)) return errTo('本金要大於 0');
    const o = { ...(old || {}), id: old ? old.id : DB.uid('a'), t, bank, n: val('f-n'), c: val('f-c'), v, note: val('f-note'), at: old && old.v === v ? old.at : todayStr() };
    if (t == 'T') {
      const r = parseRate(val('f-rate')), s = val('f-start'), m = val('f-mat');
      if (r == null || r < 0 || r > 20000) return errTo('請填年利率（0 到 20 之間）');
      if (!s) return errTo('請選擇起日'); if (!m) return errTo('請選擇到期日'); if (m <= s) return errTo('到期日要晚於起日');
      Object.assign(o, { rate: r, start: s, mat: m });
    }
    await DB.put('accounts', o); msg = P.id ? '已儲存。' : '已新增。'; return true;
  }
  async function click(e) {
    const b = e.target.closest('[data-a]'); if (!b) return false;
    const a = b.dataset.a, id = b.dataset.id; msg = null;
    if (a == 'add') P = { k: 'form', t: b.dataset.t };
    else if (a == 'edit') P = { k: 'form', id, t: (await DB.get('accounts', id)).t };
    else if (a == 'pc') P = null;
    else if (a == 'ok') { if ((await save(P)) !== true) return 'stay'; P = null; }
    else if (a == 'del') del = id; else if (a == 'dc') del = null;
    else if (a == 'dok') { await DB.del('accounts', id); del = null; msg = '已刪除。'; }
    else if (a == 'batch') P = { k: 'batch' };
    else if (a == 'bok') {
      const d = val('bd'); if (!d) return errTo('請選擇更新日期'); if (d > todayStr()) return errTo('更新日期不能是未來');
      const ch = [];
      for (const i of $$('.bi')) { if (i.value === '') continue; const v = parseMinor(i.value); if (v == null || v < 0) return errTo('餘額不能是負數，請檢查輸入'); ch.push([i.dataset.id, v]); }
      if (!ch.length) return errTo('還沒有輸入任何新餘額');
      for (const [id2, v] of ch) await DB.put('accounts', { ...(await DB.get('accounts', id2)), v, at: d });
      P = null; msg = `已更新 ${ch.length} 筆活存餘額。`;
    }
    else if (a == 'ord') { order = b.dataset.o; P = null; del = null; }
    else if (a == 'ordok') order = null;
    else if (a == 'mv') { const key = b.dataset.o; if (await moveRow('accounts', r => r.t == key, id, +b.dataset.d)) fx = { id, d: +b.dataset.d }; else return 'stay'; }
    else return false;
    return true;
  }
  async function input(e) {
    const t = e.target; if (!t.classList.contains('bi')) return;
    const x = await DB.get('accounts', t.dataset.id), el = $('#d-' + t.dataset.id); if (!x || !el) return;
    const v = parseMinor(t.value); el.innerHTML = t.value === '' || v == null ? '' : chgText(v, x.v);
  }
  const keydown = e => { if (e.key != 'Enter' || !e.target.classList.contains('bi')) return; e.preventDefault(); const l = $$('.bi'), i = l.indexOf(e.target); (l[i + 1] || $('[data-a=bok]')).focus(); };
  const after = () => { if (P && P.k == 'batch') $$('.bi')[0]?.focus(); if (fx) { focusMoved(fx); fx = null; } };
  return { render, click, input, keydown, after, reset };
})();
