/* IndexedDB 資料層（起始樣板）。
   換成正式資料結構時，只需改：STORES（資料表）、DB_VERSION 與 onupgradeneeded 的遷移。
   規則：每筆記錄必須有字串 id 與 updatedAt（毫秒），合併匯入靠這兩個欄位判斷。 */
const DB = (() => {
  const APP = 'asset-tracker';        // 匯出檔的 app 識別（不可與旅遊規劃相同）
  const FILE_VERSION = 1;             // 匯出檔格式版本
  const DB_NAME = 'asset-tracker';    // 資料庫名稱（不可與旅遊規劃相同）
  const DB_VERSION = 1;
  const STORES = ['records'];         // 起始樣板：一個通用資料表，之後換成真正的資料表
  let d = null;

  function open() {
    if (d) return Promise.resolve(d);
    return new Promise((ok, no) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = e => {
        const x = r.result;
        for (const s of STORES) if (!x.objectStoreNames.contains(s)) x.createObjectStore(s, { keyPath: 'id' });
        if (!x.objectStoreNames.contains('meta')) x.createObjectStore('meta');
        // 之後資料結構變動：提高 DB_VERSION，並在這裡寫  if (e.oldVersion < 2) { ...遷移舊資料... }
      };
      r.onsuccess = () => { d = r.result; d.onversionchange = () => { d.close(); d = null; }; ok(d); };
      r.onerror = () => no(r.error);
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
  const all = s => tx(s, 'readonly', t => t.objectStore(s).getAll());
  const get = (s, id) => tx(s, 'readonly', t => t.objectStore(s).get(id));
  const getMeta = k => tx('meta', 'readonly', t => t.objectStore('meta').get(k));
  const setMeta = (k, v) => tx('meta', 'readwrite', t => t.objectStore('meta').put(v, k));

  // 寫入一筆記錄：自動更新 updatedAt 與「資料最後修改時間」（備份提醒用）
  const put = (s, row) => tx([s, 'meta'], 'readwrite', t => {
    row.updatedAt = Date.now();
    t.objectStore(s).put(row);
    t.objectStore('meta').put(row.updatedAt, 'modifiedAt');
    return row;
  });
  const del = (s, id) => tx([s, 'meta'], 'readwrite', t => {
    t.objectStore(s).delete(id);
    t.objectStore('meta').put(Date.now(), 'modifiedAt');
  });
  const clear = s => tx([s, 'meta'], 'readwrite', t => {
    t.objectStore(s).clear();
    t.objectStore('meta').put(Date.now(), 'modifiedAt');
  });

  // 整個資料庫匯出：{ 資料表名: [記錄...] }
  async function exportAll() {
    const out = {};
    for (const s of STORES) out[s] = await all(s);
    return out;
  }
  // 合併預覽：不寫入，只算「新增 / 檔案較新 / 本機較新 / 相同」各幾筆
  async function preview(data) {
    const n = { add: 0, upd: 0, keep: 0, same: 0, total: 0 };
    for (const s of STORES) {
      const local = new Map((await all(s)).map(r => [r.id, r]));
      for (const r of data[s] || []) {
        n.total++;
        const l = local.get(r.id);
        if (!l) n.add++;
        else if (l.updatedAt < r.updatedAt) n.upd++;
        else if (l.updatedAt > r.updatedAt) n.keep++;
        else n.same++;
      }
    }
    return n;
  }
  // 套用匯入。mode: 'merge' 合併（依 id 去重，保留較新）／'replace' 完整還原（先清空）
  async function importAll(data, mode) {
    const plan = {};
    let changed = 0;
    for (const s of STORES) {
      const local = new Map((await all(s)).map(r => [r.id, r]));
      plan[s] = (data[s] || []).filter(r => mode === 'replace' || !local.has(r.id) || local.get(r.id).updatedAt < r.updatedAt);
      changed += plan[s].length;
    }
    await tx([...STORES, 'meta'], 'readwrite', t => {
      for (const s of STORES) {
        const os = t.objectStore(s);
        if (mode === 'replace') os.clear();
        plan[s].forEach(r => os.put(r));
      }
      const m = t.objectStore('meta'), now = Date.now();
      if (mode === 'replace') { m.put(now, 'lastBackupAt'); m.put(now, 'modifiedAt'); }
      else if (changed) m.put(now, 'modifiedAt');
    });
    return changed;
  }
  return { APP, FILE_VERSION, STORES, uid, all, get, put, del, clear, getMeta, setMeta, exportAll, preview, importAll };
})();
