/* 主程式：hash 路由、導覽、設定頁（語言外觀、匯率、整庫備份還原、儲存空間、安裝）、備份提醒。
   各頁面的畫面在 deposit.js、invest.js 等檔案；尚未實作的頁面先顯示占位頁（只列資料筆數）。 */
let ui = { panel: null, msg: null, rmsg: null }, remind = 14, seq = 0;
const PAGES = [['overview', '總覽', 4], ['invest', '投資', 2], ['deposit', '存款', 2], ['insurance', '保險', 3], ['plans', '計畫', 3]];
const PAGE_MOD = { deposit: DepositPage, invest: InvestPage };
const curPage = () => { const p = location.hash.slice(2).split('/')[0]; return p === 'settings' ? 'settings' : PAGES.find(x => x[0] === p) ? p : 'overview'; };
const PAGE_STORES = { overview: DB.STORES, invest: ['holdings', 'others'], deposit: ['accounts'], insurance: ['insurance'], plans: ['plans'] };

/* ---------- 路由與導覽 ---------- */
async function route() {
  const my = ++seq, p = location.hash.slice(2).split('/')[0], pg = p === 'settings' ? 'settings' : PAGES.find(x => x[0] === p) ? p : 'overview';
  const links = PAGES.map(([k, n]) => `<a href="#/${k}" class="${k === pg ? 'on' : ''}">${n}</a>`).join('');
  $('#side').innerHTML = `<div class="tn">資產紀錄</div>${links}<a href="#/settings" class="${pg === 'settings' ? 'on' : ''}" style="margin-top:12px">設定</a>`;
  $('#tabs').innerHTML = links;
  $('#top').innerHTML = `<h1>${pg === 'settings' ? '設定' : PAGES.find(x => x[0] === pg)[1]}</h1><a href="#/settings">設定</a>`;
  let html;
  try { html = await banner() + (pg === 'settings' ? await settingsPage() : PAGE_MOD[pg] ? await PAGE_MOD[pg].render() : await placeholder(pg)); }
  catch (e) { html = `<div class="note"><b>無法讀取資料</b>：${esc(e.message || e)}。可能是瀏覽器的無痕模式或儲存空間被限制，請改用一般視窗開啟。</div>`; }
  if (my !== seq) return;
  $('#main').innerHTML = html;
  if (pg === 'settings') { const r = $('#rm'); if (r) r.value = remind; uiSettings(); storage(); }
  PAGE_MOD[pg]?.after?.();
  scrollTo(0, 0);
}
async function banner() {
  const mod = await DB.getMeta('modifiedAt'), bak = await DB.getMeta('lastBackupAt');
  const need = remind > 0 && mod > (bak || 0) && (!bak || agoDays(bak) >= remind);
  return need ? '<div class="note"><b>提醒備份</b>：資料有尚未備份的修改。請到「設定」匯出完整備份。</div>' : '';
}
async function placeholder(pg) {
  const st = PAGE_STORES[pg], n = PAGES.find(x => x[0] === pg);
  const counts = await Promise.all(st.map(async s => [s, (await DB.all(s)).length]));
  return msgHtml(ui.msg) + `<div class="card"><div class="sec">${n[1]}</div><div class="mt">這一頁的畫面會在階段 ${n[2]} 實作。目前資料庫已準備好。</div>
    <div class="sum3" style="margin-top:8px">${counts.map(([s, c]) => `<span>${DB.LABEL[s]}</span><span>${c} 筆</span>`).join('')}</div></div>`;
}

