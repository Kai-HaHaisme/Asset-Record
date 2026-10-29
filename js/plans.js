/* 計畫頁：目標存款。進度來源二選一：連結資產（自動跟著存款、股票、債券基金的金額變）或手動輸入金額。
   目標金額與進度一律以 TWD 最小單位（×100）儲存與計算；連結的外幣資產用設定頁的匯率換算。 */
const PlansPage = (() => {
  let P = null, del = null, msg = null, order = null, fx = null;
  const reset = () => { P = null; del = null; msg = null; order = null; fx = null; };
  const monthsText = d => d >= 45 ? `約 ${Math.round(d / 30.4375)} 個月後` : `${d} 天後`;
  const tw = m => fmtMinor(m, 'TWD');
  // 可連結的來源：四個類別＋每一個存款帳戶（帳戶隸屬於「現金與存款」，不能和整個類別同時勾選）
  function sources(A) {
    const v = (m, c) => { const t = cvt(m, c); return { s: t ?? 0, miss: t == null ? 1 : 0 }; };
    return [{ k: 'cat:cash', l: '現金與存款（全部）', v: A.cat.cash }, { k: 'cat:stock', l: '股票', v: A.cat.stock }, { k: 'cat:bond', l: '債券與基金', v: A.cat.bond }, { k: 'cat:other', l: '其他資產', v: A.cat.other },
      ...A.acc.map(a => ({ k: 'acc:' + a.id, l: `${a.bank}${a.n ? ' ' + a.n : ''}（${a.t == 'D' ? '活存' : '定存'}）`, v: v(a.v, a.c), parent: 'cat:cash' }))];
  }
  const eff = p => p.src.includes('cat:cash') ? p.src.filter(k => !k.startsWith('acc:')) : p.src;
  const cover = (p, SRC) => { const e = eff(p), c = new Set(e); if (e.includes('cat:cash')) SRC.filter(x => x.parent).forEach(x => c.add(x.k)); return c; };

  async function render() {
    const L = await DB.all('plans'), A = await loadAssets(), SRC = sources(A), O = order, srcOf = k => SRC.find(x => x.k == k);
    const info = L.map(p => {
      const keys = eff(p), ok = p.mode == 'manual' ? [] : keys.filter(k => srcOf(k)), gone = p.mode == 'manual' ? 0 : keys.length - ok.length;
      const cur = p.mode == 'manual' ? p.amt : ok.reduce((s, k) => s + srcOf(k).v.s, 0), miss = ok.reduce((s, k) => s + srcOf(k).v.miss, 0), gap = p.target - cur, d = p.date ? days(p.date) : null;
      return { p, cur, gap, d, miss, gone, ok, done: gap <= 0, need: gap > 0 && d > 0 ? Math.round(gap / Math.max(1, d / 30.4375)) : null };
    });
    const done = info.filter(x => x.done).length, needSum = info.reduce((s, x) => s + (x.need || 0), 0);
    let left = `<div class="card"><div class="sec">目標存款</div><div class="big">${L.length} 個計畫</div><div class="sum3"><span>已達成</span><span>${done} 個</span><span>進行中</span><span>${L.length - done} 個</span><span>進行中計畫每月需存合計</span><span>${tw(needSum)}</span></div>
      <div class="mt" style="margin-top:8px">每個計畫分開計算。如果多個計畫連到同一筆資產，進度不會自動分攤，合計可能偏高。每月需存是用「還差的金額 ÷ 剩餘月數」平均算，沒有考慮投資報酬與利息。</div>${msgHtml(msg ? { t: msg } : null)}</div>`;
    let r = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="sec" style="margin:0">計畫（${L.length}）</div><div class="act" style="margin:0">${O ? '<button class="btn main sm" data-a="ordok">完成排序</button>' : '<button class="btn sm" data-a="ord" data-o="plans">調整順序</button><button class="btn sm" data-a="add">＋新增計畫</button>'}</div></div>${P && P.k == 'form' ? formHTML(P, L, SRC) : ''}${O ? '<div class="mt" style="margin-top:8px">排序模式：用 ▲▼ 調整順序，完成後按「完成排序」。</div>' : ''}${L.length ? '' : '<div class="mt" style="padding:12px 0">還沒有計畫。按「＋新增計畫」開始。</div>'}</div>`;
    r += info.map((x, i) => {
      const p = x.p, pct = p.target ? x.cur / p.target * 100 : 0, mine = cover(p, SRC);
      const shared = L.filter(q => q.id != p.id && q.mode == 'link' && p.mode == 'link' && [...cover(q, SRC)].some(k => mine.has(k)));
      const srcText = p.mode == 'manual' ? `手動輸入：${tw(p.amt)}（更新於 ${(p.at || '').slice(5)}）` : `連結：${x.ok.map(k => srcOf(k).l).join('、') || '（沒有可用的項目）'}`;
      return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(p.name)}</b>${x.done ? '<span class="tag">已達成</span>' : x.d != null && x.d < 0 ? '<span class="tag">已過目標日</span>' : ''}<div class="mt">目標 ${tw(p.target)}｜${p.date ? `目標日期 ${p.date}（${x.d < 0 ? `已過 ${-x.d} 天` : x.d == 0 ? '今天' : monthsText(x.d)}）` : '未設目標日期'}</div></div>
      <div class="act" style="margin:0;align-self:flex-start">${O ? mvb(L, i, p.id, 'plans') : del == p.id ? `<span class="err">刪除？</span><button class="btn sm" data-a="dc">取消</button><button class="btn sm" data-a="dok" data-id="${p.id}">刪除</button>` : `${p.mode == 'manual' ? `<button class="btn sm" data-a="amt" data-id="${p.id}">更新金額</button>` : ''}<button class="btn sm" data-a="edit" data-id="${p.id}">編輯</button><button class="btn sm" data-a="del" data-id="${p.id}">刪除</button>`}</div></div>
      ${P && P.k == 'amt' && P.id == p.id ? amtHTML(p) : ''}<div class="pbar" role="progressbar" aria-valuenow="${Math.min(100, Math.max(0, pct)).toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, Math.max(0, pct)).toFixed(1)}%"></i></div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>已存 ${tw(x.cur)}（${pct.toFixed(1)}%）</span><span>${x.done ? `超出目標 ${tw(-x.gap)}` : `還差 ${tw(x.gap)}`}</span></div>
      ${x.need != null ? `<div class="mt" style="margin-top:4px">要在目標日期前達成，平均每月需存 ${tw(x.need)}</div>` : ''}${!x.done && x.d != null && x.d <= 0 ? '<div class="warn">已過目標日期，還沒達成。可以到「編輯」調整目標日期或金額。</div>' : ''}
      ${x.gone ? `<div class="warn">有 ${x.gone} 個連結的項目已經不存在（可能被刪除了），進度沒有算到它。請到「編輯」重新選擇。</div>` : ''}${missWarn(x.miss)}
      <div class="mt" style="margin-top:4px">${srcText}</div>${p.note ? `<div class="mt">${esc(p.note)}</div>` : ''}${shared.length ? `<div class="mt">與「${shared.map(q => esc(q.name)).join('」「')}」使用相同的資產，進度不會分攤。</div>` : ''}</div>`;
    }).join('');
    return `<div class="cols"><div>${left}</div><div>${r}</div></div>`;
  }
  const amtHTML = p => `<div class="panel"><b>更新目前金額</b><div class="g2"><div><label class="flab" for="a-v">目前已存（NT$）</label><input id="a-v" type="number" inputmode="decimal" min="0" step="any" placeholder="${plainDec(p.amt, 2)}"></div><div><label class="flab" for="a-d">更新日期</label><input id="a-d" type="date" value="${todayStr()}"></div></div><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="aok">儲存</button></div></div>`;
  function formHTML(P, L, SRC) {
    const p = P.id ? L.find(x => x.id == P.id) || {} : {}, d = P.draft || {}, v = (k, f) => esc(d[k] ?? p[k] ?? f ?? ''), mode = d.mode ?? p.mode ?? 'link', srcs = d.src ?? p.src ?? [], cash = srcs.includes('cat:cash');
    return `<div class="panel"><b>${P.id ? '編輯計畫' : '新增計畫'}</b><div class="g2"><div><label class="flab" for="f-name">計畫名稱</label><input id="f-name" value="${v('name')}" placeholder="例如 買房頭期款"></div><div><label class="flab" for="f-target">目標金額（NT$）</label><input id="f-target" type="number" inputmode="decimal" min="0" step="any" value="${d.target ?? (p.target != null ? plainDec(p.target, 2) : '')}"></div>
      <div><label class="flab" for="f-date">目標日期（選填）</label><input id="f-date" type="date" value="${v('date')}"></div><div></div></div>
      <div class="flab" style="margin-top:10px">目前已存的金額怎麼算？</div><label class="chk"><input type="radio" name="f-mode" value="link" ${mode == 'link' ? 'checked' : ''}><span>連結資產（自動跟著各頁的金額變）</span></label><label class="chk"><input type="radio" name="f-mode" value="manual" ${mode == 'manual' ? 'checked' : ''}><span>手動輸入金額</span></label>
      ${mode == 'link' ? `<div class="mt" style="margin-top:6px">勾選要納入的項目。勾了「現金與存款（全部）」就不用再勾個別帳戶，避免重複計算。</div>${SRC.map(x => { const dis = x.parent && cash; return `<label class="chk ${dis ? 'dis' : ''} ${x.parent ? 'ind' : ''}"><input type="checkbox" class="src" value="${esc(x.k)}" ${srcs.includes(x.k) || dis ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${esc(x.l)}　${tw(x.v.s)}</span></label>`; }).join('')}` : `<label class="flab" for="f-amt" style="margin-top:8px">目前已存（NT$）</label><input id="f-amt" type="number" inputmode="decimal" min="0" step="any" value="${d.amt ?? (p.amt != null && p.mode == 'manual' ? plainDec(p.amt, 2) : '')}">`}
      <label class="flab" for="f-note">備註（選填）</label><input id="f-note" value="${v('note')}"><div class="err" id="pe"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="ok">${P.id ? '儲存' : '新增'}</button></div></div>`;
  }
  const draft = () => ({ name: val('f-name'), target: val('f-target'), date: val('f-date'), note: val('f-note'), amt: val('f-amt'), mode: $('[name=f-mode]:checked')?.value, src: $$('.src:checked:not(:disabled)').map(x => x.value) });
  async function save(P) {
    const old = P.id ? await DB.get('plans', P.id) : null, name = val('f-name'), target = parseMinor(val('f-target')), date = val('f-date'), mode = $('[name=f-mode]:checked').value;
    if (!name) return errTo('請填計畫名稱');
    if (target == null || !(target > 0)) return errTo('目標金額要大於 0');
    if (date && date <= todayStr() && !(old && old.date == date)) return errTo('目標日期要晚於今天');
    const o = { ...(old || {}), id: old ? old.id : DB.uid('p'), name, target, date, note: val('f-note'), mode, src: [], amt: 0, at: '' };
    if (mode == 'link') { o.src = draft().src; if (!o.src.length) return errTo('請至少勾選一個項目；或改用「手動輸入金額」'); }
    else { const a = parseMinor(val('f-amt')); if (a == null || a < 0) return errTo('請填目前已存的金額（不能是負數）'); o.amt = a; o.at = old && old.mode == 'manual' && old.amt === a ? old.at : todayStr(); }
    await DB.put('plans', o); msg = P.id ? '已儲存。' : '已新增。'; return true;
  }
  async function click(e) {
    const b = e.target.closest('[data-a]'); if (!b) return false;
    const a = b.dataset.a, id = b.dataset.id; msg = null;
    if (a == 'add') P = { k: 'form' }; else if (a == 'edit') P = { k: 'form', id }; else if (a == 'pc') P = null;
    else if (a == 'ok') { if ((await save(P)) !== true) return 'stay'; P = null; }
    else if (a == 'amt') P = { k: 'amt', id };
    else if (a == 'aok') {
      const v = parseMinor(val('a-v')), d = val('a-d');
      if (v == null || v < 0) return errTo('請填金額（不能是負數）'); if (!d) return errTo('請選擇更新日期'); if (d > todayStr()) return errTo('更新日期不能是未來');
      await DB.put('plans', { ...(await DB.get('plans', P.id)), amt: v, at: d }); P = null; msg = '已更新金額。';
    }
    else if (a == 'del') del = id; else if (a == 'dc') del = null;
    else if (a == 'dok') { await DB.del('plans', id); del = null; msg = '已刪除。'; }
    else if (a == 'ord') { order = 1; P = null; del = null; } else if (a == 'ordok') order = null;
    else if (a == 'mv') { if (await moveRow('plans', () => true, id, +b.dataset.d)) fx = { id, d: +b.dataset.d }; else return 'stay'; }
    else return false;
    return true;
  }
  const change = e => { if (!P || P.k != 'form') return false; if (e.target.name == 'f-mode' || e.target.classList.contains('src')) { P.draft = draft(); return true; } return false; };
  const after = () => { if (fx) { focusMoved(fx); fx = null; } };
  return { render, click, change, after, reset };
})();
