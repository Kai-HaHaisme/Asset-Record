/* 起始樣板的主程式：hash 路由、導覽、設定頁、整庫備份／還原（合併或完整還原）、備份提醒。
   換成正式應用時：改 PAGES 與各頁的 render 函式；設定頁與備份流程可原樣保留。 */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], DAY = 864e5;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const fmtTime = ts => new Date(ts).toLocaleString(LT(), { hour12: false });
const agoDays = ts => Math.floor((Date.now() - ts) / DAY);

let ui = { panel: null, msg: null }, remind = 14;
const PAGES = [['home', '首頁'], ['settings', '設定']];   // 起始樣板：之後換成正式分頁

/* ---------- 路由與導覽 ---------- */
async function route() {
  const p = location.hash.slice(2).split('/'), pg = PAGES.find(x => x[0] === p[0]) ? p[0] : 'home';
  const links = PAGES.map(([k, n]) => `<a href="#/${k}" class="${k === pg ? 'on' : ''}">${n}</a>`).join('');
  $('#side').hidden = false; $('#tabs').hidden = false;
  $('#side').innerHTML = `<div class="tn" style="margin-top:0">資產紀錄</div>${links}`;
  $('#tabs').innerHTML = links;
  $('#top').innerHTML = `<h1>${PAGES.find(x => x[0] === pg)[1]}</h1>`;
  $('#main').innerHTML = pg === 'settings' ? await settingsPage() : await homePage();
  if (pg === 'settings') { const r = $('#rm'); if (r) r.value = remind; uiSettings(); storage(); }
  scrollTo(0, 0);
}
const msgHtml = () => ui.msg ? `<div class="msg${ui.msg.e ? ' e' : ''}">${ui.msg.t}</div>` : '';

/* ---------- 首頁（起始樣板：只示範資料層與備份提醒） ---------- */
async function homePage() {
  const rows = await DB.all('records'), mod = await DB.getMeta('modifiedAt'), bak = await DB.getMeta('lastBackupAt');
  const need = remind > 0 && mod > (bak || 0) && (!bak || agoDays(bak) >= remind);
  let h = need ? `<div class="note"><b>提醒備份</b>：資料有尚未備份的修改。請到「設定」匯出完整備份。</div>` : '';
  h += msgHtml();
  h += `<div class="bar" style="margin-top:10px"><button class="btn main" data-a="add">加入一筆測試記錄</button>${rows.length ? '<button class="btn" data-a="clr">清除測試記錄</button>' : ''}</div>`;
  if (ui.panel?.k === 'clr') h += `<div class="panel w"><b>清除全部測試記錄？</b>這會刪除目前所有記錄，無法復原。<div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main" data-a="clrok">確定清除</button></div></div>`;
  h += `<div class="mt" style="margin-top:12px">目前共有 ${rows.length} 筆記錄。</div>`;
  h += `<div class="mt" style="margin-top:6px">起始樣板：這一頁之後會換成正式內容。</div>`;
  h += `<div class="mt" style="margin-top:10px">${rows.slice(-5).reverse().map(r => esc(r.name)).join('<br>')}</div>`;
  return h;
}

/* ---------- 設定頁（通用：語言外觀、安裝、備份還原、儲存空間） ---------- */
async function settingsPage() {
  const bak = await DB.getMeta('lastBackupAt'), P = ui.panel;
  let h = msgHtml();
  if (P?.k === 'imp') {
    const n = P.pv;
    h += `<div class="panel w"><b>匯入備份</b><div class="mt">${P.cnt}</div>
      <div class="mt">${P.stat}</div>${n.keep ? `<div class="err">${P.keepw}</div>` : ''}
      <label class="o"><input type="radio" name="im" value="merge" checked><span>合併匯入（建議）：保留你現有的記錄，加入檔案中新的記錄；兩邊都有的記錄，保留較新的一筆。</span></label>
      <label class="o"><input type="radio" name="im" value="replace"><span>完整還原：刪除目前所有資料，改成檔案內容。</span></label>
      <div class="err" id="imw" hidden>完整還原會刪除目前所有資料，檔案裡沒有的記錄會消失。</div>
      <div class="r"><button class="btn sm" data-a="pc">取消匯入</button><button class="btn main" data-a="iok">匯入</button></div></div>`;
  }
  h += `<div class="sec">語言與外觀</div><div class="mt" style="margin-top:8px;display:flex;gap:18px;flex-wrap:wrap"><label>語言：<select id="lang" style="width:auto;display:inline-block"><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="ja">日本語</option></select></label><label>外觀：<select id="theme" style="width:auto;display:inline-block"><option value="auto">跟隨系統</option><option value="light">淺色</option><option value="dark">深色</option></select></label></div>`;
  h += `<div class="sec">安裝成 App</div><div class="mt" id="inst" style="margin-top:8px"></div>`;
  h += `<div class="sec">備份與還原</div><div class="bar" style="margin-top:8px"><button class="btn main" data-a="ex">匯出完整備份</button><button class="btn" data-a="imp">匯入備份檔</button></div><input type="file" id="file" accept=".json,application/json" hidden>
    <div class="mt" style="margin-top:8px">${bak ? '上次備份：' + fmtTime(bak) : '尚未備份'}</div>
    <div class="mt" style="margin-top:8px">備份提醒：<select id="rm" style="width:auto;display:inline-block"><option value="7">每 7 天</option><option value="14">每 14 天</option><option value="30">每 30 天</option><option value="0">不提醒</option></select></div>
    <div class="mt" style="margin-top:6px">資料只存在這個裝置的瀏覽器裡。清除瀏覽器資料或解除安裝可能讓資料消失，請定期匯出備份，並妥善保管備份檔。</div>`;
  h += `<div class="sec">儲存空間</div><div class="mt" style="margin-top:8px"><div id="st1">正在讀取儲存空間資訊…</div><div id="st2" style="margin-top:4px"></div></div>`;
  return h;
}
async function storage() {
  try {
    const s = navigator.storage, [u, p] = await Promise.all([s.estimate(), s.persisted()]);
    $('#st1').textContent = `已使用 ${(u.usage / 1048576).toFixed(1)} MB，可用上限約 ${Math.round(u.quota / 1048576).toLocaleString()} MB。`;
    const pe = ok => {
      $('#st2').innerHTML = ok ? '持久儲存：已啟用。' : '持久儲存：尚未啟用 <button class="btn sm" id="ps">申請持久儲存</button>';
      $('#ps') && ($('#ps').onclick = async () => pe(await s.persist()));
    };
    pe(p);
  } catch (e) { $('#st1').textContent = '此瀏覽器無法讀取儲存空間資訊。'; }
}

