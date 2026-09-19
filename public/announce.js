// サイト上部のお知らせ帯（全ページ共通）。MkDocs Material の announce や Jupyter Book のバナーに相当する。
// 各ページの <body> 直後でこのファイルを読み込み、帯を <body> の先頭へ差し込む。lib.js は末尾で読むので、
// そちらで差し込むと表示のあとで帯が現れ、ページ全体が下へずれてしまう（2026-09-19）。
// リンクを増やす・変える・並べ替えるときは、下の LINKS だけを直す。
(function(){
  "use strict";
  const LABEL = "関連サイト";
  const LINKS = [
    { href:"https://reha-fusei-saiban.jimdofree.com/", text:"リハビリ診療不正請求をめぐる訴訟" },
    { href:"https://minnanosaiban.github.io/hotline/", text:"ENEOSの内部通報制度をめぐる訴訟" },
    { href:"https://marumo-fight.com/", text:"バス運転士の槇野圭さんを支える会" },
  ];
  const STOPPED_LS = "court-calendar.announce-stopped";

  const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  // 同じ列を2つ並べ、それぞれ自分の幅だけ左へ動かして途切れなく繰り返す。2つ目は流すための複製なので、
  // 読み上げとキーボード操作の対象から外す
  const group = dup => `<ul class="announce-group"${dup ? ' aria-hidden="true"' : ""}>`
    + `<li class="announce-label" aria-hidden="true">${esc(LABEL)}</li>`
    + LINKS.map(l => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener"${dup ? ' tabindex="-1"' : ""}>`
      + `${esc(l.text)}<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a></li>`).join("")
    + `</ul>`;

  const bar = document.createElement("aside");
  bar.className = "announce";
  bar.setAttribute("aria-label", LABEL);
  bar.innerHTML = `<div class="announce-inner"><div class="announce-view">${group(false)}${group(true)}</div>`
    + `<button type="button" class="announce-toggle"><i class="bi" aria-hidden="true"></i></button></div>`;
  const btn = bar.querySelector(".announce-toggle");
  const icon = btn.firstElementChild;

  // 流すのをやめて全件を並べる（.is-still）のは次の3つのとき。動く内容は止められなければならない（WCAG 2.2.2）
  // 一方で、止めたあとも全部のリンクに届くようにするため、止めた状態は「固まった帯」ではなく「並べた一覧」にする
  //  1. ⏸ボタンで止めた（次のページにも引き継ぐ）  2. キーボードで焦点が入った（画面外のリンクに行き着かないように）
  //  3. OSの「視差効果を減らす」（ボタンはCSS側で隠す）
  let stopped = false, focusing = false;
  try{ stopped = localStorage.getItem(STOPPED_LS) === "1"; }catch(e){}
  const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function render(){
    bar.classList.toggle("is-still", stopped || focusing || reduce);
    btn.setAttribute("aria-label", stopped ? "流れる表示を再開する" : "流れる表示を止める");
    icon.className = "bi " + (stopped ? "bi-play-fill" : "bi-pause-fill");
  }
  btn.addEventListener("click", () => {
    stopped = !stopped;
    try{ stopped ? localStorage.setItem(STOPPED_LS, "1") : localStorage.removeItem(STOPPED_LS); }catch(e){}
    render();
  });
  // マウスで押したリンクにも焦点は残る（別タブで開くので、戻ってきたとき一覧のままになってしまう）ため、
  // キーボード操作による焦点（:focus-visible）のときだけ反応する
  const byKeyboard = el => { try{ return el.matches(":focus-visible"); }catch(e){ return true; } };
  bar.addEventListener("focusin", e => { if(e.target.matches("a") && byKeyboard(e.target)){ focusing = true; render(); } });
  bar.addEventListener("focusout", () => { focusing = false; render(); });
  render();

  document.body.insertBefore(bar, document.body.firstChild);
})();
