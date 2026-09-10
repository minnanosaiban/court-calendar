import { fileOwnerViewKey } from "../_common.js";

// R2 に置いたファイル配信：/files/<R2のキー> → R2 から読み出して返す。
// m/ = 訴訟資料、i/ = 事件の写真、iw/ = 同・Web用バリエーション（2026-08-30）、
// ic/ = 問題提起人のアイコン（presenters.icon_r2_key。事件のアイコンではない）、
// no/ = 期日案内（新規はJPEGのみ。制限前のPDF・PNGが残る場合あり）、
// cd/ = Twitterカード横長版、cds/ = 同・正方形版（どちらも差し替え用）。ブラウザ内で開く（inline）。
// 元のファイル名は customMetadata.name に入れてあるので、保存時の名前に使う。
// ※新しいアップロード種別を足すたびに、ここのprefixも追加すること（過去にも同種の漏れがあった）
// 非公開事件が絡む m/・i/・iw/・no/ は、その事件が非公開なら ?key= がその事件の合言葉と
// 一致しないと404にする（2026-09-11。fileOwnerViewKey参照）。ic/・cd/・cds/・pd/・pds/
// （カード画像・アイコン）はカードの共有・OGP用途なので今まで通り常に誰でも見られる
export async function onRequestGet({ request, env, params }) {
  if (!env.FILES) return new Response("not configured", { status: 500 });
  const key = (params.path || []).join("/");
  const ALLOWED_PREFIXES = ["m/", "i/", "iw/", "ic/", "no/", "cd/", "cds/", "pd/", "pds/"];
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) return new Response("not found", { status: 404 });

  const obj = await env.FILES.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  // 非公開事件のファイルは、URLの ?key= が合言葉と一致しない限り見せない
  // （既存の case.js の privacy-miss と同じ流儀：403ではなく404で「無いもの」として隠す）
  const viewKey = await fileOwnerViewKey(env, key);
  if (viewKey && new URL(request.url).searchParams.get("key") !== viewKey) {
    return new Response("not found", { status: 404 });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  // 非公開事件の正しい鍵で通った分は共有キャッシュに乗せない（他の閲覧者に配ってしまわないように。
  // card.png.js の overrideResponse と同じ考え方）。公開ファイルは今まで通りキャッシュしてよい
  headers.set("cache-control", viewKey ? "private, no-store" : "public, max-age=3600");
  const name = (obj.customMetadata && obj.customMetadata.name) || key.split("/").pop();
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  // PDF をページ内で開いたときに、別ドメインへ読み込まれないように
  headers.set("x-content-type-options", "nosniff");
  return new Response(obj.body, { headers });
}
