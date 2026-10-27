/* 金額與數字工具。
   儲存規則（避免浮點誤差）：
   - 金額：整數「最小單位」＝ 實際金額 × 100（TWD、USD、JPY 一律 ×100，顯示時再四捨五入）
   - 股數：整數 ＝ 實際股數 × 10000（美股可到小數 4 位）
   - 股價、平均成本：整數 ＝ 實際價格 × 100
   - 年利率：整數 ＝ 實際百分比 × 1000（1.6% 存成 1600）
   - 匯率不是金額，用一般小數。 */
const CUR = { TWD: { sym: 'NT$', dec: 0 }, USD: { sym: 'US$', dec: 2 }, JPY: { sym: '¥', dec: 0 } };
const CURS = Object.keys(CUR);

// 十進位字串 → 放大 10^dec 倍的整數（第 dec+1 位四捨五入）。格式錯誤、超出安全範圍回傳 null。
function parseDec(s, dec) {
  s = String(s ?? '').trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s[0] === '-', [i, f = ''] = s.replace('-', '').split('.');
  let v = BigInt(i) * 10n ** BigInt(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || '0');
  if (f.length > dec && f[dec] >= '5') v += 1n;
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(neg ? -v : v);
}
// 整數 → 十進位字串（去掉多餘的 0）
function fmtDec(n, dec, maxFrac = dec) {
  const neg = n < 0, a = Math.abs(n), p = 10 ** dec, i = Math.floor(a / p), f = String(a % p).padStart(dec, '0').slice(0, maxFrac).replace(/0+$/, '');
  return (neg ? '−' : '') + i.toLocaleString('en-US') + (f ? '.' + f : '');
}
const parseMinor = s => parseDec(s, 2), parseShares = s => parseDec(s, 4), parsePrice = s => parseDec(s, 2), parseRate = s => parseDec(s, 3);
// 金額顯示：NT$ 1,234／US$ 1,234.56
function fmtMinor(m, cur) {
  const c = CUR[cur] || CUR.TWD, neg = m < 0, a = Math.abs(m);
  const v = c.dec ? fmtDec(a, 2, 2).replace(/\.00$/, '') : Math.round(a / 100).toLocaleString('en-US');
  return (neg ? '−' : '') + c.sym + ' ' + v;
}
const fmtShares = n => fmtDec(n, 4), fmtPrice = n => fmtDec(n, 2), fmtRate = n => fmtDec(n, 3);
// 乘除（整數運算，四捨五入），避免中間值超出安全範圍：round(a × b ÷ d)
function mulDiv(a, b, d) { const n = BigInt(a) * BigInt(b), q = BigInt(d), neg = n < 0n; const r = ((neg ? -n : n) * 2n + q) / (2n * q); return Number(neg ? -r : r); }
// 外幣最小單位 → TWD 最小單位（rate 為「1 單位外幣 = 多少 TWD」；沒有匯率回傳 null）
function toTWD(minor, cur, rate) { if (cur === 'TWD') return minor; if (!(rate > 0)) return null; return Math.round(minor * rate); }
