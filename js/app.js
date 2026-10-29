/* 主程式：hash 路由、導覽、設定頁（語言外觀、匯率、整庫備份還原、儲存空間、安裝）、備份提醒。
   各頁面的畫面在 deposit.js、invest.js 等檔案；尚未實作的頁面先顯示占位頁（只列資料筆數）。 */
let ui = { panel: null, msg: null, rmsg: null }, remind = 14, seq = 0, encOn = true;
const PAGES = [['overview', '總覽', 4], ['invest', '投資', 2], ['deposit', '存款', 2], ['insurance', '保險', 3], ['plans', '計畫', 3]];
const PAGE_MOD = { overview: OverviewPage, deposit: DepositPage, invest: InvestPage, insurance: InsurancePage, plans: PlansPage };
const curPage = () => { const p = location.hash.slice(2).split('/')[0]; return p === 'settings' ? 'settings' : PAGES.find(x => x[0] === p) ? p : 'overview'; };
const PAGE_STORES = { overview: DB.STORES, invest: ['holdings', 'others'], deposit: ['accounts'], insurance: ['insurance'], plans: ['plans'] };

/* ---------- 路由與導覽 ---------- */
async function route() {
  if (Lock.isLocked()) return;
  const my = ++seq, p = location.hash.slice(2).split('/')[0], pg = p === 'settings' ? 'settings' : PAGES.find(x => x[0] === p) ? p : 'overview';
  const links = PAGES.map(([k, n]) => `<a href="#/${k}" class="${k === pg ? 'on' : ''}">${n}</a>`).join('');
  $('#side').innerHTML = `<div class="tn">資產紀錄</div>${links}<a href="#/settings" class="${pg === 'settings' ? 'on' : ''}" style="margin-top:12px">設定</a>`;
  $('#tabs').innerHTML = links;
  $('#top').innerHTML = `<h1>${pg === 'settings' ? '設定' : PAGES.find(x => x[0] === pg)[1]}</h1><span>${Lock.enabled() ? '<a href="#" data-lock>鎖定</a>　' : ''}<a href="#/settings">設定</a></span>`;
  let html;
  try { html = await banner() + (pg === 'settings' ? await settingsPage() : PAGE_MOD[pg] ? await PAGE_MOD[pg].render() : await placeholder(pg)); }
  catch (e) { html = `<div class="note"><b>無法讀取資料</b>：${esc(e.message || e)}。可能是瀏覽器的無痕模式或儲存空間被限制，請改用一般視窗開啟。</div>`; }
  if (my !== seq || Lock.isLocked()) return;
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
  if (P?.k === 'pw') h += `<div class="panel"><b>這是加密的備份檔</b><div class="mt">請輸入匯出這個備份檔時設定的備份密碼。</div><label class="flab" for="pwd">備份密碼</label><input id="pwd" type="password" autocomplete="off"><div class="err" id="pwerr"></div><div class="r"><button class="btn sm" data-a="pc">取消匯入</button><button class="btn main sm" data-a="pwok">解密</button></div></div>`;
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
  h += `<div class="sec">備份與還原</div><label class="o" style="margin-top:8px"><input type="checkbox" id="enc" ${encOn ? 'checked' : ''}><span>加密備份檔（建議）</span></label>
    ${encOn ? `<div class="g2"><div><label class="flab" for="pw1">備份密碼（至少 8 個字元）</label><input id="pw1" type="password" autocomplete="new-password"></div><div><label class="flab" for="pw2">再輸入一次密碼</label><input id="pw2" type="password" autocomplete="new-password"></div></div><div class="mt">忘記備份密碼就無法還原這個備份檔，無法幫你找回。請把密碼另外妥善保存，並且不要用和其他重要帳號相同的密碼。</div><div class="err" id="exerr"></div>` : '<div class="mt">沒有加密的備份檔，任何人拿到都能看到你的資產資料。請不要上傳到公開的地方，例如公開的 GitHub 儲存庫。</div>'}
    <div class="bar" style="margin-top:8px"><button class="btn main" data-a="ex">匯出完整備份</button><button class="btn" data-a="imp">匯入備份檔</button></div><input type="file" id="file" accept=".json,application/json" hidden>
    <div class="mt" style="margin-top:8px">${bak ? '上次備份：' + fmtTime(bak) : '尚未備份'}</div>
    <div class="mt" style="margin-top:8px">備份提醒：<select id="rm" style="width:auto;display:inline-block"><option value="7">每 7 天</option><option value="14">每 14 天</option><option value="30">每 30 天</option><option value="0">不提醒</option></select></div>
    <div class="mt" style="margin-top:6px">資料只存在這個裝置的瀏覽器裡。清除瀏覽器資料或解除安裝可能讓資料消失，請定期匯出備份，並妥善保管備份檔。</div>
    <div class="mt" style="margin-top:6px">加密備份檔會用你設定的密碼保護（AES-256-GCM）。匯入加密的備份檔時，需要輸入當初設定的密碼。</div>`;
  h += securityHtml(P);
  h += `<div class="sec">安裝成 App</div><div class="mt" id="inst" style="margin-top:8px"></div>`;
  h += `<div class="sec">儲存空間</div><div class="mt" style="margin-top:8px"><div id="st1">正在讀取儲存空間資訊…</div><div id="st2" style="margin-top:4px"></div></div>`;
  h += `<div class="sec">測試用（正式版會移除）</div><div class="bar" style="margin-top:8px"><button class="btn" data-a="sample">載入範例資料</button><button class="btn" data-a="wipe">清除全部資料</button></div>`;
  if (P?.k === 'wipe') h += `<div class="panel w"><b>清除全部資料？</b>這會刪除所有存款、股票、保險、計畫與快照，無法復原。建議先匯出備份。<div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main" data-a="wok">確定清除</button></div></div>`;
  h += `<div class="sec">關於</div><div class="mt" style="margin-top:8px">資料只存在這個裝置的瀏覽器裡，沒有雲端、沒有帳號。本工具只做記錄，不構成投資或理財建議。</div>`;
  return h;
}
function securityHtml(P) {
  const on = Lock.enabled(), m = P?.k === 'pin' ? P.mode : null;
  let h = '<div class="sec">安全性</div>';
  if (!Crypt.available()) h += '<div class="warn">這個環境不支援加密與 PIN 鎖（需要 https 網址）。用 GitHub Pages 的網址開啟就會正常。</div>';
  h += `<div class="mt" style="margin-top:8px">${on ? `App 鎖：已啟用（PIN ${Lock.len()} 位數）` : 'App 鎖：未啟用'}</div>`;
  if (m) h += `<div class="panel"><b>${m === 'set' ? '設定 PIN' : m === 'change' ? '變更 PIN' : '關閉 App 鎖'}</b>
    ${m !== 'set' ? '<label class="flab" for="pin0">目前的 PIN</label><input id="pin0" type="password" inputmode="numeric" autocomplete="off" maxlength="8">' : ''}
    ${m !== 'off' ? '<label class="flab" for="pin1">新的 PIN（4 到 8 位數字，建議 6 位）</label><input id="pin1" type="password" inputmode="numeric" autocomplete="off" maxlength="8"><label class="flab" for="pin2">再輸入一次新的 PIN</label><input id="pin2" type="password" inputmode="numeric" autocomplete="off" maxlength="8"><div class="mt">請記住 PIN。忘記 PIN 只能清除這個裝置上的資料，再用備份還原。</div>' : ''}
    <div class="err" id="pinerr"></div><div class="r"><button class="btn sm" data-a="pc">取消</button><button class="btn main sm" data-a="pinok">確定</button></div></div>`;
  h += `<div class="bar" style="margin-top:8px">${on ? '<button class="btn" data-a="pinchg">變更 PIN</button><button class="btn" data-a="pinoff">關閉 App 鎖</button><button class="btn" data-a="locknow">立即鎖定</button>' : '<button class="btn main" data-a="pinset">設定 PIN</button>'}</div>`;
  if (on) h += `<div class="mt">自動鎖定：<select id="auto" style="width:auto;display:inline-block">${[[1, '離開 App 1 分鐘後'], [5, '離開 App 5 分鐘後'], [15, '離開 App 15 分鐘後'], [0, '不自動鎖定']].map(([v, n]) => `<option value="${v}" ${Lock.autoMin() === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
  h += '<div class="mt" style="margin-top:6px">PIN 只能防止旁人隨手打開 App，不等於加密儲存：資料仍以明文存在這個瀏覽器裡，拿到你的裝置又有技術的人仍然讀得到。請同時使用手機的螢幕鎖定，備份請用加密。忘記 PIN 沒有任何後門，只能清除這個裝置的資料後重設。</div>';
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
  const data = await DB.exportAll(), head = { app: DB.APP, version: DB.FILE_VERSION, exportedAt: new Date().toISOString() };
  if (encOn) {
    const e = t => { const x = $('#exerr'); if (x) x.textContent = t; return false; };
    if (!Crypt.available()) return e('這個環境不支援加密，請用 https 網址開啟，或取消勾選「加密備份檔」。');
    const p1 = $('#pw1').value, p2 = $('#pw2').value;
    if (p1.length < 8) return e('密碼至少要 8 個字元');
    if (p1 !== p2) return e('兩次輸入的密碼不一樣');
    const btn = $('[data-a=ex]'); if (btn) { btn.disabled = true; btn.textContent = '正在加密…'; }   // 手機上計算金鑰可能要 1 到 3 秒
    download(`資產紀錄_${todayStr()}_加密.json`, { ...head, encrypted: true, ...(await Crypt.encryptJSON(data, p1)) });
    ui.msg = { t: '已匯出加密備份。請到瀏覽器的下載位置查看；請記得備份密碼。' };
  } else {
    download(`資產紀錄_${todayStr()}.json`, { ...head, encrypted: false, data });
    ui.msg = { t: '已匯出完整備份。請到瀏覽器的下載位置查看。' };
  }
  await DB.setMeta('lastBackupAt', Date.now());
  return true;
}
// 解析完整的（已解密或本來就沒加密的）備份檔並顯示匯入預覽
async function previewImport(o) {
  const bad = DB.checkFile(o);
  if (bad) { ui.msg = { e: 1, t: bad }; ui.panel = null; return route(); }
  const pv = await DB.preview(o.data);
  ui.panel = { k: 'imp', o, pv, cnt: `檔案中的記錄：${pv.sum.total} 筆；匯出時間：${o.exportedAt ? fmtTime(Date.parse(o.exportedAt)) : '—'}` };
  route();
}
async function readImport(file) {
  ui.msg = null;
  let o;
  try { o = JSON.parse(await file.text()); } catch (e) { ui.msg = { e: 1, t: '檔案內容無法讀取，請確認是正確的 JSON 檔。' }; return route(); }
  if (o && o.encrypted === true) {
    const bad = o.app !== DB.APP ? '這不是資產紀錄的備份檔，無法匯入。' : !(o.version >= 1) ? '備份檔的資料格式不正確，無法匯入。' : o.version > DB.FILE_VERSION ? '這個檔案來自較新版本，請先更新 App 再匯入。'
      : !Crypt.available() ? '這個環境不支援解密，請用 https 網址開啟。' : Crypt.checkEnvelope(o);
    if (bad) { ui.msg = { e: 1, t: bad }; return route(); }
    ui.panel = { k: 'pw', env: o }; return route();
  }
  return previewImport(o);
}

/* ---------- 事件 ---------- */
document.addEventListener('click', async e => {
  if (e.target.closest('[data-lock]')) { e.preventDefault(); Lock.lock(); return; }
  const mod = PAGE_MOD[curPage()];
  if (mod) { try { const r = await mod.click(e); if (r === true) { await route(); return; } if (r === 'stay') return; } catch (err) { ui.msg = { e: 1, t: '操作失敗：' + esc(err.message || err) }; await route(); return; } }
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, c = b.dataset.c;
  if (a === 'imp') { $('#file').click(); return; }
  ui.msg = null;
  try {
    if (a === 'ex') { if ((await doExport()) === false) return; }
    else if (a === 'pc') ui.panel = null;
    else if (a === 'iok') {
      const mode = $('[name=im]:checked').value, P = ui.panel, n = await DB.importAll(P.o.data, mode);
      ui = { panel: null, rmsg: null, msg: { t: mode === 'replace' ? `已完整還原：共 ${P.pv.sum.total} 筆記錄。` : `已合併匯入：新增 ${P.pv.sum.add} 筆、更新 ${P.pv.sum.upd} 筆。` } };
    }
    else if (a === 'rr') { ui.rmsg = { t: '正在更新匯率…' }; route(); const r = await RATES.refresh(); ui.rmsg = r.ok ? { t: '匯率已更新。' } : { e: 1, t: r.msg }; }
    else if (a === 'rset') { if (!(await RATES.setManual(c, $('#rin-' + c).value))) { $('#rerr-' + c).textContent = '請輸入大於 0 的數字'; return; } ui.rmsg = { t: '已設定手動匯率。' }; }
    else if (a === 'rclr') { await RATES.clearManual(c); ui.rmsg = { t: '已恢復使用自動匯率。' }; }
    else if (a === 'sample') { const S = SAMPLE(); for (const s of DB.STORES) for (const r of S[s]) await DB.put(s, r); ui.msg = { t: '已載入範例資料。' }; }
    else if (a === 'pwok') {
      const env = ui.panel.env, pw = $('#pwd').value, e = t => { $('#pwerr').textContent = t; };
      if (!pw) return e('請輸入備份密碼');
      e('正在解密…');
      let data; try { data = await Crypt.decryptJSON(env, pw); } catch (err) { return e('密碼不正確，或檔案已被修改。'); }
      return previewImport({ app: env.app, version: env.version, exportedAt: env.exportedAt, data });
    }
    else if (a === 'pinset' || a === 'pinchg' || a === 'pinoff') { if (!Crypt.available()) { ui.msg = { e: 1, t: '這個環境不支援加密與 PIN 鎖，請用 https 網址開啟。' }; } else ui.panel = { k: 'pin', mode: a === 'pinset' ? 'set' : a === 'pinchg' ? 'change' : 'off' }; }
    else if (a === 'pinok') {
      const m = ui.panel.mode, e = t => { $('#pinerr').textContent = t; }, pin1 = m === 'off' ? '' : $('#pin1').value, pin2 = m === 'off' ? '' : $('#pin2').value;
      if (m !== 'off' && !/^\d{4,8}$/.test(pin1)) return e('PIN 要是 4 到 8 位數字');
      if (m !== 'off' && pin1 !== pin2) return e('兩次輸入的 PIN 不一樣');
      if (m !== 'set') { const r = await Lock.verify($('#pin0').value); if (!r.ok) return e(r.wait ? `嘗試太多次，請等 ${r.wait} 秒後再試。` : '目前的 PIN 不正確'); }
      if (m === 'off') { await Lock.disable(); ui.msg = { t: 'App 鎖已關閉。' }; } else { await Lock.setPin(pin1); ui.msg = { t: m === 'set' ? 'PIN 已設定。App 之後開啟時需要輸入 PIN。' : 'PIN 已變更。' }; }
      ui.panel = null;
    }
    else if (a === 'locknow') { Lock.lock(); return; }
    else if (a === 'wipe') ui.panel = { k: 'wipe' };
    else if (a === 'wok') { await DB.clearAll(); ui.panel = null; ui.msg = { t: '已清除全部資料。' }; }
    else return;
  } catch (err) { ui.msg = { e: 1, t: '操作失敗：' + esc(err.message || err) }; }
  route();
});
document.addEventListener('input', e => PAGE_MOD[curPage()]?.input?.(e));
document.addEventListener('keydown', e => PAGE_MOD[curPage()]?.keydown?.(e));
document.addEventListener('change', async e => {
  const x = e.target, mod = PAGE_MOD[curPage()];
  if (mod?.change && mod.change(e) === true) { await route(); return; }
  if (x.id === 'enc') { encOn = x.checked; route(); return; }
  if (x.id === 'auto') { await Lock.setAuto(+x.value); ui.msg = { t: '已更新自動鎖定時間。' }; route(); return; }
  if (x.id === 'rm') { remind = +x.value; await DB.setMeta('settings', { remind }); route(); }
  if (x.id === 'file') { const f = x.files[0]; x.value = ''; if (f) readImport(f); }
  if (x.name === 'im') { $('#imw').hidden = x.value !== 'replace'; $('#imm').hidden = x.value === 'replace'; }
});
addEventListener('hashchange', () => { ui = { panel: null, msg: null, rmsg: null }; Object.values(PAGE_MOD).forEach(m => m.reset()); route(); });
(async () => {
  try { remind = (await DB.getMeta('settings'))?.remind ?? 14; await RATES.load(); } catch (e) {}
  let locked = false;
  try { locked = await Lock.init(); } catch (e) {}
  if (!locked) await route();
  RATES.autoRefresh().then(r => { if (r && location.hash.startsWith('#/settings')) route(); }).catch(() => {});
})();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