/* ---------- 匯出入 ---------- */
function download(name, obj) {
  const b = new Blob([JSON.stringify(obj)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
}
async function doExport() {
  const data = await DB.exportAll();
  download(`資產紀錄_${todayStr()}.json`, { app: DB.APP, version: DB.FILE_VERSION, exportedAt: new Date().toISOString(), data });
  await DB.setMeta('lastBackupAt', Date.now());
  ui.msg = { t: '已匯出完整備份。請到瀏覽器的下載位置查看。' };
}
// 驗證備份檔：回傳錯誤訊息，沒問題回傳 null
function checkFile(o) {
  if (!o || o.app !== DB.APP) return '這不是資產紀錄的備份檔，無法匯入。';
  if (!(o.version >= 1) || !o.data || typeof o.data !== 'object') return '備份檔的資料格式不正確，無法匯入。';
  if (o.version > DB.FILE_VERSION) return '這個檔案來自較新版本，請先更新 App 再匯入。';
  for (const s of DB.STORES) {
    const r = o.data[s];
    if (r === undefined) continue;
    if (!Array.isArray(r) || r.some(x => !x || typeof x.id !== 'string' || !(x.updatedAt >= 0))) return '備份檔的資料格式不正確，無法匯入。';
  }
  return null;
}
async function readImport(file) {
  ui.msg = null;
  let o;
  try { o = JSON.parse(await file.text()); } catch (e) { ui.msg = { e: 1, t: '檔案內容無法讀取，請確認是正確的 JSON 檔。' }; return route(); }
  const bad = checkFile(o);
  if (bad) { ui.msg = { e: 1, t: bad }; return route(); }
  const pv = await DB.preview(o.data);
  ui.panel = { k: 'imp', o, pv,
    cnt: `檔案中的記錄：${pv.total} 筆；匯出時間：${o.exportedAt ? fmtTime(Date.parse(o.exportedAt)) : '—'}`,
    stat: `新增 ${pv.add} 筆、用檔案較新的版本更新 ${pv.upd} 筆、保留你這邊較新的 ${pv.keep} 筆、相同 ${pv.same} 筆。`,
    keepw: `有 ${pv.keep} 筆記錄在你這邊比檔案更新，合併時會保留你的版本。` };
  route();
}

/* ---------- 事件 ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'imp') { $('#file').click(); return; }
  ui.msg = null;
  if (a === 'ex') await doExport();
  else if (a === 'pc') ui.panel = null;
  else if (a === 'add') await DB.put('records', { id: DB.uid('r'), name: 'test ' + new Date().toLocaleTimeString('en-GB') });
  else if (a === 'clr') { ui.panel = { k: 'clr' }; }
  else if (a === 'clrok') { await DB.clear('records'); ui.panel = null; }
  else if (a === 'iok') {
    const mode = $('[name=im]:checked').value, o = ui.panel.o, n = await DB.importAll(o.data, mode);
    ui = { panel: null, msg: { t: mode === 'replace' ? `已完整還原：共 ${o.data[DB.STORES[0]]?.length ?? 0} 筆記錄。` : `已合併匯入：新增 ${ui.panel.pv.add} 筆、更新 ${ui.panel.pv.upd} 筆。` } };
  } else return;
  route();
});
document.addEventListener('change', async e => {
  const x = e.target;
  if (x.id === 'rm') { remind = +x.value; await DB.setMeta('settings', { remind }); route(); }
  if (x.id === 'file') { const f = x.files[0]; x.value = ''; if (f) readImport(f); }
  if (x.name === 'im') $('#imw').hidden = x.value !== 'replace';
});
addEventListener('hashchange', () => { ui = { panel: null, msg: null }; route(); });
(async () => {
  try { remind = (await DB.getMeta('settings'))?.remind ?? 14; } catch (e) {}
  route();
})();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
