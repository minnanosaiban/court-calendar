import { json, rowToCase, getIdentity, authorizeWrite, viewerHash, hiddenCaseIds, redactCaseNo } from "../../../_common.js";
import { casesSelect } from "../../cases.js";

// その問題提起人が持つ事件の一覧（誰でも閲覧可）。cases.html「事件をさがす」と同じ形のJSONを返す。
// 非公開にした事件は合言葉が合った人にだけ、事件番号は運営（書き込み権限がある人）にだけ返す。
export async function onRequestGet({ request, env, params }) {
  const viewer = (await viewerHash(request)) || "";
  const [{ results }, hidden, wid] = await Promise.all([
    env.DB.prepare(`${casesSelect()} WHERE c.presenter_id = ? ORDER BY c.name`).bind(viewer, params.id).all(),
    hiddenCaseIds(env, request),
    getIdentity(request, env),
  ]);
  const visible = (results || []).filter((r) => !hidden.has(r.id));
  return json(redactCaseNo(visible, authorizeWrite(request, env, wid)).map(rowToCase));
}
