import { json, rowToCase, viewerHash } from "../../../_common.js";
import { casesSelect } from "../../cases.js";

// その問題提起人が持つ事件の一覧（誰でも閲覧可）。cases.html「事件をさがす」と同じ形のJSONを返す。
export async function onRequestGet({ request, env, params }) {
  const viewer = (await viewerHash(request)) || "";
  const { results } = await env.DB.prepare(
    `${casesSelect()} WHERE c.presenter_id = ? ORDER BY c.name`
  ).bind(viewer, params.id).all();
  return json((results || []).map(rowToCase));
}