/* ---------- 設定頁 ---------- */
const RNAME = { USD: '美元 USD → TWD', JPY: '日圓 JPY → TWD' };
const rfmt = v => v == null ? '—' : Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
function ratesHtml() {
  const miss = RATES.FOREIGN.some(c => RATES.rate(c) == null);
  return `<div class="sec">匯率</div>
  ${miss ? '<div class="warn">還沒有匯率。外幣金額無法換算成 NT$，請按「立即更新匯率」或手動輸入。</div>' : ''}
  ${RATES.FOREIGN.map(c => { const i = RATES.info(c), src = RATES.source(c);
    return `<div style="margin-top:8px"><b>${RNAME[c]}</b><div class="mt">目前使用：${rfmt(RATES.rate(c))}${src ? `（${src === 'manual' ? '手動' : '自動'}）` : ''}</div>
    <div class="mt">自動：${i.auto ? `${rfmt(i.auto)}（更新於 ${fmtTime(i.updatedAt)}）` : '尚未取得'}</div>
    <div class="bar" style="margin:6px 0 0"><input id="rin-${c}" inputmode="decimal" placeholder="手動輸入匯率" aria-label="${RNAME[c]} 手動匯率" style="width:150px" value="${i.manual ?? ''}"><button class="btn sm" data-a="rset" data-c="${c}">套用</button>${i.manual ? `<button class="btn sm" data-a="rclr" data-c="${c}">恢復自動</button>` : ''}</div><div class="err" id="rerr-${c}"></div></div>`; }).join('')}
  <div class="bar"><button class="btn" data-a="rr">立即更新匯率</button></div>${msgHtml(ui.rmsg)}
  <div class="mt">匯率來源：open.er-api.com（免費服務）。手動輸入的匯率優先，離線時沿用上次的值。匯率只供記錄參考。</div>`;
}
async function settingsPage() {
  const bak = await DB.getMeta('lastBackupAt'), P = ui.panel;
  let h = msgHtml(ui.msg);
  if (P?.k === 'imp') {
    const n = P.pv.sum;
    h += `<div class="panel"><b>匯入備份</b><div class="mt">${P.cnt}</div>
      ${DB.STORES.filter(s => P.pv.by[s].total).map(s => { const b = P.pv.by[s]; return `<div class="mt">${DB.LABEL[s]}：${b.total} 筆（新增 ${b.add}、檔案較新而更新 ${b.upd}、本機較新而保留 ${b.keep}、相同 ${b.same}）</div>`; }).join('')}
      ${n.keep ? `<div class="err">有 ${n.keep} 筆記錄在你這邊比檔案更新，合併時會保留你的版本。</div>` : ''}
      <label class="o"><input type="radio" name="im" value="merge" checked><span>合併匯入（建議）：保留你現有的記錄，加入檔案中新的記錄；兩邊都有的記錄，保留較新的一筆。</span></label>
      <div class="mt" id="imm">合併匯入只會新增與更新，不會刪除。你在本機刪掉、但備份檔裡還有的記錄，會被加回來。</div>
      <label class="o"><input type="radio" name="im" value="replace"><span>完整還原：刪除目前所有資料，改成檔案內容。</span></label>
      <div class="err" id="imw" hidden>完整還原會刪除目前所有資料，檔案裡沒有的記錄會消失。</div>
      <div class="r"><button class="btn sm" data-a="pc">取消匯入</button><button class="btn main" data-a="iok">匯入</button></div></div>`;
  }
  h += `<div class="sec">語言與外觀</div><div class="mt" style="margin-top:8px;display:flex;gap:18px;flex-wrap:wrap"><label>語言：<select id="lang" style="width:auto;display:inline-block"><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="ja">日本語</option></select></label><label>外觀：<select id="theme" style="width:auto;display:inline-block"><option value="auto">跟隨系統</option><option value="light">淺色</option><option value="dark">深色</option></select></label></div>`;
  h += ratesHtml();
  h += `<div class="sec">備份與還原</div><div class="bar" style="margin-top:8px"><button class="btn main" data-a="ex">匯出完整備份</button><button class="btn" data-a="imp">匯入備份檔</button></div><input type="file" id="file" accept=".json,application/json" hidden>
    <div class="mt" style="margin-top:8px">${bak ? '上次備份：' + fmtTime(bak) : '尚未備份'}</div>
    <div class="mt" style="margin-top:8px">備份提醒：<select id="rm" style="width:auto;display:inline-block"><option value="7">每 7 天</option><option value="14">每 14 天</option><option value="30">每 30 天</option><option value="0">不提醒</option></select></div>
    <div class="mt" style="margin-top:6px">資料只存在這個裝置的瀏覽器裡。清除瀏覽器資料或解除安裝可能讓資料消失，請定期匯出備份，並妥善保管備份檔。</div>
    <div class="mt" style="margin-top:6px">目前備份檔尚未加密（加密匯出會在後續階段加入）。請不要把備份檔上傳到公開的地方，例如公開的 GitHub 儲存庫。</div>`;
  h += `<div class="sec">安裝成 App</div><div class="mt" id="inst" style="margin-top:8px"></div>`;
  h += `<div class="sec">儲存空間</div><div class="mt" style="margin-top:8px"><div id="st1">正在讀取儲存空間資訊…</div><div id="st2" style="margin-top:4px"></div></div>`;
  h += `<div class="sec">測試用（正式版會移除）</div><div class="bar" style="margin-top:8px"><button class="btn" data-a="sample">載入範例資料</button><button class="btn" data-a="wipe">清除全部資料</button></div>`;
  if (P?.k === 'wipe') h += `<div class="panel w"><b>清除全部資料？</b>這會刪除所有存款、股票、保險、計畫與快照，無法復原。建議先匯出備份。<div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main" data-a="wok">確定清除</button></div></div>`;
  h += `<div class="sec">關於</div><div class="mt" style="margin-top:8px">資料只存在這個裝置的瀏覽器裡，沒有雲端、沒有帳號。本工具只做記錄，不構成投資或理財建議。</div>`;
  return h;
}
async function storage() {
  try {
    const s = navigator.storage, [u, p] = await Promise.all([s.estimate(), s.persisted()]);
    $('#st1').textContent = `已使用 ${(u.usage / 1048576).toFixed(1)} MB，可用上限約 ${Math.round(u.quota / 1048576).toLocaleString()} MB。`;
    const pe = ok => { $('#st2').innerHTML = ok ? '持久儲存：已啟用。' : '持久儲存：尚未啟用 <button class="btn sm" id="ps">申請持久儲存</button>'; $('#ps') && ($('#ps').onclick = async () => pe(await s.persist())); };
    pe(p);
  } catch (e) { const a = $('#st1'); if (a) a.textContent = '此瀏覽器無法讀取儲存空間資訊。'; }
}

