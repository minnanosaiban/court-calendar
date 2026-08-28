// R2 に置いたファイル配信：/files/<R2のキー> → R2 から読み出して返す（誰でも閲覧可）。
// m/ = 訴訟資料、i/ = 事件の写真、ic/ = 事件のアイコン、no/ = 期日案内（新規はJPEGのみ。制限前のPDF・PNGが残る場合あり）。ブラウザ内で開く（inline）。
// 元のファイル名は customMetadata.name に入れてあるので、保存時の名前に使う。
export async function onRequestGet({ env, params }) {
  if (!env.FILES) return new Response("not configured", { status: 500 });
  const key = (params.path || []).join("/");
  const ALLOWED_PREFIXES = ["m/", "i/", "ic/", "no/"];
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) return new Response("not found", { status: 404 });

  const obj = await env.FILES.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  const name = (obj.customMetadata && obj.customMetadata.name) || key.split("/").pop();
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  // PDF をページ内で開いたときに、別ドメインへ読み込まれないように
  headers.set("x-content-type-options", "nosniff");
  return new Response(obj.body, { headers });
}
