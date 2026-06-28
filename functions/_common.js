// 共有ヘルパー（_ 始まりなのでルートにはならず、各APIから import して使う）

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

// DBの1行を、画面が扱う形（case など）に変換
export function rowToEvent(r) {
  return {
    id: r.id,
    case: r.case_name,
    date: r.date,
    time: r.time || "",
    type: r.type || "",
    place: r.place || "",
    note: r.note || "",
    createdBy: r.created_by || "",
    updatedBy: r.updated_by || "",
    updatedAt: r.updated_at || "",
  };
}

// ---- base64url ----
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlToString(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}

// JWKS（公開鍵）を isolate 内でキャッシュ
let JWKS_CACHE = null; // { domain, keys }

async function getKeys(teamDomain) {
  if (JWKS_CACHE && JWKS_CACHE.domain === teamDomain) return JWKS_CACHE.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("JWKS fetch failed: " + res.status);
  const data = await res.json();
  JWKS_CACHE = { domain: teamDomain, keys: data.keys || [] };
  return JWKS_CACHE.keys;
}

// Cloudflare Access が付与する JWT を検証して payload を返す
async function verifyAccessJwt(token, env) {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN; // 例: yourteam.cloudflareaccess.com
  const aud = env.CF_ACCESS_AUD;                // Access アプリの Application Audience (AUD) タグ
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed jwt");
  const header = JSON.parse(b64urlToString(parts[0]));
  const payload = JSON.parse(b64urlToString(parts[1]));

  const keys = await getKeys(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("signing key not found");

  const key = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"]
  );
  const sig = b64urlToBytes(parts[2]);
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, signed);
  if (!ok) throw new Error("bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("token expired");
  if (payload.iss && payload.iss !== `https://${teamDomain}`) throw new Error("bad issuer");
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (aud && !auds.includes(aud)) throw new Error("bad audience");
  return payload;
}

// リクエストからログインユーザーのメールを取り出す
// 本番: Access の JWT を検証 / ローカル開発: DEV_EMAIL を使う
export async function getIdentity(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (token && env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD) {
    try {
      const payload = await verifyAccessJwt(token, env);
      return { email: String(payload.email || "").toLowerCase(), viaAccess: true };
    } catch (e) {
      return { email: null, viaAccess: true, error: e.message };
    }
  }
  // ローカル開発時のみ: .dev.vars に LOCAL_DEV="true" があるときだけ DEV_EMAIL を擬似ログインとして使う。
  // 本番(Pages)では LOCAL_DEV を設定しないので、Access 未設定 or JWT 無しは「未認証＝書き込み不可」になる。
  if (String(env.LOCAL_DEV).toLowerCase() === "true") {
    const dev = String(env.DEV_EMAIL || "").toLowerCase();
    return { email: dev || null, viaAccess: false };
  }
  return { email: null, viaAccess: false };
}

// 書き込み権限の判定。次のどちらかを満たせば許可：
//  (A) 編集パスワード一致（公開運用の基本。ヘッダ X-Edit-Key が EDIT_PASSWORD と一致）
//  (B) 将来 Access を入れた場合のログイン許可（email が OWNER_EMAIL、または ALLOW_ALL_WRITES="true"）
export function authorizeWrite(request, env, identity) {
  // (A) 編集パスワード（保存時の末尾改行などに備え前後空白を除去して比較）
  const key = request.headers.get("X-Edit-Key");
  const pw = env.EDIT_PASSWORD ? String(env.EDIT_PASSWORD).trim() : "";
  if (pw && key && key.trim() === pw) return true;
  // (B) Access ログイン（将来用。今は identity.email は null）
  if (identity && identity.email) {
    if (String(env.ALLOW_ALL_WRITES).toLowerCase() === "true") return true;
    if (identity.email === String(env.OWNER_EMAIL || "").toLowerCase()) return true;
  }
  return false;
}
