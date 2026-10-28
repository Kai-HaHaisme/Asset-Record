/* 共用畫面工具：存款、投資、保險、計畫等頁共用。 */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], DAY = 864e5;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const fmtTime = ts => new Date(ts).toLocaleString(LT(), { hour12: false });
const agoDays = ts => Math.floor((Date.now() - ts) / DAY);
const dAgo = d => Math.round((new Date(todayStr() + 'T00:00:00') - new Date(d + 'T00:00:00')) / DAY), days = d => -dAgo(d);
const wan = n => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1e3) + 'K';
const msgHtml = m => m ? `<div class="msg${m.e ? ' e' : ''}">${m.t}</div>` : '';

/* 匯率換算：回傳 TWD 最小單位；沒有匯率回傳 null（呼叫的人要處理，不能當 0） */
const cvt = (m, c) => toTWD(m, c, RATES.rate(c));
function sumTWD(items) { let s = 0, miss = 0; for (const [m, c] of items) { const t = cvt(m, c); if (t == null) miss++; else s += t; } return { s, miss }; }
const missWarn = n => n ? `<div class="warn">有 ${n} 筆外幣項目因為沒有匯率，沒有計入合計。請到「設定」更新或手動輸入匯率。</div>` : '';

/* 調整順序：▲▼ 按鈕、模式切換按鈕、實際移動並存檔 */
const mvb = (list, i, id, key) => `<button class="btn sm mvb" data-a="mv" data-o="${key}" data-id="${id}" data-d="-1" ${i == 0 ? 'disabled' : ''} aria-label="上移">▲</button><button class="btn sm mvb" data-a="mv" data-o="${key}" data-id="${id}" data-d="1" ${i == list.length - 1 ? 'disabled' : ''} aria-label="下移">▼</button>`;
const ordBtn = (O, key) => O == key ? '<button class="btn main sm" data-a="ordok">完成排序</button>' : O ? '' : `<button class="btn sm" data-a="ord" data-o="${key}">調整順序</button>`;
async function moveRow(store, pred, id, d) {
  const rows = await DB.all(store), idx = rows.map((r, i) => pred(r) ? i : -1).filter(i => i >= 0), j = idx.findIndex(i => rows[i].id == id), k = j + d;
  if (k < 0 || k >= idx.length) return false;
  [rows[idx[j]], rows[idx[k]]] = [rows[idx[k]], rows[idx[j]]];
  await DB.reorder(store, rows.map(r => r.id)); return true;
}
function focusMoved(fx) {
  if (!fx) return;
  ($(`[data-a=mv][data-id="${fx.id}"][data-d="${fx.d}"]:not([disabled])`) || $(`[data-a=mv][data-id="${fx.id}"]:not([disabled])`))?.focus();
}

/* 圓環圖（純 SVG）：parts = [[名稱, TWD 最小單位金額, css 變數]] */
function donutHtml(parts, sec, label, aria) {
  const tot = parts.reduce((s, p) => s + p[1], 0);
  if (!(tot > 0)) return '';
  let off = 0;
  const arcs = parts.filter(p => p[1] > 0).map(([n, v, c]) => { const f = v / tot, a = `<circle cx="80" cy="80" r="56" fill="none" stroke="var(${c})" stroke-width="22" stroke-dasharray="${(f * 351.86).toFixed(2)} 351.86" stroke-dashoffset="${(-off * 351.86).toFixed(2)}" transform="rotate(-90 80 80)"/>`; off += f; return a; }).join('');
  return `<div class="card"><div class="sec">${sec}</div><div class="donutw"><svg viewBox="0 0 160 160" role="img" aria-label="${aria}">${arcs}<text x="80" y="78" text-anchor="middle" font-size="11" fill="var(--sub)">${label}</text><text x="80" y="95" text-anchor="middle" font-size="13" fill="var(--ink)">${wan(Math.round(tot / 100))}</text></svg>
  <div class="legend">${parts.filter(p => p[1] > 0).map(([n, v, c]) => `<div><span><i style="background:var(${c})"></i>${n}</span><span>${fmtMinor(v, 'TWD')}　${(v / tot * 100).toFixed(1)}%</span></div>`).join('')}</div></div></div>`;
}
/* 表單小工具 */
const val = id => $('#' + id)?.value.trim() ?? '';
const errTo = t => { const e = $('#pe'); if (e) e.textContent = t; return 'stay'; };
const curOpts = sel => CURS.map(x => `<option ${sel == x ? 'selected' : ''}>${x}</option>`).join('');
const chgText = (v, last) => { if (!(last > 0) || !(v >= 0)) return ''; const p = (v / last - 1) * 100; return `｜變動 ${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%${Math.abs(p) >= 20 ? ' <span class="err">差很多，請確認</span>' : ''}`; };

/* 讀取全部資產資料並換算成 TWD（計畫、總覽共用）。miss = 因為沒有匯率而沒算到的外幣項目數 */
async function loadAssets() {
  const [acc, hold, oth] = await Promise.all([DB.all('accounts'), DB.all('holdings'), DB.all('others')]);
  const hv = h => mulDiv(h.sh, h.price, 10000), cur = m => m == 'TW' ? 'TWD' : 'USD';
  const cat = {
    cash: sumTWD(acc.map(a => [a.v, a.c])),
    stock: sumTWD(hold.map(h => [hv(h), cur(h.m)])),
    bond: sumTWD(oth.filter(o => o.k != 'other').map(o => [o.v, o.c])),
    other: sumTWD(oth.filter(o => o.k == 'other').map(o => [o.v, o.c]))
  };
  return { acc, hold, oth, cat, total: cat.cash.s + cat.stock.s + cat.bond.s + cat.other.s, miss: cat.cash.miss + cat.stock.miss + cat.bond.miss + cat.other.miss };
}
const draftOf = () => { const d = {}; $$('.panel input,.panel select').forEach(i => { if (i.id && i.id.startsWith('f-')) d[i.id.slice(2)] = i.value; }); return d; };