/* ---------- 匯出入 ---------- */
function download(name, obj) {
  const b = new Blob([JSON.stringify(obj)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
}
async function doExport() {
  const data = await DB.exportAll();
  download(`資產紀錄_${todayStr()}.json`, { app: DB.APP, version: DB.FILE_VERSION, exportedAt: new Date().toISOString(), encrypted: false, data });
  await DB.setMeta('lastBackupAt', Date.now());
  ui.msg = { t: '已匯出完整備份。請到瀏覽器的下載位置查看。' };
}
async function readImport(file) {
  ui.msg = null;
  let o;
  try { o = JSON.parse(await file.text()); } catch (e) { ui.msg = { e: 1, t: '檔案內容無法讀取，請確認是正確的 JSON 檔。' }; return route(); }
  const bad = DB.checkFile(o);
  if (bad) { ui.msg = { e: 1, t: bad }; return route(); }
  const pv = await DB.preview(o.data);
  ui.panel = { k: 'imp', o, pv, cnt: `檔案中的記錄：${pv.sum.total} 筆；匯出時間：${o.exportedAt ? fmtTime(Date.parse(o.exportedAt)) : '—'}` };
  route();
}

/* ---------- 事件 ---------- */
document.addEventListener('click', async e => {
  const mod = PAGE_MOD[curPage()];
  if (mod) { try { const r = await mod.click(e); if (r === true) { await route(); return; } if (r === 'stay') return; } catch (err) { ui.msg = { e: 1, t: '操作失敗：' + esc(err.message || err) }; await route(); return; } }
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, c = b.dataset.c;
  if (a === 'imp') { $('#file').click(); return; }
  ui.msg = null;
  try {
    if (a === 'ex') await doExport();
    else if (a === 'pc') ui.panel = null;
    else if (a === 'iok') {
      const mode = $('[name=im]:checked').value, P = ui.panel, n = await DB.importAll(P.o.data, mode);
      ui = { panel: null, rmsg: null, msg: { t: mode === 'replace' ? `已完整還原：共 ${P.pv.sum.total} 筆記錄。` : `已合併匯入：新增 ${P.pv.sum.add} 筆、更新 ${P.pv.sum.upd} 筆。` } };
    }
    else if (a === 'rr') { ui.rmsg = { t: '正在更新匯率…' }; route(); const r = await RATES.refresh(); ui.rmsg = r.ok ? { t: '匯率已更新。' } : { e: 1, t: r.msg }; }
    else if (a === 'rset') { if (!(await RATES.setManual(c, $('#rin-' + c).value))) { $('#rerr-' + c).textContent = '請輸入大於 0 的數字'; return; } ui.rmsg = { t: '已設定手動匯率。' }; }
    else if (a === 'rclr') { await RATES.clearManual(c); ui.rmsg = { t: '已恢復使用自動匯率。' }; }
    else if (a === 'sample') { const S = SAMPLE(); for (const s of DB.STORES) for (const r of S[s]) await DB.put(s, r); ui.msg = { t: '已載入範例資料。' }; }
    else if (a === 'wipe') ui.panel = { k: 'wipe' };
    else if (a === 'wok') { await DB.clearAll(); ui.panel = null; ui.msg = { t: '已清除全部資料。' }; }
    else return;
  } catch (err) { ui.msg = { e: 1, t: '操作失敗：' + esc(err.message || err) }; }
  route();
});
document.addEventListener('input', e => PAGE_MOD[curPage()]?.input?.(e));
document.addEventListener('keydown', e => PAGE_MOD[curPage()]?.keydown?.(e));
document.addEventListener('change', async e => {
  const x = e.target;
  if (x.id === 'rm') { remind = +x.value; await DB.setMeta('settings', { remind }); route(); }
  if (x.id === 'file') { const f = x.files[0]; x.value = ''; if (f) readImport(f); }
  if (x.name === 'im') { $('#imw').hidden = x.value !== 'replace'; $('#imm').hidden = x.value === 'replace'; }
});
addEventListener('hashchange', () => { ui = { panel: null, msg: null, rmsg: null }; Object.values(PAGE_MOD).forEach(m => m.reset()); route(); });
(async () => {
  try { remind = (await DB.getMeta('settings'))?.remind ?? 14; await RATES.load(); } catch (e) {}
  await route();
  RATES.autoRefresh().then(r => { if (r && location.hash.startsWith('#/settings')) route(); }).catch(() => {});
})();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
