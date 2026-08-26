import { json, rowToCase, viewerHash, hiddenCaseIds } from "../../../_common.js";
import { casesSelect } from "../../cases.js";

// その問題提起人が持つ事件の一覧（誰でも閲覧可）。cases.html「事件をさがす」と同じ形のJSONを返す。
// 非公開にした事件は合言葉が合った人にだけ返す。
export async function onRequestGet({ request, env, params }) {
  const viewer = (await viewerHash(request)) || "";
  const [{ results }, hidden] = await Promise.all([
    env.DB.prepare(`${casesSelect()} WHERE c.presenter_id = ? ORDER BY c.name`).bind(viewer, params.id).all(),
    hiddenCaseIds(env, request),
  ]);
  return json((results || []).filter((r) => !hidden.has(r.id)).map(rowToCase));
}
