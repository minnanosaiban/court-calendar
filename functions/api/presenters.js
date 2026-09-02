import {
  json, newId, rowToPresenter, PRESENTER_COLS,
  getIdentity, authorizeWrite, hiddenCaseIds, getPresenterSession, myCaseIds,
} from "../_common.js";

// 問題提起人の一覧は、持っている事件の件数も一緒に返す（事件編集フォームのプルダウン・管理画面用）
export function presentersSelect() {
  return `
    SELECT ${PRESENTER_COLS},
           (SELECT COUNT(*) FROM cases c WHERE c.presenter_id = presenters.id) AS case_count
      FROM presenters`;
}

// 一覧（誰でも閲覧可。アイコン・ニックネームは公開情報）。
// ただし、非公開にした事件（view_key あり）しか持たない問題提起人は一覧から外す
// （事件そのものは隠しても、この一覧からニックネーム・アイコン・件数だけが漏れて
//   「非公開の何かを抱えている人物」の存在がわかってしまうため。2026-09-02）。
// 運営（書き込み権限がある人）には引き続き全員を返す（管理画面で使うため）。
// ログインIDの設定状況も運営にだけ返す（個人のメールアドレス等になりうるため）。
export async function onRequestGet({ request, env }) {
  const admin = authorizeWrite(request, env, await getIdentity(request, env));
  const { results } = await env.DB.prepare(`${presentersSelect()} ORDER BY nickname`).all();
  let rows = results || [];

  if (!admin) {
    const [hidden, session] = await Promise.all([
      hiddenCaseIds(env, request),
      getPresenterSession(request, env),
    ]);
    const mine = await myCaseIds(env, session);
    const { results: caseRows } = await env.DB.prepare(
      `SELECT id, presenter_id FROM cases WHERE presenter_id IS NOT NULL`
    ).all();
    const counts = new Map(); // presenterId -> { total, visible }
    for (const c of caseRows || []) {
      const s = counts.get(c.presenter_id) || { total: 0, visible: 0 };
      s.total++;
      if (!hidden.has(c.id) || mine.has(c.id)) s.visible++;
      counts.set(c.presenter_id, s);
    }
    rows = rows
      .filter((r) => {
        const s = counts.get(r.id);
        return !s || s.visible > 0; // 事件を1件も持たない問題提起人はそのまま出す
      })
      .map((r) => {
        const s = counts.get(r.id);
        // 件数も見える事件の分だけにする（非公開の事件があることを件数から推測されないように）
        return s ? { ...r, case_count: s.visible } : r;
      });
  }

  return json(rows.map((r) => rowToPresenter(r, admin)));
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const nickname = String(body.nickname || "").trim();
  if (!nickname) return json({ error: "ニックネームは必須です" }, 400);

  const pid = newId("pr");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO presenters (id, nickname, created_by, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(pid, nickname, id.email, id.email, now).run();

  const row = await env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(pid).first();
  return json(rowToPresenter(row), 201);
}
