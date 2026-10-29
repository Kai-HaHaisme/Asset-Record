/* App 鎖（PIN）。
   - 只存 PIN 的 PBKDF2 雜湊，不存 PIN 本身；連續輸錯 5 次後暫時鎖定（30 秒起，每次加倍，最長 15 分鐘）。
   - 開啟 App 一定要輸入 PIN；離開 App（切到背景）超過設定的分鐘數後再回來也要輸入。鎖定時會把畫面上的資料從網頁中清掉。
   - 限制：這只能防止旁人隨手打開 App，不等於加密儲存；資料仍以明文存在這個瀏覽器裡。
   - 忘記 PIN 沒有後門：只能清除這個裝置的資料後重設，再用備份檔還原。 */
const Lock = (() => {
  let cfg = null, locked = false, hiddenAt = 0, timer = null;
  const FAIL_FREE = 5;
  const enabled = () => !!(cfg && cfg.enabled), isLocked = () => locked, len = () => cfg?.len || 6, autoMin = () => cfg ? (cfg.auto ?? 1) : 1;
  const load = async () => { cfg = (await DB.getMeta('lock')) || null; };

  async function setPin(pin) {
    const salt = Crypt.newSalt();
    cfg = { enabled: true, salt, iter: Crypt.PIN_ITER, hash: await Crypt.pinHash(pin, salt, Crypt.PIN_ITER), len: pin.length, auto: cfg?.auto ?? 1 };
    await DB.setMeta('lock', cfg); await DB.setMeta('lockfail', { n: 0, until: 0 });
  }
  async function disable() { cfg = null; await DB.setMeta('lock', null); await DB.setMeta('lockfail', { n: 0, until: 0 }); }
  async function setAuto(m) { cfg = { ...cfg, auto: m }; await DB.setMeta('lock', cfg); }
  // 驗證 PIN。回傳 { ok } 或 { ok:false, wait（秒，>0 代表暫時鎖定中）, left（還能錯幾次） }
  async function verify(pin) {
    const f = (await DB.getMeta('lockfail')) || { n: 0, until: 0 }, now = Date.now();
    if (f.until > now) return { ok: false, wait: Math.ceil((f.until - now) / 1000) };
    if (await Crypt.pinHash(pin, cfg.salt, cfg.iter) === cfg.hash) { await DB.setMeta('lockfail', { n: 0, until: 0 }); return { ok: true }; }
    const n = f.n + 1, sec = n >= FAIL_FREE ? Math.min(900, 30 * 2 ** (n - FAIL_FREE)) : 0;
    await DB.setMeta('lockfail', { n, until: sec ? now + sec * 1000 : 0 });
    return { ok: false, wait: sec, left: Math.max(0, FAIL_FREE - n) };
  }

  /* 鎖定畫面 */
  function overlay() {
    let d = $('#lock'); if (d) return d;
    d = document.createElement('div'); d.id = 'lock'; d.hidden = true; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="lk"><h1>資產紀錄</h1><div class="mt">請輸入 PIN</div><input id="lk-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN"><div class="err" id="lk-err"></div><button class="btn main" id="lk-go">解鎖</button>
      <div style="margin-top:14px"><a href="#" id="lk-forgot">忘記 PIN？</a></div>
      <div class="panel w" id="lk-reset" hidden><div class="mt">忘記 PIN 只能清除這個裝置上的所有資料後重設。清除之後可以用備份檔還原（備份檔如果有加密，要用當初設定的備份密碼）。</div><div class="r"><button class="btn sm" id="lk-cancel">取消</button><button class="btn main sm" id="lk-wipe">清除資料並重設</button></div></div></div>`;
    document.body.append(d);
    const input = $('#lk-pin');
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); if (cfg && input.value.length === cfg.len) tryUnlock(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
    $('#lk-go').addEventListener('click', tryUnlock);
    $('#lk-forgot').addEventListener('click', e => { e.preventDefault(); $('#lk-reset').hidden = false; });
    $('#lk-cancel').addEventListener('click', () => { $('#lk-reset').hidden = true; });
    $('#lk-wipe').addEventListener('click', async () => { await DB.clearAll(); await disable(); unlock(); });
    return d;
  }
  function showWait(sec) {
    clearInterval(timer); const err = $('#lk-err'), go = $('#lk-go'); let left = sec;
    const tick = () => { if (left <= 0) { clearInterval(timer); err.textContent = ''; go.disabled = false; return; } err.textContent = `嘗試太多次，請等 ${left} 秒後再試。`; go.disabled = true; left--; };
    tick(); timer = setInterval(tick, 1000);
  }
  async function tryUnlock() {
    const input = $('#lk-pin'), pin = input.value, err = $('#lk-err'); if (!pin) return;
    const r = await verify(pin);
    if (r.ok) { err.textContent = ''; unlock(); return; }
    input.value = '';
    if (r.wait) showWait(r.wait); else err.textContent = r.left ? `PIN 不正確，再錯 ${r.left} 次會暫時鎖定。` : 'PIN 不正確。';
    input.focus();
  }
  function lock() {
    if (!enabled()) return;
    locked = true; ['#side', '#tabs', '#top', '#main'].forEach(s => { const e = $(s); if (e) e.innerHTML = ''; });
    const d = overlay(); d.hidden = false; $('#lk-pin').value = ''; $('#lk-err').textContent = ''; $('#lk-reset').hidden = true; $('#lk-go').disabled = false; $('#lk-pin').focus();
  }
  function unlock() { locked = false; clearInterval(timer); const d = $('#lock'); if (d) d.hidden = true; if (typeof route === 'function') route(); }
  async function init() {
    await load(); overlay();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (enabled() && !locked && autoMin() > 0 && hiddenAt && Date.now() - hiddenAt >= autoMin() * 60000) lock();
    });
    if (enabled()) lock();
    return locked;
  }
  return { init, enabled, isLocked, len, autoMin, setPin, disable, setAuto, verify, lock };
})();
