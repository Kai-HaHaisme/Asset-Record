/* IndexedDB 資料層。
   資料表（每筆記錄都有字串 id 與 updatedAt 毫秒；可手動排序的資料表另有數字 ord）：
   accounts 存款 ／ holdings 股票 ／ others 債券、基金與其他資產 ／ insurance 保險 ／ plans 計畫 ／ snapshots 資產快照
   meta：modifiedAt（資料最後修改）、lastBackupAt、settings、rates
   金額、股數、利率的整數儲存規則見 money.js。
   資料庫結構變動時：提高 DB_VERSION，並在 onupgradeneeded 加遷移，不能讓舊資料消失。 */
const DB = (() => {
  const APP = 'asset-tracker';        // 匯出檔的 app 識別（不可與旅遊規劃相同）
  const FILE_VERSION = 1;             // 匯出檔格式版本
  const DB_NAME = 'asset-tracker';    // 資料庫名稱（不可與旅遊規劃相同）
  const DB_VERSION = 2;
  const STORES = ['accounts', 'holdings', 'others', 'insurance', 'plans', 'snapshots'];
  const ORDERED = ['accounts', 'holdings', 'others', 'insurance', 'plans'];
  const LABEL = { accounts: '存款', holdings: '股票', others: '債券、基金與其他資產', insurance: '保險', plans: '計畫', snapshots: '資產快照' };
  // 欄位規格：型別後面加 ? 代表可省略（日期可為空字串）。沒列出的欄位不檢查。
  const SCHEMA = {
    accounts: { t: 'enum:D|T', bank: 'str', n: 'str?', c: 'cur', v: 'int', note: 'str?', at: 'date?', rate: 'int?', start: 'date?', mat: 'date?', ord: 'num?' },
    holdings: { m: 'enum:TW|US', sym: 'str', n: 'str', sh: 'int', cost: 'int', price: 'int', at: 'date', note: 'str?', ord: 'num?' },
    others: { k: 'enum:bond|fund|other', n: 'str', c: 'cur', v: 'int', note: 'str?', at: 'date?', ord: 'num?' },
    insurance: { k: 'str', co: 'str', n: 'str?', who: 'str?', c: 'cur', prem: 'int', mo: 'int', due: 'date', end: 'date?', note: 'str?', ad: 'int?', ord: 'num?' },
    plans: { name: 'str', target: 'int', date: 'date?', note: 'str?', mode: 'enum:link|manual', src: 'arr', amt: 'int?', at: 'date?', ord: 'num?' },
    snapshots: { date: 'date', cash: 'int', stock: 'int', bond: 'int', other: 'int', total: 'int', note: 'str?', items: 'arr?', rates: 'obj?' }
  };
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
  function okType(v, t) {
    const opt = t.endsWith('?'), b = opt ? t.slice(0, -1) : t;
    if (v === undefined || v === null) return opt;
    if (opt && v === '' && b === 'date') return true;
    if (b === 'str') return typeof v === 'string';
    if (b === 'int') return Number.isSafeInteger(v);
    if (b === 'num') return typeof v === 'number' && isFinite(v);
    if (b === 'date') return isDate(v);
    if (b === 'cur') return typeof v === 'string' && CURS.includes(v);
    if (b === 'arr') return Array.isArray(v);
    if (b === 'obj') return typeof v === 'object' && !Array.isArray(v);
    if (b.startsWith('enum:')) return b.slice(5).split('|').includes(v);
    return false;
  }
  // 檢查一筆記錄；回傳錯誤描述或 null
  function checkRow(store, r) {
    if (!r || typeof r !== 'object') return '不是物件';
    if (typeof r.id !== 'string' || !r.id) return '缺少 id';
    if (!(typeof r.updatedAt === 'number' && r.updatedAt >= 0)) return '缺少 updatedAt';
    for (const [k, t] of Object.entries(SCHEMA[store])) if (!okType(r[k], t)) return `欄位 ${k} 格式不正確`;
    return null;
  }
  let d = null;
  function open() {
    if (d) return Promise.resolve(d);
    return new Promise((ok, no) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = e => {
        const x = r.result;
        for (const s of STORES) if (!x.objectStoreNames.contains(s)) x.createObjectStore(s, { keyPath: 'id' });
        if (!x.objectStoreNames.contains('meta')) x.createObjectStore('meta');
        // v1（起始樣板）只有測試用的 records，v2 起不再使用
        if (e.oldVersion < 2 && x.objectStoreNames.contains('records')) x.deleteObjectStore('records');
      };
      r.onsuccess = () => { d = r.result; d.onversionchange = () => { d.close(); d = null; }; ok(d); };
      r.onerror = () => no(r.error);
      r.onblocked = () => no(new Error('資料庫被其他分頁佔用，請關閉其他分頁後重試'));
    });
  }
  function tx(stores, mode, fn) {
    return open().then(db => new Promise((ok, no) => {
      const t = db.transaction(stores, mode);
      let res;
      try { res = fn(t); } catch (err) { try { t.abort(); } catch (e) {} no(err); return; }
      t.oncomplete = () => ok(res && typeof res === 'object' && 'result' in res ? res.result : res);
      t.onerror = () => no(t.error);
      t.onabort = () => no(t.error);
    }));
  }
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sortRows = (s, rows) => ORDERED.includes(s)
    ? rows.sort((a, b) => (a.ord ?? 1e15) - (b.ord ?? 1e15) || a.updatedAt - b.updatedAt)
    : s === 'snapshots' ? rows.sort((a, b) => a.date.localeCompare(b.date)) : rows;
  const all = s => tx(s, 'readonly', t => t.objectStore(s).getAll()).then(r => sortRows(s, r));
  const get = (s, id) => tx(s, 'readonly', t => t.objectStore(s).get(id));
  const getMeta = k => tx('meta', 'readonly', t => t.objectStore('meta').get(k));
  const setMeta = (k, v) => tx('meta', 'readwrite', t => t.objectStore('meta').put(v, k));
  async function nextOrd(s) { return (await all(s)).reduce((m, r) => Math.max(m, r.ord ?? 0), 0) + 1; }

  // 寫入一筆記錄：驗證格式、自動補 updatedAt／ord，並更新「資料最後修改時間」（備份提醒用）
  async function put(s, row) {
    row = { ...row };
    if (ORDERED.includes(s) && row.ord === undefined) row.ord = await nextOrd(s);
    row.updatedAt = Date.now();
    const bad = checkRow(s, row);
    if (bad) throw new Error(`${s}：${bad}`);
    await tx([s, 'meta'], 'readwrite', t => { t.objectStore(s).put(row); t.objectStore('meta').put(row.updatedAt, 'modifiedAt'); });
    return row;
  }
  const del = (s, id) => tx([s, 'meta'], 'readwrite', t => { t.objectStore(s).delete(id); t.objectStore('meta').put(Date.now(), 'modifiedAt'); });
  // 依新的 id 順序重寫 ord（調整順序用）
  async function reorder(s, ids) {
    const rows = new Map((await all(s)).map(r => [r.id, r])), now = Date.now();
    await tx([s, 'meta'], 'readwrite', t => {
      ids.forEach((id, i) => { const r = rows.get(id); if (r) t.objectStore(s).put({ ...r, ord: i + 1, updatedAt: now }); });
      t.objectStore('meta').put(now, 'modifiedAt');
    });
  }
  const clearAll = () => tx([...STORES, 'meta'], 'readwrite', t => { STORES.forEach(s => t.objectStore(s).clear()); t.objectStore('meta').put(Date.now(), 'modifiedAt'); });

  // 整個資料庫匯出：{ 資料表名: [記錄...] }
  async function exportAll() { const out = {}; for (const s of STORES) out[s] = await all(s); return out; }
  // 驗證備份檔：回傳錯誤訊息，沒問題回傳 null
  function checkFile(o) {
    if (!o || o.app !== APP) return '這不是資產紀錄的備份檔，無法匯入。';
    if (!(o.version >= 1) || !o.data || typeof o.data !== 'object') return '備份檔的資料格式不正確，無法匯入。';
    if (o.version > FILE_VERSION) return '這個檔案來自較新版本，請先更新 App 再匯入。';
    for (const s of STORES) {
      const rows = o.data[s];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) return '備份檔的資料格式不正確，無法匯入。';
      const ids = new Set();
      for (const r of rows) { if (checkRow(s, r) || ids.has(r.id)) return '備份檔的資料格式不正確，無法匯入。'; ids.add(r.id); }
    }
    return null;
  }
  // 合併預覽（不寫入）：各資料表「新增／檔案較新／本機較新／相同」筆數
  async function preview(data) {
    const out = {}, sum = { add: 0, upd: 0, keep: 0, same: 0, total: 0 };
    for (const s of STORES) {
      const n = { add: 0, upd: 0, keep: 0, same: 0, total: 0 }, local = new Map((await all(s)).map(r => [r.id, r]));
      for (const r of data[s] || []) {
        n.total++;
        const l = local.get(r.id);
        if (!l) n.add++; else if (l.updatedAt < r.updatedAt) n.upd++; else if (l.updatedAt > r.updatedAt) n.keep++; else n.same++;
      }
      out[s] = n; for (const k in sum) sum[k] += n[k];
    }
    return { by: out, sum };
  }
  // 套用匯入。mode: 'merge' 合併（依 id 去重，保留較新；不會刪除任何資料）／'replace' 完整還原（先清空）
  async function importAll(data, mode) {
    const plan = {};
    let changed = 0;
    for (const s of STORES) {
      const local = new Map((await all(s)).map(r => [r.id, r]));
      plan[s] = (data[s] || []).filter(r => mode === 'replace' || !local.has(r.id) || local.get(r.id).updatedAt < r.updatedAt);
      changed += plan[s].length;
    }
    await tx([...STORES, 'meta'], 'readwrite', t => {
      for (const s of STORES) { const os = t.objectStore(s); if (mode === 'replace') os.clear(); plan[s].forEach(r => os.put(r)); }
      const m = t.objectStore('meta'), now = Date.now();
      if (mode === 'replace') { m.put(now, 'lastBackupAt'); m.put(now, 'modifiedAt'); } else if (changed) m.put(now, 'modifiedAt');
    });
    return changed;
  }
  return { APP, FILE_VERSION, STORES, ORDERED, LABEL, SCHEMA, checkRow, checkFile, uid, all, get, put, del, reorder, clearAll, getMeta, setMeta, exportAll, preview, importAll };
})();
