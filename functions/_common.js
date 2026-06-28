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
  // Access 未設定（ローカル開発など）
  const dev = String(env.DEV_EMAIL || "").toLowerCase();
  return { email: dev || null, viaAccess: false };
}

// 書き込み権限の判定
// 第1段階: OWNER_EMAIL のみ true / 第2段階: ALLOW_ALL_WRITES="true" で全員 true
export function canWrite(email, env) {
  if (!email) return false;
  if (String(env.ALLOW_ALL_WRITES).toLowerCase() === "true") return true;
  return email === String(env.OWNER_EMAIL || "").toLowerCase();
}
