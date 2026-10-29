/* 保險頁與保單卡。
   - 清單：年繳換算、近期要繳（未繳）、保障到期、狀態標籤（本期已繳／未繳／分期中／已繳清／已終止）、標記已繳費、調整順序。
   - 保單卡（點「保單卡」就地展開）：累計已繳、保障內容與保額、繳費紀錄（可補登、編輯、刪除）、終止／恢復有效。
   - 繳費頻率以「每幾個月繳一次」（mo）儲存；分期：總期數 terms ＋ 開始用本 App 之前已繳的期數 pt，已繳期數 = pt + 繳費紀錄筆數。
   - 保險不計入總資產。終止的保單保留在「已終止」頁籤，不計入年繳合計與提醒。 */
const InsurancePage = (() => {
  let P = null, del = null, msg = null, order = null, tab = 'all', fx = null, open = null, sub = null, allHist = false;
  const KINDS = ['車險', '醫療險', '壽險', '意外險', '其他'], KC = { '車險': '--c1', '醫療險': '--c2', '壽險': '--c3', '意外險': '--c4', '其他': '--c5' };
  const FREQ = [[1, '月繳'], [3, '季繳'], [6, '半年繳'], [12, '年繳'], [24, '兩年繳']];
  const fn = mo => (FREQ.find(x => x[0] == mo) || [0, `每 ${mo} 個月繳`])[1];
  const annOwn = a => mulDiv(a.prem, 12, a.mo);                           // 換算成一年（原幣別最小單位）
  const dueText = d => d < 0 ? `已逾期 ${-d} 天` : d == 0 ? '今天' : `${d} 天後`;
  const addMonths = (d, mo, ad) => { const [y, m] = d.split('-').map(Number), t = (m - 1) + mo, ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12, dim = new Date(ny, nm + 1, 0).getDate(); return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(ad || +d.slice(8), dim)).padStart(2, '0')}`; };
  /* 狀態 */
  const paidCount = a => (a.pt || 0) + (a.hist || []).length;
  const complete = a => a.terms > 0 && paidCount(a) >= a.terms;
  const lastFor = a => (a.hist || []).reduce((m, h) => h.due && h.due > m ? h.due : m, '');
  // 每次繳費涵蓋「對應繳費日」起算一個繳費週期；週期還沒結束就是「本期已繳」
  const paidThrough = a => { const l = lastFor(a); return l ? addMonths(l, a.mo, +l.slice(8)) : ''; };
  function payState(a) {
    if (a.status == 'ended') return 'ended';
    if (complete(a)) return 'complete';
    const pt = paidThrough(a);
    if (pt && days(pt) > 0) return 'paid';
    return days(a.due) <= 30 ? 'unpaid' : 'none';
  }
  const tagsHtml = a => {
    const s = payState(a), t = [];
    if (s == 'unpaid') t.push('<span class="tag tg-due">未繳</span>'); else if (s == 'paid') t.push('<span class="tag tg-ok">本期已繳</span>');
    else if (s == 'complete') t.push('<span class="tag tg-ok">已繳清</span>'); else if (s == 'ended') t.push('<span class="tag">已終止</span>');
    if (a.terms > 0 && s != 'complete' && s != 'ended') t.push(`<span class="tag">分期中 ${paidCount(a)}/${a.terms}</span>`);
    return t.join('');
  };
  const reset = () => { P = null; del = null; msg = null; order = null; tab = 'all'; fx = null; open = null; sub = null; allHist = false; };

  async function render() {
    const L = await DB.all('insurance'), O = order, tw = m => fmtMinor(m, 'TWD');
    const live = L.filter(a => a.status != 'ended'), ended = L.filter(a => a.status == 'ended'), run = live.filter(a => !complete(a));
    const vis = O ? live : tab == 'ended' ? ended : live.filter(a => tab == 'all' || a.k == tab);
    const sum = l => sumTWD(l.map(a => [annOwn(a), a.c])), S0 = sum(run), byK = KINDS.map(k => [k, sum(run.filter(a => a.k == k)).s]);
    const soon = run.filter(a => payState(a) == 'unpaid').sort((a, b) => a.due.localeCompare(b.due)), ending = live.filter(a => a.end && days(a.end) <= 90).sort((a, b) => a.end.localeCompare(b.end));
    let left = `<div class="card"><div class="sec">年繳保費合計（各種繳費頻率都換算成一年）</div><div class="big">${tw(S0.s)}</div>
      <div class="sum3"><span>平均每月</span><span>${tw(Math.round(S0.s / 12))}</span><span>保單數</span><span>${live.length} 張</span></div>${missWarn(S0.miss)}
      <div class="mt" style="margin-top:8px">保險不計入總資產；已終止與已繳清的保單不計入合計。${RATES.FOREIGN.some(c => run.some(a => a.c == c)) ? RATES.FOREIGN.map(c => `${c} ${rfmt(RATES.rate(c))}`).join('、') + '（1 單位外幣 = 幾 TWD）' : ''}</div>${msgHtml(msg ? { t: msg } : null)}</div>`;
    left += donutHtml(byK.map(([k, v]) => [k, v, KC[k]]), '年繳保費分布（依險種，以 NT$ 計）', '年繳', '年繳保費依險種分布圓環圖');
    left += `<div class="card"><div class="sec">近期要繳的保費（未繳：30 天內與已逾期）</div>${soon.map(a => `<div class="up"><span>${esc(a.co)} ${esc(a.n)}<span class="tag">${fn(a.mo)}</span></span><span class="d s">${a.due}（${dueText(days(a.due))}）｜${fmtMinor(a.prem, a.c)} <button class="btn sm" data-a="paid" data-id="${a.id}">已繳費</button></span></div>`).join('') || '<div class="mt">30 天內沒有要繳的保費。</div>'}${soon.some(a => days(a.due) < 0) ? '<div class="warn">有保費已過繳費日。請確認是否已繳，並按「已繳費」記錄。</div>' : ''}</div>`;
    left += `<div class="card"><div class="sec">保障到期（90 天內與已到期）</div>${ending.map(a => `<div class="up"><span>${esc(a.co)} ${esc(a.n)}<span class="tag">${a.k}</span></span><span class="d${days(a.end) <= 30 ? ' s' : ''}">${a.end}（${days(a.end) < 0 ? '已到期 ' + (-days(a.end)) + ' 天' : dueText(days(a.end))}）</span></div>`).join('') || '<div class="mt">90 天內沒有保障到期。</div>'}</div>`;
    let r = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="sec" style="margin:0">保單（${live.length}）</div><div class="act" style="margin:0">${O ? '<button class="btn main sm" data-a="ordok">完成排序</button>' : '<button class="btn sm" data-a="ord" data-o="ins">調整順序</button><button class="btn sm" data-a="add">＋新增保單</button>'}</div></div>${P && P.k == 'form' ? formHTML(P, L) : ''}${P && P.k == 'paid' ? paidHTML(P, L) : ''}`;
    r += O ? '<div class="mt" style="margin-top:8px">排序模式：顯示全部有效保單，用 ▲▼ 調整順序，完成後按「完成排序」。</div>' : `<div class="tabs2" style="margin-top:10px">${[['all', '全部', live.length], ...KINDS.map(k => [k, k, live.filter(a => a.k == k).length]), ['ended', '已終止', ended.length]].map(([k, n, c]) => `<button data-t="${k}" class="${tab == k ? 'on' : ''}">${n}（${c}）</button>`).join('')}</div>`;
    r += vis.map((a, i) => rowHtml(a, i, vis, O)).join('') || `<div class="mt" style="padding:12px 0">${tab == 'ended' ? '沒有已終止的保單。' : '這個分類沒有保單。'}</div>`;
    r += '</div>';
    return `<div class="cols"><div>${left}</div><div>${r}</div></div>`;
  }
  function rowHtml(a, i, vis, O) {
    const s = payState(a), d = days(a.due), e = a.end ? days(a.end) : null, t = cvt(a.prem, a.c), tw = m => fmtMinor(m, 'TWD');
    const dueLine = s == 'complete' ? '<div class="mt" style="margin-top:2px">已繳清，不需要再繳</div>' : s == 'ended' ? `<div class="mt" style="margin-top:2px">已終止${a.endedOn ? '（' + a.endedOn + '）' : ''}${a.endNote ? '｜' + esc(a.endNote) : ''}</div>` : `<div class="${s == 'unpaid' ? 'err' : 'mt'}" style="margin-top:2px">下次繳費日 ${a.due}（${dueText(d)}）</div>`;
    const btns = O ? mvb(vis, i, a.id, 'ins') : del == a.id ? `<span class="err">刪除？</span><button class="btn sm" data-a="dc">取消</button><button class="btn sm" data-a="dok" data-id="${a.id}">刪除</button>`
      : `<button class="btn sm" data-a="card" data-id="${a.id}">${open == a.id ? '收起保單卡' : '保單卡'}</button>${s == 'ended' ? `<button class="btn sm" data-a="resume" data-id="${a.id}">恢復有效</button>` : s == 'complete' ? '' : `<button class="btn sm" data-a="paid" data-id="${a.id}">標記已繳費</button>`}<button class="btn sm" data-a="edit" data-id="${a.id}">編輯</button><button class="btn sm" data-a="del" data-id="${a.id}">刪除</button>`;
    return `<div class="hrow"><div class="hl"><b>${esc(a.co)}</b><span class="tag">${a.k}</span>${a.c != 'TWD' ? `<span class="tag">${a.c}</span>` : ''}<div class="mt">${a.n ? esc(a.n) + '｜' : ''}${a.who ? '被保險人 ' + esc(a.who) + '｜' : ''}換算一年約 ${fmtMinor(annOwn(a), a.c)}</div>
      ${dueLine}<div class="${e != null && e <= 30 && s != 'ended' ? 'err' : 'mt'}">保障到期日 ${a.end ? `${a.end}（${e < 0 ? '已到期' : dueText(e)}）` : '未填（無期限或長期）'}</div>${a.note ? `<div class="mt">${esc(a.note)}</div>` : ''}</div>
      <div class="hr"><div class="top">${tagsHtml(a)}<span>${fmtMinor(a.prem, a.c)}</span></div><div class="mt">${fn(a.mo)}</div>${a.c != 'TWD' && t != null ? `<div class="mt">≈ ${tw(t)}</div>` : ''}<div class="act">${btns}</div></div></div>${open == a.id && !O ? cardHtml(a) : ''}`;
  }
  /* 保單卡 */
  function cardHtml(a) {
    const hist = (a.hist || []).slice().sort((x, y) => y.date.localeCompare(x.date) || (y.due || '').localeCompare(x.due || '')), shown = allHist ? hist : hist.slice(0, 5), total = hist.reduce((s, h) => s + h.amt, 0);
    const hrec = h => del == 'h:' + h.id ? `<span class="err">刪除這筆紀錄？</span> <button class="btn sm" data-a="dc">取消</button> <button class="btn sm" data-a="pdok" data-h="${h.id}">刪除</button>` : `${fmtMinor(h.amt, a.c)} <button class="btn sm" data-a="payedit" data-h="${h.id}">編輯</button> <button class="btn sm" data-a="paydel" data-h="${h.id}">刪除</button>`;
    return `<div class="pcard"><div class="sec">保單卡：${esc(a.co)} ${esc(a.n)}</div>
      <div class="sum3"><span>累計已繳（本 App 的紀錄）</span><span>${fmtMinor(total, a.c)}</span>${a.terms > 0 ? `<span>已繳期數</span><span>${paidCount(a)} / ${a.terms}${a.pt ? `（含開始前已繳 ${a.pt} 期）` : ''}</span>` : ''}<span>狀態</span><span>${a.status == 'ended' ? '已終止' : complete(a) ? '已繳清' : '有效'}</span></div>
      <div class="sec" style="margin:14px 0 4px">保障內容與保額</div>${(a.cov || []).map((c, i) => `<div class="up"><span>${esc(c.n)}</span><span>${fmtMinor(c.amt, a.c)} <button class="btn sm" data-a="covdel" data-i="${i}">刪除</button></span></div>`).join('') || '<div class="mt">還沒有保障內容。</div>'}
      <div class="g2" style="margin-top:6px"><div><label class="flab" for="cv-n">項目名稱</label><input id="cv-n" placeholder="例如 住院日額"></div><div><label class="flab" for="cv-amt">保額（${a.c}）</label><input id="cv-amt" type="number" inputmode="decimal" min="0" step="any"></div></div><div class="err" id="pe-cov"></div><div class="r"><button class="btn sm" data-a="covok">新增保障項目</button></div>
      <div class="sec" style="margin:14px 0 4px">繳費紀錄（${hist.length}）</div>${shown.map(h => `<div class="up"><span>${h.date}｜對應繳費日 ${h.due || '—'}${h.note ? '｜' + esc(h.note) : ''}</span><span>${hrec(h)}</span></div>`).join('') || '<div class="mt">還沒有紀錄。按「標記已繳費」會自動記錄，也可以補登過去的繳費。</div>'}
      ${hist.length > 5 ? `<div class="r"><button class="btn sm" data-a="histall">${allHist ? '只顯示最近 5 筆' : '顯示全部'}</button></div>` : ''}
      ${sub && sub.k == 'pay' ? payFormHtml(a) : `<div class="r"><button class="btn sm" data-a="payadd">補登繳費</button></div>`}
      ${sub && sub.k == 'end' ? `<div class="panel w" style="margin-top:10px"><b>終止保單</b><div class="mt">終止後保單卡會保留在「已終止」頁籤，不再計入年繳合計與提醒，繳費紀錄也不會消失。</div><div class="g2"><div><label class="flab" for="e-date">終止日期</label><input id="e-date" type="date" value="${todayStr()}"></div><div><label class="flab" for="e-note">原因（選填）</label><input id="e-note" placeholder="例如 到期、解約"></div></div><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="subc">取消</button><button class="btn main sm" data-a="endok">確定終止</button></div></div>` : a.status == 'ended' ? '' : '<div class="r"><button class="btn sm" data-a="endask">終止保單</button></div>'}
      </div>`;
  }
  function payFormHtml(a) {
    const h = sub.hid ? (a.hist || []).find(x => x.id == sub.hid) || {} : {};
    return `<div class="panel" style="margin-top:8px"><b>${sub.hid ? '編輯繳費紀錄' : '補登繳費'}</b><div class="g2"><div><label class="flab" for="ph-date">繳費日期</label><input id="ph-date" type="date" value="${h.date ?? ''}"></div><div><label class="flab" for="ph-amt">金額（${a.c}）</label><input id="ph-amt" type="number" inputmode="decimal" min="0" step="any" value="${h.amt != null ? plainDec(h.amt, 2) : plainDec(a.prem, 2)}"></div>
      <div><label class="flab" for="ph-due">對應繳費日（選填）</label><input id="ph-due" type="date" value="${h.due ?? ''}"></div><div><label class="flab" for="ph-note">備註（選填）</label><input id="ph-note" value="${esc(h.note ?? '')}"></div></div>
      <div class="mt">對應繳費日用來判斷「本期已繳」：填這筆繳費對應的繳費日；沒有填的紀錄只會計入累計與期數。${a.terms > 0 ? '補登的紀錄會自動計入已繳期數，開始前已繳的期數請不要重複填在保單的「已繳期數」。' : ''}</div><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="subc">取消</button><button class="btn main sm" data-a="payok">儲存</button></div></div>`;
  }
  function formHTML(P, L) {
    const a = P.id ? L.find(x => x.id == P.id) || {} : {}, d = P.draft || {}, v = (k, f) => esc(d[k] ?? a[k] ?? f ?? ''), std = a.mo && FREQ.some(x => x[0] == a.mo);
    const sel = String(d.f ?? (a.mo ? (std ? a.mo : 'C') : '12')), mo = d.mo ?? (a.mo && !std ? a.mo : '');
    return `<div class="panel"><b>${P.id ? '編輯保單' : '新增保單'}</b><div class="g2"><div><label class="flab" for="f-k">險種</label><select id="f-k">${KINDS.map(x => `<option ${v('k', '車險') == x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div><label class="flab" for="f-co">保險公司</label><input id="f-co" value="${v('co')}"></div>
      <div><label class="flab" for="f-n">保單名稱（選填）</label><input id="f-n" value="${v('n')}"></div><div><label class="flab" for="f-who">被保險人（選填）</label><input id="f-who" value="${v('who')}"></div>
      <div><label class="flab" for="f-f">繳費頻率</label><select id="f-f">${FREQ.map(([k, n]) => `<option value="${k}" ${sel == k ? 'selected' : ''}>${n}</option>`).join('')}<option value="C" ${sel == 'C' ? 'selected' : ''}>自訂（每幾個月繳一次）</option></select></div>
      <div>${sel == 'C' ? `<label class="flab" for="f-mo">每幾個月繳一次</label><input id="f-mo" type="number" inputmode="numeric" min="1" max="120" step="1" value="${esc(mo)}">` : ''}</div>
      <div><label class="flab" for="f-c">幣別</label><select id="f-c">${curOpts(d.c ?? a.c ?? 'TWD')}</select></div><div><label class="flab" for="f-prem">每次保費</label><input id="f-prem" type="number" inputmode="decimal" min="0" step="any" value="${d.prem ?? (a.prem != null ? plainDec(a.prem, 2) : '')}"></div>
      <div><label class="flab" for="f-due">下次繳費日</label><input id="f-due" type="date" value="${v('due')}"></div><div><label class="flab" for="f-end">保障到期日（選填）</label><input id="f-end" type="date" value="${v('end')}"></div>
      <div><label class="flab" for="f-terms">總期數（選填，分期才填）</label><input id="f-terms" type="number" inputmode="numeric" min="1" max="999" step="1" value="${v('terms')}" placeholder="例如 20 年期年繳填 20"></div><div><label class="flab" for="f-pt">已繳期數（選填）</label><input id="f-pt" type="number" inputmode="numeric" min="0" max="999" step="1" value="${v('pt')}" placeholder="開始用本 App 之前已繳的期數"></div></div>
      <div class="mt">分期的保單填「總期數」；「已繳期數」只填開始使用本 App 之前已經繳的期數，之後每次標記已繳費會自動加 1，繳滿會顯示「已繳清」。</div>
      <label class="flab" for="f-note">備註（選填，例如保障內容、車牌）</label><input id="f-note" value="${v('note')}"><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="ok">${P.id ? '儲存' : '新增'}</button></div></div>`;
  }
  function paidHTML(P, L) {
    const a = L.find(x => x.id == P.id); if (!a) return '';
    const nd = addMonths(a.due, a.mo, a.ad), ne = a.end ? (a.end == a.due ? nd : a.end) : '';
    return `<div class="panel" id="paidp"><b>標記已繳費：${esc(a.co)} ${esc(a.n)}</b><div class="mt">這次繳的是 ${a.due} 的保費，繳費頻率是${fn(a.mo)}。下次繳費日已依頻率算好，可以直接改日期（頻率要改請到「編輯」）。${a.terms > 0 ? `這次繳完會是第 ${paidCount(a) + 1} / ${a.terms} 期。` : ''}</div>
      <div class="g2"><div><label class="flab" for="pd-date">繳費日期</label><input id="pd-date" type="date" value="${todayStr()}"></div><div><label class="flab" for="pd-amt">這次繳的金額（${a.c}）</label><input id="pd-amt" type="number" inputmode="decimal" min="0" step="any" value="${plainDec(a.prem, 2)}"></div></div>
      <label class="flab" for="pd-due">下次繳費日</label><input id="pd-due" type="date" value="${nd}" data-calc="${nd}" style="width:auto">
      ${a.end ? `<label class="flab" for="pd-end">保障到期日（續保後）</label><input id="pd-end" type="date" value="${ne}" style="width:auto"><div class="mt">原本保障到期日${a.end == a.due ? '和繳費日同一天（例如強制險、車險），所以預設一起順延' : '和繳費日不同天，所以預設維持不變'}，可以手動修改。</div>` : ''}
      <div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="pok">確認已繳費</button></div></div>`;
  }
  async function save(P) {
    const old = P.id ? await DB.get('insurance', P.id) : null, co = val('f-co'), prem = parseMinor(val('f-prem')), due = val('f-due'), end = val('f-end'), fv = val('f-f'), mo = fv == 'C' ? Number(val('f-mo')) : Number(fv);
    const ts = val('f-terms'), ps = val('f-pt'), terms = ts === '' ? 0 : Number(ts), pt = ps === '' ? 0 : Number(ps);
    if (!co) return errTo('請填保險公司');
    if (prem == null || !(prem > 0)) return errTo('請填每次保費（要大於 0）');
    if (!due) return errTo('請選擇下次繳費日');
    if (!Number.isInteger(mo) || mo < 1 || mo > 120) return errTo('自訂頻率請填 1 到 120 之間的整數（每幾個月）');
    if (!Number.isInteger(terms) || terms < 0 || terms > 999) return errTo('總期數請填 1 到 999 之間的整數，沒有分期就留白');
    if (!Number.isInteger(pt) || pt < 0 || (terms && pt > terms)) return errTo('已繳期數要是 0 到總期數之間的整數');
    const o = { ...(old || {}), id: old ? old.id : DB.uid('i'), k: val('f-k'), co, n: val('f-n'), who: val('f-who'), c: val('f-c'), prem, mo, due, end, note: val('f-note'), ad: +due.slice(8) };
    if (terms) { o.terms = terms; o.pt = pt; } else { delete o.terms; delete o.pt; }
    await DB.put('insurance', o); msg = P.id ? '已儲存。' : '已新增。'; return true;
  }
  async function updatePolicy(id, fn2) { const x = await DB.get('insurance', id); await DB.put('insurance', fn2({ ...x })); }
  async function click(e) {
    const t = e.target.closest('[data-t]');
    if (t && !t.dataset.a) { tab = t.dataset.t; return true; }
    const b = e.target.closest('[data-a]'); if (!b) return false;
    const a = b.dataset.a, id = b.dataset.id, hid = b.dataset.h; msg = null;
    if (a == 'add') { P = { k: 'form' }; sub = null; } else if (a == 'edit') { P = { k: 'form', id }; sub = null; } else if (a == 'pc') P = null;
    else if (a == 'ok') { if ((await save(P)) !== true) return 'stay'; P = null; }
    else if (a == 'del') del = id; else if (a == 'dc') del = null;
    else if (a == 'dok') { await DB.del('insurance', id); del = null; if (open == id) open = null; msg = '已刪除。'; }
    else if (a == 'paid') { P = { k: 'paid', id }; del = null; sub = null; }
    else if (a == 'pok') {
      const x = await DB.get('insurance', P.id), nd = $('#pd-due'), ne = $('#pd-end'), pdate = val('pd-date'), amt = parseMinor(val('pd-amt'));
      if (!pdate) return errTo('請選擇繳費日期'); if (pdate > todayStr()) return errTo('繳費日期不能是未來');
      if (amt == null || !(amt > 0)) return errTo('請填這次繳的金額（要大於 0）');
      if (!nd.value) return errTo('請選擇下次繳費日'); if (nd.value <= x.due) return errTo(`下次繳費日要晚於這次的繳費日（${x.due}）`);
      if (ne && !ne.value) return errTo('請填保障到期日；要清除請到「編輯」');
      const nx = { ...x, due: nd.value, end: ne ? ne.value : x.end, ad: nd.value !== nd.dataset.calc ? +nd.value.slice(8) : x.ad, hist: [...(x.hist || []), { id: DB.uid('r'), date: pdate, due: x.due, amt }] };
      await DB.put('insurance', nx); msg = `已標記繳費，下次繳費日改為 ${nd.value}。${complete(nx) ? '分期已繳清。' : ''}`; P = null;
    }
    else if (a == 'card') { open = open == id ? null : id; sub = null; allHist = false; del = null; }
    else if (a == 'histall') allHist = !allHist;
    else if (a == 'payadd') sub = { k: 'pay' }; else if (a == 'payedit') sub = { k: 'pay', hid }; else if (a == 'subc') sub = null;
    else if (a == 'paydel') del = 'h:' + hid;
    else if (a == 'pdok') { await updatePolicy(open, x => { x.hist = (x.hist || []).filter(h => h.id != hid); return x; }); del = null; msg = '已刪除繳費紀錄。'; }
    else if (a == 'payok') {
      const date = val('ph-date'), due = val('ph-due'), amt = parseMinor(val('ph-amt'));
      if (!date) return errTo('請選擇繳費日期'); if (date > todayStr()) return errTo('繳費日期不能是未來');
      if (amt == null || !(amt > 0)) return errTo('請填金額（要大於 0）');
      await updatePolicy(open, x => { const rec = { id: sub.hid || DB.uid('r'), date, amt }; if (due) rec.due = due; const note = val('ph-note'); if (note) rec.note = note; x.hist = sub.hid ? (x.hist || []).map(h => h.id == sub.hid ? rec : h) : [...(x.hist || []), rec]; return x; });
      sub = null; msg = '已儲存繳費紀錄。';
    }
    else if (a == 'covok') {
      const n = val('cv-n'), amt = parseMinor(val('cv-amt')), pe = $('#pe-cov');
      if (!n) { pe.textContent = '請填項目名稱'; return 'stay'; } if (amt == null || amt < 0) { pe.textContent = '請填保額（不能是負數）'; return 'stay'; }
      await updatePolicy(open, x => { x.cov = [...(x.cov || []), { n, amt }]; return x; }); msg = '已新增保障項目。';
    }
    else if (a == 'covdel') { await updatePolicy(open, x => { x.cov = (x.cov || []).filter((_, i) => i != +b.dataset.i); return x; }); msg = '已刪除保障項目。'; }
    else if (a == 'endask') sub = { k: 'end' };
    else if (a == 'endok') {
      const d = val('e-date'); if (!d) return errTo('請選擇終止日期'); if (d > todayStr()) return errTo('終止日期不能是未來');
      await updatePolicy(open, x => { x.status = 'ended'; x.endedOn = d; const n = val('e-note'); if (n) x.endNote = n; else delete x.endNote; return x; }); sub = null; open = null; msg = '已終止，保單卡保留在「已終止」頁籤。';
    }
    else if (a == 'resume') { await updatePolicy(id, x => { x.status = 'active'; delete x.endedOn; delete x.endNote; return x; }); msg = '已恢復有效。'; }
    else if (a == 'ord') { order = 1; P = null; del = null; open = null; } else if (a == 'ordok') order = null;
    else if (a == 'mv') { if (await moveRow('insurance', r => r.status != 'ended', id, +b.dataset.d)) fx = { id, d: +b.dataset.d }; else return 'stay'; }
    else return false;
    return true;
  }
  const change = e => { if (e.target.id != 'f-f' || !P || P.k != 'form') return false; P.draft = draftOf(); return true; };
  const after = () => { if (P && P.k == 'paid') { $('#paidp')?.scrollIntoView?.({ block: 'center' }); $('#pd-due')?.focus(); } if (fx) { focusMoved(fx); fx = null; } };
  return { render, click, change, after, reset, payState, complete };
})();
