import {
  json, rowToCase, caseFromBody, getIdentity, viewerHash, uniqueCaseName,
  authorizeCaseWrite, actorLabel, deleteR2, validateCardText, textToLines, linesToText,
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
  const cardTextErr = validateCardText(body);
  if (cardTextErr) return json({ error: cardTextErr }, 400);

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
  let sql = `UPDATE cases
        SET name=?, presenter_id=?, view_key=?, case_no=?, case_no_public=?,
            plaintiff_name=?, defendant_name=?,
            judge=?, points=?, call_text=?,
            contact=?, press=?,
            plaintiff_links=?, defendant_links=?, tags=?,
            related_case_ids=?, archived_at=?, close_type=?, board_enabled=?, board_restricted=?,
            updated_by=?, updated_at=?`;
  const bind = [c.name, c.presenter_id, c.view_key, c.case_no, c.case_no_public,
         c.plaintiff_name, c.defendant_name,
         c.judge, c.points, c.call_text,
         c.contact, c.press,
         c.plaintiff_links, c.defendant_links, c.tags,
         c.related_case_ids, c.archived_at, c.close_type, c.board_enabled, c.board_restricted,
         actor, new Date().toISOString()];
  // カードの文言・検索結果の見え方（空欄で保存すると自動に戻る）。送られてこなかったキーには
  // 触らない＝別画面からの更新で消えないようにする（presenters/[id].js の同種フィールドと同じ
  // ガード。2026-09-11、case-edit.html の通常保存は cardHeadline/cardSub/cardMessage を送らない
  // ため、caseFromBody 経由の一律null化のままだと保存のたびにNULLへ巻き戻っていた不備の修正）
  for (const [key, col] of [
    ["cardHeadline", "card_headline"], ["cardSub", "card_sub"], ["cardMessage", "card_message"],
    ["seoTitle", "seo_title"], ["seoDescription", "seo_description"],
  ]) {
    if (typeof body[key] === "string") {
      sql += `, ${col}=?`;
      bind.push(body[key].trim() || null);
    }
  }
  sql += ` WHERE id=?`;
  bind.push(cid);
  const res = await env.DB.prepare(sql).bind(...bind).run();
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
//
// ※schema.sqlの外部キーにON DELETE CASCADEは無い（D1でのFK制約強制も前提にしていない）ので、
//   case_id／event_idでこの事件にぶら下がる新しいテーブルを足したときは、必ずこのbatch()にも
//   DELETE文を足すこと（忘れると、そのテーブルにだけ孤児レコードが残り続ける。2026-09-11）。
//
// D1側の削除は env.DB.batch() で1回にまとめて呼ぶ（D1がまとめて原子的に実行するので、
// 途中の1文が失敗してもデータベースは変化しない）。子テーブル（posts・event_bookmarks）は
// 期日idを1つずつ並べたIN句ではなく「この事件の期日」を都度引くサブクエリにする
// （期日が100件を超えるとD1のバインド変数の上限[100]を超えてしまうため）。
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(
    `SELECT notice_r2_key, card_r2_key, card_square_r2_key FROM cases WHERE id = ?`
  ).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  // R2のキーは、D1の行を消してしまうと拾えなくなるので、batchの前に集めておく（3クエリは互いに
  // 独立なので並行に投げる）。related_case_ids はUUID同士の部分一致誤爆を避けるため改行区切りの
  // 完全一致で絞り込む（LIKEは候補を広めに拾うだけの一次フィルタ）
  const [{ results: mats }, { results: imgs }, { results: referrers }] = await Promise.all([
    env.DB.prepare(`SELECT r2_key FROM materials WHERE case_id = ?`).bind(cid).all(),
    env.DB.prepare(`SELECT r2_key, web_r2_key FROM case_images WHERE case_id = ?`).bind(cid).all(),
    env.DB.prepare(`SELECT id, related_case_ids FROM cases WHERE related_case_ids LIKE ?`).bind(`%${cid}%`).all(),
  ]);
  const r2Keys = [
    ...(mats || []).map((m) => m.r2_key),
    // 1枚の写真アップロードは r2_key と web_r2_key が同じキーを指すことがあるため重複削除を避ける
    ...new Set((imgs || []).flatMap((i) => [i.r2_key, i.web_r2_key])),
    cur.notice_r2_key, cur.card_r2_key, cur.card_square_r2_key,
  ];

  // この事件を「関連裁判」として挙げている他事件があれば、削除に合わせてそちらの参照も外す
  // （外さないと、消えたはずの事件idが related_case_ids にゴミとして残り続ける。2026-09-11）
  const relatedUpdates = (referrers || [])
    .map((r) => ({ id: r.id, ids: textToLines(r.related_case_ids) }))
    .filter((r) => r.ids.includes(cid))
    .map((r) => ({ id: r.id, text: linesToText(r.ids.filter((x) => x !== cid)) || null }));

  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM posts WHERE event_id IN (SELECT id FROM events WHERE case_id = ?)`).bind(cid),
    env.DB.prepare(`DELETE FROM event_bookmarks WHERE event_id IN (SELECT id FROM events WHERE case_id = ?)`).bind(cid),
    env.DB.prepare(`DELETE FROM events WHERE case_id = ?`).bind(cid),
    env.DB.prepare(`DELETE FROM materials WHERE case_id = ?`).bind(cid),
    env.DB.prepare(`DELETE FROM case_images WHERE case_id = ?`).bind(cid),
    env.DB.prepare(`DELETE FROM likes WHERE case_id = ?`).bind(cid),
    ...relatedUpdates.map((u) => env.DB.prepare(`UPDATE cases SET related_case_ids=? WHERE id=?`).bind(u.text, u.id)),
    env.DB.prepare(`DELETE FROM cases WHERE id = ?`).bind(cid),
  ]);
  const caseDeleteRes = results[results.length - 1];
  if (!caseDeleteRes.meta || caseDeleteRes.meta.changes === 0) return json({ error: "not found" }, 404);

  // R2の削除はD1のbatchが成功した後にする。ベストエフォート（1件失敗してもリクエスト自体は
  // 失敗させない）だが、失敗は握りつぶさずログに残し、件数を応答に含める
  const r2Failed = await deleteR2(env, r2Keys, "case:" + cid);
  return json(r2Failed ? { ok: true, r2Failed } : { ok: true });
}
