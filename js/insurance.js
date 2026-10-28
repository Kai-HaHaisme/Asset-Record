/* 保險頁：保單清單、年繳換算、近期繳費、保障到期、標記已繳費（依繳費頻率順延，可手動改日期）、調整順序。
   保險不計入總資產。繳費頻率以「每幾個月繳一次」（mo）儲存：1 月繳、3 季繳、6 半年繳、12 年繳、24 兩年繳，也可自訂。 */
const InsurancePage = (() => {
  let P = null, del = null, msg = null, order = null, tab = 'all', fx = null;
  const KINDS = ['車險', '醫療險', '壽險', '意外險', '其他'], KC = { '車險': '--c1', '醫療險': '--c2', '壽險': '--c3', '意外險': '--c4', '其他': '--c5' };
  const FREQ = [[1, '月繳'], [3, '季繳'], [6, '半年繳'], [12, '年繳'], [24, '兩年繳']];
  const fn = mo => (FREQ.find(x => x[0] == mo) || [0, `每 ${mo} 個月繳`])[1];
  const annOwn = a => mulDiv(a.prem, 12, a.mo);                           // 換算成一年（原幣別最小單位）
  const dueText = d => d < 0 ? `已逾期 ${-d} 天` : d == 0 ? '今天' : `${d} 天後`;
  // 日期加 N 個月；ad 是原本設定的「幾號」，遇到小月會縮到月底，但下一次會回到原本的號數
  const addMonths = (d, mo, ad) => { const [y, m] = d.split('-').map(Number), t = (m - 1) + mo, ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12, dim = new Date(ny, nm + 1, 0).getDate(); return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(ad || +d.slice(8), dim)).padStart(2, '0')}`; };
  const reset = () => { P = null; del = null; msg = null; order = null; tab = 'all'; fx = null; };

  async function render() {
    const L = await DB.all('insurance'), O = order, vis = O ? L : L.filter(a => tab == 'all' || a.k == tab), tw = m => fmtMinor(m, 'TWD');
    const annT = a => cvt(annOwn(a), a.c), sum = l => sumTWD(l.map(a => [annOwn(a), a.c]));
    const S0 = sum(L), byK = KINDS.map(k => [k, sum(L.filter(a => a.k == k)).s]);
    const soon = L.filter(a => days(a.due) <= 30).sort((a, b) => a.due.localeCompare(b.due)), ending = L.filter(a => a.end && days(a.end) <= 90).sort((a, b) => a.end.localeCompare(b.end));
    let left = `<div class="card"><div class="sec">年繳保費合計（各種繳費頻率都換算成一年）</div><div class="big">${tw(S0.s)}</div>
      <div class="sum3"><span>平均每月</span><span>${tw(Math.round(S0.s / 12))}</span><span>保單數</span><span>${L.length} 張</span></div>${missWarn(S0.miss)}
      <div class="mt" style="margin-top:8px">保險不計入總資產。${RATES.FOREIGN.some(c => L.some(a => a.c == c)) ? RATES.FOREIGN.map(c => `${c} ${rfmt(RATES.rate(c))}`).join('、') + '（1 單位外幣 = 幾 TWD）' : ''}</div>${msgHtml(msg ? { t: msg } : null)}</div>`;
    left += donutHtml(byK.map(([k, v]) => [k, v, KC[k]]), '年繳保費分布（依險種，以 NT$ 計）', '年繳', '年繳保費依險種分布圓環圖');
    left += `<div class="card"><div class="sec">近期要繳的保費（30 天內與已逾期）</div>${soon.map(a => `<div class="up"><span>${esc(a.co)} ${esc(a.n)}<span class="tag">${fn(a.mo)}</span></span><span class="d s">${a.due}（${dueText(days(a.due))}）｜${fmtMinor(a.prem, a.c)} <button class="btn sm" data-a="paid" data-id="${a.id}">已繳費</button></span></div>`).join('') || '<div class="mt">30 天內沒有要繳的保費。</div>'}${soon.some(a => days(a.due) < 0) ? '<div class="warn">有保費已過繳費日。請確認是否已繳，並到保單更新「下次繳費日」。</div>' : ''}</div>`;
    left += `<div class="card"><div class="sec">保障到期（90 天內與已到期）</div>${ending.map(a => `<div class="up"><span>${esc(a.co)} ${esc(a.n)}<span class="tag">${a.k}</span></span><span class="d${days(a.end) <= 30 ? ' s' : ''}">${a.end}（${days(a.end) < 0 ? '已到期 ' + (-days(a.end)) + ' 天' : dueText(days(a.end))}）</span></div>`).join('') || '<div class="mt">90 天內沒有保障到期。</div>'}</div>`;
    let r = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="sec" style="margin:0">保單（${L.length}）</div><div class="act" style="margin:0">${O ? '<button class="btn main sm" data-a="ordok">完成排序</button>' : '<button class="btn sm" data-a="ord" data-o="ins">調整順序</button><button class="btn sm" data-a="add">＋新增保單</button>'}</div></div>${P && P.k == 'form' ? formHTML(P, L) : ''}${P && P.k == 'paid' ? paidHTML(P, L) : ''}`;
    r += O ? '<div class="mt" style="margin-top:8px">排序模式：顯示全部保單，用 ▲▼ 調整順序，完成後按「完成排序」。</div>' : `<div class="tabs2" style="margin-top:10px">${[['all', '全部', L.length], ...KINDS.map(k => [k, k, L.filter(a => a.k == k).length])].map(([k, n, c]) => `<button data-t="${k}" class="${tab == k ? 'on' : ''}">${n}（${c}）</button>`).join('')}</div>`;
    r += vis.map((a, i) => {
      const d = days(a.due), e = a.end ? days(a.end) : null, t = cvt(a.prem, a.c);
      return `<div class="hrow"><div class="hl"><b>${esc(a.co)}</b><span class="tag">${a.k}</span>${a.c != 'TWD' ? `<span class="tag">${a.c}</span>` : ''}<div class="mt">${a.n ? esc(a.n) + '｜' : ''}${a.who ? '被保險人 ' + esc(a.who) + '｜' : ''}換算一年約 ${fmtMinor(annOwn(a), a.c)}</div>
      <div class="${d <= 30 ? 'err' : 'mt'}" style="margin-top:2px">下次繳費日 ${a.due}（${dueText(d)}）</div><div class="${e != null && e <= 30 ? 'err' : 'mt'}">保障到期日 ${a.end ? `${a.end}（${e < 0 ? '已到期' : dueText(e)}）` : '未填（無期限或長期）'}</div>${a.note ? `<div class="mt">${esc(a.note)}</div>` : ''}</div>
      <div class="hr"><div>${fmtMinor(a.prem, a.c)}</div><div class="mt">${fn(a.mo)}</div>${a.c != 'TWD' && t != null ? `<div class="mt">≈ ${tw(t)}</div>` : ''}
      <div class="act">${O ? mvb(vis, i, a.id, 'ins') : del == a.id ? `<span class="err">刪除？</span><button class="btn sm" data-a="dc">取消</button><button class="btn sm" data-a="dok" data-id="${a.id}">刪除</button>` : `<button class="btn sm" data-a="paid" data-id="${a.id}">標記已繳費</button><button class="btn sm" data-a="edit" data-id="${a.id}">編輯</button><button class="btn sm" data-a="del" data-id="${a.id}">刪除</button>`}</div></div></div>`;
    }).join('') || '<div class="mt" style="padding:12px 0">這個分類沒有保單。</div>';
    r += '</div>';
    return `<div class="cols"><div>${left}</div><div>${r}</div></div>`;
  }
  function formHTML(P, L) {
    const a = P.id ? L.find(x => x.id == P.id) || {} : {}, d = P.draft || {}, v = (k, f) => esc(d[k] ?? a[k] ?? f ?? ''), std = a.mo && FREQ.some(x => x[0] == a.mo);
    const sel = String(d.f ?? (a.mo ? (std ? a.mo : 'C') : '12')), mo = d.mo ?? (a.mo && !std ? a.mo : '');
    return `<div class="panel"><b>${P.id ? '編輯保單' : '新增保單'}</b><div class="g2"><div><label class="flab" for="f-k">險種</label><select id="f-k">${KINDS.map(x => `<option ${v('k', '車險') == x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div><label class="flab" for="f-co">保險公司</label><input id="f-co" value="${v('co')}"></div>
      <div><label class="flab" for="f-n">保單名稱（選填）</label><input id="f-n" value="${v('n')}"></div><div><label class="flab" for="f-who">被保險人（選填）</label><input id="f-who" value="${v('who')}"></div>
      <div><label class="flab" for="f-f">繳費頻率</label><select id="f-f">${FREQ.map(([k, n]) => `<option value="${k}" ${sel == k ? 'selected' : ''}>${n}</option>`).join('')}<option value="C" ${sel == 'C' ? 'selected' : ''}>自訂（每幾個月繳一次）</option></select></div>
      <div>${sel == 'C' ? `<label class="flab" for="f-mo">每幾個月繳一次</label><input id="f-mo" type="number" inputmode="numeric" min="1" max="120" step="1" value="${esc(mo)}">` : ''}</div>
      <div><label class="flab" for="f-c">幣別</label><select id="f-c">${curOpts(d.c ?? a.c ?? 'TWD')}</select></div><div><label class="flab" for="f-prem">每次保費</label><input id="f-prem" type="number" inputmode="decimal" min="0" step="any" value="${d.prem ?? (a.prem != null ? plainDec(a.prem, 2) : '')}"></div>
      <div><label class="flab" for="f-due">下次繳費日</label><input id="f-due" type="date" value="${v('due')}"></div><div><label class="flab" for="f-end">保障到期日（選填）</label><input id="f-end" type="date" value="${v('end')}"></div></div>
      <label class="flab" for="f-note">備註（選填，例如保障內容、車牌）</label><input id="f-note" value="${v('note')}"><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="ok">${P.id ? '儲存' : '新增'}</button></div></div>`;
  }
  function paidHTML(P, L) {
    const a = L.find(x => x.id == P.id); if (!a) return '';
    const nd = addMonths(a.due, a.mo, a.ad), ne = a.end ? (a.end == a.due ? nd : a.end) : '';
    return `<div class="panel" id="paidp"><b>標記已繳費：${esc(a.co)} ${esc(a.n)}</b><div class="mt">這次繳費日是 ${a.due}，繳費頻率是${fn(a.mo)}。下次繳費日已依頻率算好，可以直接改日期（頻率要改請到「編輯」）。</div>
      <label class="flab" for="pd-due">下次繳費日</label><input id="pd-due" type="date" value="${nd}" data-calc="${nd}" style="width:auto">
      ${a.end ? `<label class="flab" for="pd-end">保障到期日（續保後）</label><input id="pd-end" type="date" value="${ne}" style="width:auto"><div class="mt">原本保障到期日${a.end == a.due ? '和繳費日同一天（例如強制險、車險），所以預設一起順延' : '和繳費日不同天，所以預設維持不變'}，可以手動修改。</div>` : ''}
      <div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="pok">確認已繳費</button></div></div>`;
  }
  async function save(P) {
    const old = P.id ? await DB.get('insurance', P.id) : null, co = val('f-co'), prem = parseMinor(val('f-prem')), due = val('f-due'), end = val('f-end'), fv = val('f-f'), mo = fv == 'C' ? Number(val('f-mo')) : Number(fv);
    if (!co) return errTo('請填保險公司');
    if (prem == null || !(prem > 0)) return errTo('請填每次保費（要大於 0）');
    if (!due) return errTo('請選擇下次繳費日');
    if (!Number.isInteger(mo) || mo < 1 || mo > 120) return errTo('自訂頻率請填 1 到 120 之間的整數（每幾個月）');
    await DB.put('insurance', { ...(old || {}), id: old ? old.id : DB.uid('i'), k: val('f-k'), co, n: val('f-n'), who: val('f-who'), c: val('f-c'), prem, mo, due, end, note: val('f-note'), ad: +due.slice(8) });
    msg = P.id ? '已儲存。' : '已新增。'; return true;
  }
  async function click(e) {
    const t = e.target.closest('[data-t]');
    if (t && !t.dataset.a) { tab = t.dataset.t; return true; }
    const b = e.target.closest('[data-a]'); if (!b) return false;
    const a = b.dataset.a, id = b.dataset.id; msg = null;
    if (a == 'add') P = { k: 'form' }; else if (a == 'edit') P = { k: 'form', id }; else if (a == 'pc') P = null;
    else if (a == 'ok') { if ((await save(P)) !== true) return 'stay'; P = null; }
    else if (a == 'del') del = id; else if (a == 'dc') del = null;
    else if (a == 'dok') { await DB.del('insurance', id); del = null; msg = '已刪除。'; }
    else if (a == 'paid') { P = { k: 'paid', id }; del = null; }
    else if (a == 'pok') {
      const x = await DB.get('insurance', P.id), nd = $('#pd-due'), ne = $('#pd-end');
      if (!nd.value) return errTo('請選擇下次繳費日'); if (nd.value <= x.due) return errTo(`下次繳費日要晚於這次的繳費日（${x.due}）`);
      if (ne && !ne.value) return errTo('請填保障到期日；要清除請到「編輯」');
      await DB.put('insurance', { ...x, due: nd.value, end: ne ? ne.value : x.end, ad: nd.value !== nd.dataset.calc ? +nd.value.slice(8) : x.ad });
      msg = `已標記繳費，下次繳費日改為 ${nd.value}。`; P = null;
    }
    else if (a == 'ord') { order = 1; P = null; del = null; } else if (a == 'ordok') order = null;
    else if (a == 'mv') { if (await moveRow('insurance', () => true, id, +b.dataset.d)) fx = { id, d: +b.dataset.d }; else return 'stay'; }
    else return false;
    return true;
  }
  const change = e => { if (e.target.id != 'f-f' || !P || P.k != 'form') return false; P.draft = draftOf(); return true; };
  const after = () => { if (P && P.k == 'paid') { $('#paidp')?.scrollIntoView?.({ block: 'center' }); $('#pd-due')?.focus(); } if (fx) { focusMoved(fx); fx = null; } };
  return { render, click, change, after, reset };
})();
