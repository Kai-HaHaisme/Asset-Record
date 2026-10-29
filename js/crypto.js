/* 加密工具（Web Crypto，不使用任何函式庫）。
   - 備份檔加密：密碼 → PBKDF2（SHA-256，600,000 次）→ AES-256-GCM。每次匯出都用新的隨機 salt 與 iv。
   - PIN 驗證：PBKDF2 雜湊（200,000 次）後比對；只存雜湊，不存 PIN。
   需要安全環境（https 或 localhost），否則 crypto.subtle 不存在，available() 會回傳 false。 */
const Crypt = (() => {
  const AAD = 'asset-tracker:1';                       // 綁定 app 與格式版本，換成別的檔案格式就解不開
  const ITER = 600000, PIN_ITER = 200000, MIN_ITER = 100000, MAX_ITER = 5000000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const available = () => !!(globalThis.crypto && crypto.subtle && crypto.getRandomValues);
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  async function baseKey(secret) { return crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey', 'deriveBits']); }
  async function aesKey(pw, salt, iter) {
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, await baseKey(pw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  // 把資料物件加密成可寫進備份檔的結構
  async function encryptJSON(obj, pw) {
    const salt = rand(16), iv = rand(12), key = await aesKey(pw, salt, ITER);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(AAD) }, key, enc.encode(JSON.stringify(obj))));
    return { kdf: { name: 'PBKDF2', hash: 'SHA-256', iter: ITER, salt: b64(salt) }, cipher: { name: 'AES-GCM', iv: b64(iv) }, data: b64(ct) };
  }
  // 檢查加密檔的結構（在要求輸入密碼之前先擋掉明顯壞掉或惡意的檔案）；回傳錯誤訊息或 null
  function checkEnvelope(o) {
    try {
      const k = o.kdf, c = o.cipher;
      if (!k || k.name !== 'PBKDF2' || k.hash !== 'SHA-256' || !Number.isInteger(k.iter) || k.iter < MIN_ITER || k.iter > MAX_ITER) return '加密備份檔的格式不正確，無法匯入。';
      if (!c || c.name !== 'AES-GCM' || typeof o.data !== 'string' || !o.data) return '加密備份檔的格式不正確，無法匯入。';
      const salt = unb64(k.salt), iv = unb64(c.iv);
      if (salt.length < 16 || salt.length > 64 || iv.length !== 12) return '加密備份檔的格式不正確，無法匯入。';
      return null;
    } catch (e) { return '加密備份檔的格式不正確，無法匯入。'; }
  }
  // 解密；密碼錯誤或檔案被改過會丟出 Error('bad')
  async function decryptJSON(env, pw) {
    try {
      const key = await aesKey(pw, unb64(env.kdf.salt), env.kdf.iter);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.cipher.iv), additionalData: enc.encode(AAD) }, key, unb64(env.data));
      return JSON.parse(dec.decode(pt));
    } catch (e) { throw new Error('bad'); }
  }
  async function pinHash(pin, saltB64, iter) {
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, await baseKey(pin), 256);
    return b64(new Uint8Array(bits));
  }
  const newSalt = () => b64(rand(16));
  return { available, encryptJSON, decryptJSON, checkEnvelope, pinHash, newSalt, PIN_ITER, ITER };
})();
