import {
  json, rowToCase, caseFromBody, getIdentity, viewerHash, uniqueCaseName,
  authorizeCaseWrite, actorLabel,
} from "../../_common.js";
import { casesSelect } from "../cases.js";

// 更新（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const c = caseFromBody(body);
  if (!c.name) return json({ error: "事件名は必須です" }, 400);

  // 事件名が重複していたら、エラーで止めずに全角の連番を振って回避する（2026-08-28）
  c.name = await uniqueCaseName(env, c.name, cid);

  if (!auth.admin) {
    // 問題提起人は、自分の事件を別の問題提起人へ付け替えることはできない
    // （どんな値が送られてきても、いまの presenter_id をそのまま使う。付け替えは運営のみ）
    const cur = await env.DB.prepare(`SELECT presenter_id FROM cases WHERE id = ?`).bind(cid).first();
    c.presenter_id = cur ? cur.presenter_id : null;
  } else if (c.presenter_id) {
    const pr = await env.DB.prepare(`SELECT id FROM presenters WHERE id = ?`).bind(c.presenter_id).first();
    if (!pr) return json({ error: "ニックネームが見つかりません" }, 400);
  }

  const actor = actorLabel(id, auth);
  const res = await env.DB.prepare(
    `UPDATE cases
        SET name=?, presenter_id=?, view_key=?, case_no=?, case_no_public=?,
            plaintiff_name=?, defendant_name=?,
            judge=?, points=?, call_text=?,
            contact=?, press=?,
            plaintiff_links=?, defendant_links=?, tags=?,
            related_case_ids=?, archived_at=?, close_type=?, board_enabled=?, board_restricted=?,
            card_headline=?, card_sub=?, card_message=?, seo_title=?, seo_description=?,
            updated_by=?, updated_at=?
      WHERE id=?`
  ).bind(c.name, c.presenter_id, c.view_key, c.case_no, c.case_no_public,
         c.plaintiff_name, c.defendant_name,
         c.judge, c.points, c.call_text,
         c.contact, c.press,
         c.plaintiff_links, c.defendant_links, c.tags,
         c.related_case_ids, c.archived_at, c.close_type, c.board_enabled, c.board_restricted,
         c.card_headline, c.card_sub, c.card_message, c.seo_title, c.seo_description,
         actor, new Date().toISOString(), cid).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  const viewer = (await viewerHash(request)) || "";
  const row = await env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind(viewer, cid).first();
  return json(rowToCase(row));
}

// 削除（運営、またはその事件のご本人）。中身（期日・掲示板の投稿・資料・写真・いいね）と
// R2に置いたファイルもまとめて消す（2026-09-10）。
// それまでは運営だけができ、期日・資料が1件でも残っていると「先に消してください」と断っていたが、
// 当事者が自分の事件を自分で片付けられるようにした（掲示板に他の人が書いた応援メッセージが
// あっても、当事者の判断で消してよい、という整理）。取り消せないので、画面側は消える中身の
// 件数を並べて確認してから呼ぶこと。
async function deleteR2(env, keys) {
  if (!env.FILES) return;
  await Promise.all(keys.filter(Boolean).map((k) => env.FILES.delete(k).catch(() => {})));
}
// D1 には配列をそのまま渡せないので、? を並べた IN 句を組む
function inClause(ids) {
  return ids.map(() => "?").join(",");
}

export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(
    `SELECT notice_r2_key, card_r2_key, card_square_r2_key FROM cases WHERE id = ?`
  ).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  // 期日と、その期日にぶら下がる掲示板の投稿・お気に入り
  const { results: evs } = await env.DB.prepare(`SELECT id FROM events WHERE case_id = ?`).bind(cid).all();
  const eventIds = (evs || []).map((e) => e.id);
  if (eventIds.length) {
    await env.DB.prepare(`DELETE FROM posts WHERE event_id IN (${inClause(eventIds)})`).bind(...eventIds).run();
    await env.DB.prepare(`DELETE FROM event_bookmarks WHERE event_id IN (${inClause(eventIds)})`).bind(...eventIds).run();
  }
  await env.DB.prepare(`DELETE FROM events WHERE case_id = ?`).bind(cid).run();

  // 資料・写真は、D1の行を消す前にR2のファイルを消す
  const { results: mats } = await env.DB.prepare(`SELECT r2_key FROM materials WHERE case_id = ?`).bind(cid).all();
  await deleteR2(env, (mats || []).map((m) => m.r2_key));
  await env.DB.prepare(`DELETE FROM materials WHERE case_id = ?`).bind(cid).run();

  const { results: imgs } = await env.DB.prepare(`SELECT r2_key, web_r2_key FROM case_images WHERE case_id = ?`).bind(cid).all();
  await deleteR2(env, (imgs || []).flatMap((i) => [i.r2_key, i.web_r2_key]));
  await env.DB.prepare(`DELETE FROM case_images WHERE case_id = ?`).bind(cid).run();

  await env.DB.prepare(`DELETE FROM likes WHERE case_id = ?`).bind(cid).run();

  const res = await env.DB.prepare(`DELETE FROM cases WHERE id = ?`).bind(cid).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  // 期日案内・カード画像（事件そのものに付いている1枚もの）
  await deleteR2(env, [cur.notice_r2_key, cur.card_r2_key, cur.card_square_r2_key]);
  return json({ ok: true });
}
