/* 測試用範例資料（階段 1 專用，正式版會移除）。金額依 money.js 的整數規則儲存。 */
const SAMPLE = () => {
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), ago = n => iso(new Date(Date.now() - n * 864e5)), ahead = n => ago(-n);
  const m = s => parseMinor(String(s)), id = p => DB.uid(p);
  return {
    accounts: [
      { id: id('a'), t: 'D', bank: '台新銀行', n: 'Richart 活存', c: 'TWD', v: m(850000), note: '', at: ago(12) },
      { id: id('a'), t: 'D', bank: '永豐銀行', n: '美元活存', c: 'USD', v: m(12000), note: '', at: ago(12) },
      { id: id('a'), t: 'T', bank: '國泰世華', n: '', c: 'TWD', v: m(1000000), note: '', at: ago(30), rate: parseRate('1.6'), start: ago(316), mat: ahead(49) }],
    holdings: [
      { id: id('h'), m: 'TW', sym: '2330', n: '台積電', sh: parseShares('1000'), cost: parsePrice('620'), price: parsePrice('1050'), at: ago(12), note: '' },
      { id: id('h'), m: 'US', sym: 'VOO', n: 'Vanguard S&P 500 ETF', sh: parseShares('8.25'), cost: parsePrice('410.2'), price: parsePrice('520.4'), at: ago(12), note: '' }],
    others: [{ id: id('o'), k: 'fund', n: '全球股票基金', c: 'TWD', v: m(300000), note: '', at: ago(12) }],
    insurance: [{ id: id('i'), k: '醫療險', co: '富邦人壽', n: '實支實付醫療險', who: '本人', c: 'TWD', prem: m(1850), mo: 1, due: ahead(9), end: '', note: '', ad: +ahead(9).slice(8) }],
    plans: [{ id: id('p'), name: '日本旅遊基金', target: m(300000), date: ahead(240), note: '', mode: 'manual', src: [], amt: m(120000), at: ago(12) }],
    snapshots: []
  };
};
