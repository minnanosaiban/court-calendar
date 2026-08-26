// /sitemap.xml — Google 等のクローラーに「どのURLがあるか」を伝えるための一覧。
// 固定ページに加え、事件は DB から拾って /case?id=... を並べる（新しい事件を足すたびに手で更新しなくてよいように）。

function escXml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function onRequestGet({ request, env }) {
  const base = new URL(request.url).origin;

  // 非公開にした事件（view_key あり）はクローラーに教えない
  const { results } = await env.DB.prepare(
    `SELECT id, updated_at FROM cases WHERE view_key IS NULL OR view_key = '' ORDER BY updated_at DESC`
  ).all();

  const urls = [
    { loc: `${base}/` },
    { loc: `${base}/cases.html` },
    { loc: `${base}/dates.html` },
    ...(results || []).map((c) => ({
      loc: `${base}/case?id=${encodeURIComponent(c.id)}`,
      lastmod: c.updated_at ? String(c.updated_at).slice(0, 10) : undefined,
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${escXml(u.loc)}</loc>` +
          (u.lastmod ? `\n    <lastmod>${escXml(u.lastmod)}</lastmod>` : "") +
          `\n  </url>`
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
