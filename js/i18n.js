/* 多語系：程式內文字維持繁體中文，切換語言時由字典翻譯畫面（找不到的文字維持繁體中文）。字典在 i18n/dict.js */
const LS = k => {
    try {
      return localStorage.getItem(k)
    } catch (e) {
      return null
    }
  },
  LSet = (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch (e) {}
  };
let LANG = LS('at-lang') || 'zh-TW',
  EX = new Map(),
  PT = [],
  DEFER = null;
const LT = () => ({
  'zh-TW': 'zh-TW',
  en: 'en-US',
  ja: 'ja-JP'
})[LANG] || 'zh-TW';
const CJK = /[\u3000-\u9fff\uff00-\uffef]/,
  rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  AT = ['placeholder', 'aria-label', 'title'];

function buildDict() {
  EX = new Map();
  PT = [];
  const c = LANG == 'en' ? 1 : LANG == 'ja' ? 2 : 0;
  if (!c) return;
  for (const d of DICT) {
    const k = d[0].trim(),
      v = (d[c] || '').trim();
    if (!v) continue;
    if (k.includes('{}')) PT.push([new RegExp('^' + k.split('{}').map(rx).join('([\\s\\S]*?)') + '$'), v, k.replace(/\{\}/g, '').length]);
    else EX.set(k, v)
  }
  PT.sort((a, b) => b[2] - a[2])
}
const q3 = s => LANG == 'en' ? s.replace(/「/g, '“').replace(/」/g, '”') : s;

function tr(s) {
  if (!LANG || LANG == 'zh-TW' || !CJK.test(s)) return s;
  const lead = s.match(/^\s*/)[0],
    trail = s.match(/\s*$/)[0],
    core = s.trim();
  if (!core) return s;
  const e = EX.get(core);
  if (e != null) return lead + e + trail;
  const r0 = trx(core);
  return r0 == null ? s : lead + r0 + trail
}

function trx(core) {
  for (const [re, v] of PT) {
    const m = core.match(re);
    if (m) {
      let q = 0;
      return q3(v.replace(/\{(\d*)\}/g, (_, n) => {
        const g = m[n ? +n : ++q];
        return g == null ? '' : tr(g)
      }))
    }
  }
  return null
}
const OT = new WeakMap(),
  OA = new WeakMap();

function tx(n) {
  const cur = n.nodeValue,
    st = OT.get(n),
    o = st && st[1] === cur ? st[0] : cur;
  if (LANG == 'zh-TW') {
    if (o !== cur) n.nodeValue = o;
    OT.delete(n);
    return
  }
  const t = tr(o);
  if (t !== cur) n.nodeValue = t;
  OT.set(n, [o, t])
}

function at(el) {
  let m = OA.get(el);
  for (const a of AT) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    m = m || {};
    const st = m[a],
      o = st && st[1] === cur ? st[0] : cur,
      t = LANG == 'zh-TW' ? o : tr(o);
    if (t !== cur) el.setAttribute(a, t);
    m[a] = [o, t]
  }
  if (m) OA.set(el, m)
}

function walk(r) {
  if (r.nodeType == 3) {
    tx(r);
    return
  }
  if (r.nodeType != 1) return;
  const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
  let n;
  while (n = w.nextNode()) tx(n);
  [r, ...r.querySelectorAll('[placeholder],[aria-label],[title]')].forEach(at)
}
new MutationObserver(rs => {
  if (LANG == 'zh-TW') return;
  for (const r of rs) {
    if (r.type == 'childList') r.addedNodes.forEach(walk);
    else if (r.type == 'characterData') tx(r.target);
    else at(r.target)
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: AT
});

function setLang(l) {
  LANG = l;
  LSet('at-lang', l);
  buildDict();
  document.documentElement.lang = l == 'zh-TW' ? 'zh-Hant' : l;
  walk(document.body);
  document.title = tr('資產紀錄');
  if (typeof route == 'function') route()
}
const applyTheme = v => {
  if (v == 'auto' || !v) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v
};

function uiSettings() {
  const l = $('#lang');
  if (l) l.value = LANG;
  const th = $('#theme');
  if (th) th.value = LS('at-theme') || 'auto';
  const b = $('#inst');
  if (!b) return;
  const sa = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  b.innerHTML = sa ? '已安裝，目前正以 App 模式執行。' : (DEFER ? '<button class="btn" id="instb">安裝成 App</button>' : '') + '<div style="margin-top:6px">Android（Chrome）：瀏覽器選單 →「安裝應用程式」或「加到主畫面」。<br>iPhone（Safari）：點下方「分享」→「加入主畫面」。</div>'
}
document.addEventListener('change', e => {
  if (e.target.id == 'lang') setLang(e.target.value);
  if (e.target.id == 'theme') {
    LSet('at-theme', e.target.value);
    applyTheme(e.target.value)
  }
});
document.addEventListener('click', async e => {
  if (e.target.id == 'instb' && DEFER) {
    DEFER.prompt();
    await DEFER.userChoice;
    DEFER = null;
    uiSettings()
  }
});
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  DEFER = e;
  uiSettings()
});
applyTheme(LS('at-theme'));
buildDict();
if (LANG != 'zh-TW') {
  document.documentElement.lang = LANG;
  walk(document.body);
  document.title = tr('資產紀錄')
}
