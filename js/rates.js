/* 匯率：自動取得（open.er-api.com，免金鑰）＋手動覆蓋；離線沿用上次的值。
   匯率定義：1 單位外幣 = 多少 TWD。沒有任何匯率時回傳 null（畫面要提示，不能悄悄用錯的數字）。 */
const RATES = (() => {
  const URL = 'https://open.er-api.com/v6/latest/USD', STALE = 12 * 36e5, FOREIGN = ['USD', 'JPY'];
  let R = {};
  const blank = () => ({ auto: null, manual: null, updatedAt: 0 });
  async function load() { const m = (await DB.getMeta('rates')) || {}; R = {}; FOREIGN.forEach(c => R[c] = { ...blank(), ...(m[c] || {}) }); return R; }
  const save = () => DB.setMeta('rates', R);
  const info = c => R[c] || blank();
  const rate = c => c === 'TWD' ? 1 : (info(c).manual || info(c).auto || null);
  const source = c => c === 'TWD' ? '' : info(c).manual ? 'manual' : info(c).auto ? 'auto' : '';
  const map = () => ({ TWD: 1, USD: rate('USD'), JPY: rate('JPY') });
  // 向服務取得最新匯率；失敗時保留舊值並回傳原因
  async function refresh() {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const res = await fetch(URL, { signal: ctl.signal }); clearTimeout(to);
      if (!res.ok) return { ok: false, msg: `匯率服務回應錯誤（HTTP ${res.status}）` };
      const j = await res.json(), tw = j?.rates?.TWD, jp = j?.rates?.JPY;
      if (j?.result !== 'success' || !(tw > 0) || !(jp > 0)) return { ok: false, msg: '匯率服務回傳的內容無法使用' };
      const now = Date.now();
      R.USD = { ...info('USD'), auto: tw, updatedAt: now }; R.JPY = { ...info('JPY'), auto: tw / jp, updatedAt: now };
      await save(); return { ok: true };
    } catch (e) { return { ok: false, msg: '無法連線，沿用上次的匯率' }; }
  }
  // 連得上網且超過 12 小時沒更新才自動更新（背景執行，不打擾）
  async function autoRefresh() {
    const last = Math.max(0, ...FOREIGN.map(c => info(c).updatedAt));
    if (navigator.onLine !== false && Date.now() - last > STALE) return refresh();
    return null;
  }
  async function setManual(c, s) {
    const v = Number(String(s).trim().replace(/,/g, ''));
    if (!String(s).trim() || !isFinite(v) || !(v > 0)) return false;
    R[c] = { ...info(c), manual: v }; await save(); return true;
  }
  async function clearManual(c) { R[c] = { ...info(c), manual: null }; await save(); }
  return { FOREIGN, load, rate, map, info, source, refresh, autoRefresh, setManual, clearManual };
})();
