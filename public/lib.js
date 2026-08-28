// 裁判カレンダー・共通ロジック（index.html / case.html の両方から読み込む）
// モーダルや「編集パスワード」の状態など、両ページに共通のものはここに集約する。
// 呼び出す側（各ページ末尾のスクリプト）は window.CC 経由で使う。
window.CC = (function(){
  "use strict";
  const EDITKEY_LS = "court-calendar.editkey";
  const VIEWER_LS  = "court-calendar.viewer";
  const VIEWKEYS_LS = "court-calendar.viewkeys";
  const WD = ["日","月","火","水","木","金","土"];

  // ---- state ----
  let editKey = localStorage.getItem(EDITKEY_LS) || "";   // 編集パスワード（この端末に保存）
  // 非公開にした事件の合言葉。{ 事件id: 合言葉 } の形でこの端末に保存する。
  // /case?id=…&key=… で開いたときだけ、URLの key をここに取り込む（以後はURLに無くても効く）。
  let viewKeys = {};
  try{ viewKeys = JSON.parse(localStorage.getItem(VIEWKEYS_LS) || "{}") || {}; }catch(e){ viewKeys = {}; }
  try{
    const qs = new URLSearchParams(location.search);
    const kid = qs.get("id"), key = qs.get("key");
    if(kid && key){
      viewKeys[kid] = key;
      localStorage.setItem(VIEWKEYS_LS, JSON.stringify(viewKeys));
    }
  }catch(e){}
  let loaded = false;   // 最初のデータ取得が終わったか（終わるまで「まだありません」系の文言を出さない）
  let cases = [];
  let presenters = [];
  let events = [];
  let posts = [];
  let materials = [];
  let images = [];
  let me = { email:null, canWrite:false, viaAccess:false, allowAll:false, boardOpen:false, turnstileSiteKey:"" };
  let boardFormForCase = null;   // 投稿フォームを開いている事件ID
  let tsToken = "";
  let tsScriptPromise = null;
  let onChange = null;           // ページ側が登録する「データが変わったら呼ぶ」コールバック

  // いいねの二重押し防止に使う、この端末の識別子（中身に意味はない。サーバ側ではハッシュして保存）
  let viewer = localStorage.getItem(VIEWER_LS) || "";
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(viewer)){
    const b = new Uint8Array(18); crypto.getRandomValues(b);
    viewer = btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    localStorage.setItem(VIEWER_LS, viewer);
  }

  // ---- util ----
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function parseYmd(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
  function todayStr(){ return ymd(new Date()); }
  function byTime(a,b){ return (a.time||"99:99").localeCompare(b.time||"99:99"); }
  function byDate(a,b){ return a.date===b.date ? byTime(a,b) : a.date.localeCompare(b.date); }
  function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function escapeAttr(s){ return String(s||"").replace(/"/g,"&quot;"); }
  // 1行のテキストに https://... が含まれていればリンクにする（必ず先にエスケープしてから当てはめる）。
  // リンクの直後に「外部サイトを開く」アイコンを添える（報道がWEB記事のときの目印）
  function linkify(s){
    return escapeHtml(s).replace(/(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1 <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>');
  }
  function cssEsc(s){ return String(s).replace(/"/g,'\\"'); }
  function jpDate(s){ const d=parseYmd(s); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${WD[d.getDay()]}）`; }
  function dotDate(s){ return s ? s.replace(/-/g,".") : ""; }


  // ================= API =================
  async function api(method, path, body, extra){
    const opt = { method, headers:{ "X-Viewer": viewer } };
    if(editKey) opt.headers["X-Edit-Key"]=editKey;
    const vkPairs = Object.keys(viewKeys).map(id=>id+":"+viewKeys[id]).join(",");
    if(vkPairs) opt.headers["X-View-Keys"]=vkPairs;
    if(extra) Object.assign(opt.headers, extra);
    if(body instanceof FormData){ opt.body=body; }
    else if(body!==undefined){ opt.headers["content-type"]="application/json"; opt.body=JSON.stringify(body); }
    const res = await fetch(path, opt);
    if(!res.ok){
      let msg = "HTTP " + res.status;
      try{ const j=await res.json(); if(j&&j.error) msg=j.error; }catch(e){}
      const err = new Error(msg); err.status=res.status; throw err;
    }
    if(res.status===204) return null;
    return res.json();
  }
  const apiMe          = ()=> api("GET","/api/me");
  const apiListCases   = ()=> api("GET","/api/cases");
  const apiCreateCase  = (d)=> api("POST","/api/cases", d);
  const apiUpdateCase  = (id,d)=> api("PUT","/api/cases/"+encodeURIComponent(id), d);
  const apiDeleteCase  = (id)=> api("DELETE","/api/cases/"+encodeURIComponent(id));
  const apiLike        = (id)=> api("POST","/api/cases/"+encodeURIComponent(id)+"/like");
  const apiUnlike      = (id)=> api("DELETE","/api/cases/"+encodeURIComponent(id)+"/like");
  const apiBookmark    = (id)=> api("POST","/api/events/"+encodeURIComponent(id)+"/bookmark");
  const apiUnbookmark  = (id)=> api("DELETE","/api/events/"+encodeURIComponent(id)+"/bookmark");
  const apiList        = ()=> api("GET","/api/events");
  const apiCreate      = (d)=> api("POST","/api/events", d);
  const apiUpdate      = (id,d)=> api("PUT","/api/events/"+encodeURIComponent(id), d);
  const apiDelete      = (id)=> api("DELETE","/api/events/"+encodeURIComponent(id));
  const apiListPosts   = ()=> api("GET","/api/posts");
  const apiDeletePost  = (id)=> api("DELETE","/api/posts/"+encodeURIComponent(id));
  const apiListMats    = ()=> api("GET","/api/materials");
  const apiCreateMat   = (fd)=> api("POST","/api/materials", fd);
  const apiUpdateMat   = (id,fd)=> api("PUT","/api/materials/"+encodeURIComponent(id), fd);
  const apiDeleteMat   = (id)=> api("DELETE","/api/materials/"+encodeURIComponent(id));
  const apiListImages  = ()=> api("GET","/api/images");
  const apiCreateImage = (fd)=> api("POST","/api/images", fd);
  const apiUpdateImage = (id,fd)=> api("PUT","/api/images/"+encodeURIComponent(id), fd);
  const apiDeleteImage = (id)=> api("DELETE","/api/images/"+encodeURIComponent(id));
  const apiListPresenters  = ()=> api("GET","/api/presenters");
  const apiCreatePresenter = (d)=> api("POST","/api/presenters", d);
  const apiUpdatePresenter = (id,d)=> api("PUT","/api/presenters/"+encodeURIComponent(id), d);
  const apiDeletePresenter = (id)=> api("DELETE","/api/presenters/"+encodeURIComponent(id));
  const apiUpdatePresenterIcon = (id,fd)=> api("PUT","/api/presenters/"+encodeURIComponent(id)+"/icon", fd);
  const apiDeletePresenterIcon = (id)=> api("DELETE","/api/presenters/"+encodeURIComponent(id)+"/icon");
  const apiUpdateCaseNotice = (id,fd)=> api("PUT","/api/cases/"+encodeURIComponent(id)+"/notice", fd);
  const apiDeleteCaseNotice = (id)=> api("DELETE","/api/cases/"+encodeURIComponent(id)+"/notice");
  const apiPresenterCases = (id)=> api("GET","/api/presenters/"+encodeURIComponent(id)+"/cases");
  function saveErr(err){
    if(err && err.status===403) return "この操作は許可されていません（閲覧のみの権限です）。";
    return "保存できませんでした：" + (err && err.message || err);
  }

  async function load(){
    try{ me = await apiMe(); }catch(e){ me={email:null,canWrite:false,allowAll:false,boardOpen:false,turnstileSiteKey:""}; }
    const [c,pr,e,p,m,im] = await Promise.all([
      apiListCases().catch(()=>[]), apiListPresenters().catch(()=>[]), apiList().catch(()=>[]),
      apiListPosts().catch(()=>[]), apiListMats().catch(()=>[]),
      apiListImages().catch(()=>[]),
    ]);
    cases=c; presenters=pr; events=e; posts=p; materials=m; images=im;
    loaded = true;
  }
  async function reloadCases(){ try{ cases = await apiListCases(); }catch(e){} }
  async function reloadPresenters(){ try{ presenters = await apiListPresenters(); }catch(e){} }

  // ================= 事件 =================
  function caseById(id){ return cases.find(c=>c.id===id) || null; }
  function caseByName(name){ return cases.find(c=>c.name===name) || null; }
  function presenterById(id){ return presenters.find(p=>p.id===id) || null; }
  function caseEvents(caseId){ return events.filter(e=>e.caseId===caseId).sort(byDate); }
  function casePosts(caseId){ return posts.filter(p=>p.caseId===caseId); }
  function caseMaterials(caseId){ return materials.filter(m=>m.caseId===caseId); }
  function materialById(id){ return materials.find(m=>m.id===id) || null; }
  function caseImages(caseId){ return images.filter(im=>im.caseId===caseId).sort((a,b)=>a.sortOrder-b.sortOrder); }
  // 次の期日がいちばん近い事件（カレンダーの初期表示月に使う）
  function nearestCase(){
    const today=todayStr();
    const list=events.filter(e=>e.date>=today && !isArchived(e.caseId)).sort(byDate);
    return list[0] ? list[0].caseId : null;
  }
  // 最近開廷された（今日までにいちばん新しく期日があった）事件（トップ「応援ピックアップ」用）。
  // 「傍聴に行ってきたよ！掲示板」は行った"あと"に書く場所なので、これから開かれる事件ではなく
  // 実際に開廷があった事件を選ぶ。まだどの事件も開廷していない（全事件が未来の期日のみ）ときは
  // nearestCase() にフォールバックする。
  // ※ 2026-08-28、本人指示により当面「サンプル）情報公開請求をめぐる訴訟」に固定（下のPICKUP_OVERRIDE）。
  //   自動選定に戻すときはこの定数をnullにするだけでよい
  const PICKUP_OVERRIDE = "c53bfb741871f"; // サンプル）情報公開請求をめぐる訴訟
  function pickupCase(){
    if(PICKUP_OVERRIDE) return PICKUP_OVERRIDE;
    const today=todayStr();
    const list=events.filter(e=>e.date<=today && !isArchived(e.caseId)).sort(byDate);
    return list.length ? list[list.length-1].caseId : nearestCase();
  }
  function isArchived(caseId){
    const c=caseById(caseId);
    return !!(c && c.archivedAt);
  }
  // その事件の「最近の期日」＝これからの最初の回。すべて済んでいれば最後の回
  function nextEvent(caseId){
    const rounds=caseEvents(caseId);
    const today=todayStr();
    return rounds.find(e=>e.date>=today) || rounds[rounds.length-1] || null;
  }
  // 「第2回口頭弁論　東京地方裁判所 610号法廷　2026年8月26日（水）13:30」の1行
  function eventLine(ev){
    const place=[ev.court,ev.place].filter(Boolean).join(" ");
    return [ev.type, place, `${jpDate(ev.date)}${ev.time||""}`].filter(Boolean).join("　");
  }

  // ---- 当事者のリンク（URLのドメインでアイコンを決める。当事者のすぐ下にアイコンで出す） ----
  function linkIcon(url){
    let h=""; try{ h=new URL(url).hostname.replace(/^www\./,""); }catch(e){}
    if(h==="x.com"||h==="twitter.com") return ["bi-twitter-x","X"];
    if(h.endsWith("instagram.com")) return ["bi-instagram","Instagram"];
    if(h.endsWith("youtube.com")||h==="youtu.be") return ["bi-youtube","YouTube"];
    if(h.endsWith("facebook.com")) return ["bi-facebook","Facebook"];
    if(h==="note.com") return ["bi-journal-text","note"];
    return ["bi-box-arrow-up-right", "ウェブサイト"];
  }
  // 原告のリンク（原告のみ。被告側の欄は defendantLinks を渡す）
  function partyLinksHtml(links){
    if(!links.length) return "";
    return `<div class="facts-links">${links.map(u=>{
      const [cls,label]=linkIcon(u);
      return `<a class="plink" href="${escapeAttr(u)}" target="_blank" rel="noopener" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"><i class="bi ${cls}" aria-hidden="true"></i></a>`;
    }).join("")}</div>`;
  }
  // ---- 裁判官・事件番号：1行1件で書く（複数あれば改行を増やすだけ。「地裁　坂巻陽士裁判官」のように
  // 書きたい文言をそのまま1行に書く）。行頭が「地裁」「高裁」などの審級＋スペースなら、名前の位置が
  // そろうように審級部分だけ幅をそろえて表示する（審級を書かなければ、その行はそのまま表示する）。
  // スペースを必須にしているのは、「地裁太郎」のように審級と同じ文字で始まる名前を
  // 「地裁」＋「太郎」に割ってしまわないため。行末に https://... を書くと、その裁判官のリンク
  // （「裁判官マップ」等）としてアイコンで添える（任意・URLの部分は表示上は隠れる） ----
  const COURT_LEVELS = "最高裁|高裁|地裁|簡裁|家裁";
  function courtLinesHtml(raw){
    const lines = String(raw||"").split("\n").map(s=>s.trim()).filter(Boolean);
    if(!lines.length) return "";
    const re = new RegExp(`^(${COURT_LEVELS})[\\s　]+(.*)$`);
    const urlRe = /[\s　](https?:\/\/\S+)$/;
    return lines.map(line=>{
      let url = "";
      const um = line.match(urlRe);
      if(um){ url = um[1]; line = line.slice(0, um.index).trim(); }
      const linkHtml = url
        ? ` <a class="jlink" href="${escapeAttr(url)}" target="_blank" rel="noopener" title="外部サイトを見る" aria-label="外部サイトを見る"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>`
        : "";
      const m = line.match(re);
      // 名前＋リンクは1つの要素にまとめる（.court-lineはgridで2列固定なので、直接の子要素が
      // 3つになると3つ目が次の行の1列目に流れてレイアウトが崩れてしまうため）
      return m
        ? `<div class="court-line"><span class="cl-level">${escapeHtml(m[1])}</span><span>${escapeHtml(m[2].trim())}${linkHtml}</span></div>`
        : `<div>${escapeHtml(line)}${linkHtml}</div>`;
    }).join("");
  }
  // ---- 原告・被告名：1行目=本人の名前、2行目以降は「代理人　〇〇」のような補足（任意・改行を
  // 増やすだけで複数行書ける）。2行目以降はひとまわり小さく添える ----
  function partyNameHtml(raw){
    const lines = String(raw||"").split("\n").map(s=>s.trim()).filter(Boolean);
    if(!lines.length) return "";
    return lines.map((line,i)=> i===0
      ? escapeHtml(line)
      : `<div class="party-sub">${escapeHtml(line)}</div>`
    ).join("");
  }
  // ファクトシートの1行。値が無ければ何も出さない（dt/ddのペアをまとめて返す）
  function factRow(label, valueHtml){ return valueHtml ? `<dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd>` : ""; }
  function likeHtml(c){
    return `<button type="button" class="like${c.liked?" on":""}" data-like="${escapeAttr(c.id)}" aria-pressed="${c.liked?"true":"false"}" aria-label="いいね">`+
      `<i class="bi ${c.liked?"bi-heart-fill":"bi-heart"}" aria-hidden="true"></i><span class="like-n">${c.likes||0}</span></button>`;
  }
  // 期日のお気に入り。❤いいね（事件単位・件数表示あり）とは別に、期日単位・件数表示なしの自分専用の目印
  function bookmarkHtml(ev){
    return `<button type="button" class="bookmark${ev.bookmarked?" on":""}" data-bookmark="${escapeAttr(ev.id)}" aria-pressed="${ev.bookmarked?"true":"false"}" aria-label="お気に入り">`+
      `<i class="bi ${ev.bookmarked?"bi-bookmark-fill":"bi-bookmark"}" aria-hidden="true"></i></button>`;
  }
  // 関連裁判：自分の relatedCaseIds に加えて、「自分を関連裁判として挙げている他の事件」も拾う（片方に登録すれば両方に出る）
  function relatedCases(caseId){
    const ids=new Set(((caseById(caseId)||{}).relatedCaseIds)||[]);
    cases.forEach(o=>{ if(o.id!==caseId && (o.relatedCaseIds||[]).includes(caseId)) ids.add(o.id); });
    return [...ids].map(caseById).filter(Boolean);
  }
  function relatedCasesHtml(c){
    const rel=relatedCases(c.id);
    if(!rel.length) return "";
    const items=rel.map(r=>`<li><a href="case?id=${encodeURIComponent(r.id)}">${escapeHtml(r.name)}</a></li>`).join("");
    return `<p class="minih">関連裁判</p><ul class="pts">${items}</ul>`;
  }
  // 事件のアイコン（Twitterのアバターのように、一覧やカレンダーで事件を見分けるための小さな画像）。
  // 実体は問題提起人（アイコン＋ニックネーム）のアイコンで、複数の事件が同じ問題提起人を持てば
  // 自然に使い回される（2026-08-25、事件から問題提起人を独立させた）。問題提起人が未設定・
  // アイコン未登録のときは、事件名の頭文字を丸い札で代わりに出す。大きさは56px1種類
  function iconHtml(c){
    if(c.presenterIcon) return `<img class="cicon" src="${escapeAttr(c.presenterIcon)}" alt="">`;
    const ch = placeholderChar(c.name);
    return `<span class="cicon cicon-ph" aria-hidden="true">${escapeHtml(ch)}</span>`;
  }
  // 事件詳細ページの見出し：アイコンは問題提起人の他の事件一覧（presenter.html）へのリンクにする。
  // 問題提起人が未設定の事件では、アイコン（頭文字の札）だけを非リンクで出す
  function presenterHeaderHtml(c){
    const icon = iconHtml(c);
    if(!c.presenterId) return icon;
    return `<a class="cicon-link" href="presenter?id=${encodeURIComponent(c.presenterId)}" title="${escapeAttr(c.presenterNickname)}の他の事件を見る">${icon}</a>`;
  }
  // 事件名の下に添える、問題提起人のニックネーム（リンク）。アイコンの下だと名前が長いと省略されて
  // 読めなくなるため、タイトルの下の広い幅で全文出す（2026-08-26）。
  // 閲覧者向けの表示なので敬称「さん」を付ける（管理画面のプルダウン等、運営者向けの表示には付けない）
  function presenterNameHtml(c){
    if(!c.presenterId || !c.presenterNickname) return "";
    return `<a class="presenter-name" href="presenter?id=${encodeURIComponent(c.presenterId)}">${escapeHtml(c.presenterNickname)}さん</a>`;
  }
  // 仮アイコンに使う頭文字。「【サンプル】」「【控訴審】」のような先頭の囲みは、どの事件でも同じ文字になって
  // 見分けの役に立たないので読み飛ばし、囲みの後ろの頭文字を拾う（囲みだけで中身が無い名前は元の頭文字に戻す）
  function placeholderChar(name){
    const n=(name||"").trim();
    const stripped=n.replace(/^[【\[（(「『][^】\]）)」』]*[】\]）)」』]\s*/, "");
    return (stripped || n).slice(0,1) || "？";
  }
  // 事件のタグ。事件ページ等ではリンク（cases.html の絞り込みへ）、一覧ページの各行では非リンクの札として使う
  function tagsHtml(c, opts){
    if(!c.tags || !c.tags.length) return "";
    const link = !(opts && opts.plain);
    return `<div class="tags">`+c.tags.map(t=>
      link ? `<a class="tag" href="cases?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`
           : `<span class="tag">${escapeHtml(t)}</span>`
    ).join("")+`</div>`;
  }
  // シェア（事件ページのみ）：X・LINE はリンクを新しいタブで開くだけ、リンクをコピーだけJSが要る
  function shareHtml(c){
    const shareUrl = location.origin + "/case?id=" + encodeURIComponent(c.id);
    const text = encodeURIComponent(c.name);
    const u = encodeURIComponent(shareUrl);
    return `<div class="share">
      <span class="share-lab">シェア</span>
      <a href="https://twitter.com/intent/tweet?text=${text}&url=${u}" target="_blank" rel="noopener" title="Xでシェア" aria-label="Xでシェア"><i class="bi bi-twitter-x" aria-hidden="true"></i></a>
      <a href="https://social-plugins.line.me/lineit/share?url=${u}" target="_blank" rel="noopener" title="LINEで送る" aria-label="LINEで送る"><i class="bi bi-line" aria-hidden="true"></i></a>
      <button type="button" class="share-copy" data-copylink="${escapeAttr(shareUrl)}" title="リンクをコピー" aria-label="リンクをコピー"><i class="bi bi-link-45deg" aria-hidden="true"></i></button>
    </div>`;
  }

  // ---- 写真ギャラリー（事件ページ上部だけに出す） ----
  function galleryHtml(caseId){
    const imgs = caseImages(caseId);
    if(!imgs.length && !me.canWrite) return "";
    let html = "";
    if(imgs.length){
      const items = imgs.map((im)=>`<a class="gal-item" href="${escapeAttr(im.url)}" target="_blank" rel="noopener">
        <img src="${escapeAttr(im.url)}" alt="${escapeAttr(im.caption)}" loading="lazy">
        ${im.caption?`<span class="gal-cap">${escapeHtml(im.caption)}</span>`:""}
      </a>`).join("");
      const dots = imgs.length>1
        ? `<div class="gal-dots">${imgs.map((_,i)=>`<button type="button" class="${i===0?"on":""}" data-dot="${i}" aria-label="${i+1}枚目の写真"></button>`).join("")}</div>`
        : "";
      html += `<div class="gal" data-gal="${escapeAttr(caseId)}"><div class="gal-track">${items}</div>${dots}</div>`;
    }
    // 写真の追加・並び替え・編集は事件情報の編集ページ（case-edit.html）に一本化した（2026-08-27）。
    // ここ（事件ページ）には「編集」への入口だけを置く（旧・常時展開の管理一覧は廃止）。
    if(me.canWrite){
      html += `<p class="qact"><a href="case-edit.html?id=${encodeURIComponent(caseId)}&open=img:new">＋ 写真を編集</a></p>`;
    }
    return html;
  }
  // ギャラリーの自動送り。ホバー中は止める。件数が1枚なら動かさない
  function wireGallery(gal){
    const track = gal.querySelector(".gal-track");
    const items = gal.querySelectorAll(".gal-item");
    const dots = gal.querySelectorAll(".gal-dots button");
    if(items.length<=1) return;
    let idx=0, timer=null;
    function show(i){
      idx=(i+items.length)%items.length;
      track.style.transform = `translateX(-${idx*100}%)`;
      dots.forEach((d,j)=>d.classList.toggle("on", j===idx));
    }
    // 最初の1回だけ早めに送って「動くカードだ」と伝わるようにする（開いた直後は静止して見えるため）。2回目以降は通常の間隔
    function start(){
      stop();
      timer=setTimeout(()=>{ show(idx+1); timer=setInterval(()=>show(idx+1),4500); }, 1500);
    }
    function stop(){ if(timer){ clearTimeout(timer); clearInterval(timer); } timer=null; }
    dots.forEach(d=>d.addEventListener("click",(e)=>{ e.preventDefault(); show(Number(d.dataset.dot)); start(); }));
    gal.addEventListener("mouseenter",stop);
    gal.addEventListener("mouseleave",start);
    start();
  }
  async function moveImage(id, dir){
    const im = images.find(x=>x.id===id); if(!im) return;
    const siblings = caseImages(im.caseId);
    const i = siblings.findIndex(x=>x.id===id);
    const other = siblings[i+dir];
    if(!other) return;
    try{
      const fd1=new FormData(); fd1.append("caseId",im.caseId); fd1.append("caption",im.caption); fd1.append("sortOrder",String(other.sortOrder));
      const fd2=new FormData(); fd2.append("caseId",other.caseId); fd2.append("caption",other.caption); fd2.append("sortOrder",String(im.sortOrder));
      const [u1,u2] = await Promise.all([apiUpdateImage(im.id,fd1), apiUpdateImage(other.id,fd2)]);
      [u1,u2].forEach(u=>{ const j=images.findIndex(x=>x.id===u.id); if(j>=0) images[j]=u; });
      if(onChange) onChange();
    }catch(err){ alert("並び替えできませんでした：" + (err && err.message || err)); }
  }

  // ================= 事件のカード =================
  // full=false: トップ「最近の期日」用（タイトル〜掲示板＋「詳細を見る」）
  // full=true : 事件ページ用（さらに よびかけ・関連裁判・タイムライン・訴訟資料一覧）
  function caseCardHtml(caseId, full){
    const c = caseById(caseId);
    if(!c) return null;
    const next = nextEvent(caseId);
    const points=(c.points||[]).map(p=>`<li>${escapeHtml(p)}</li>`).join("");

    // ファクトシート：最近の期日・手続・事件番号・争点・原告・被告・裁判官・掲載（値がある行だけ出す）。
    // 事件番号〜掲載は、既定では事件ページ（full=true）でだけ出す。トップのピックアップカードにも
    // 出すかどうかは項目ごとのチェックボックス（showXxxOnTop）で選べる（2026-08-28、事件番号は
    // さらに「公開する」もチェックされている場合だけ）。詳しい情報が知りたい人は「事件の詳細を見る」
    // から先へ進んでもらう（2026-08-27）
    const nextRow = next
      ? factRow("期日",
          `<div>${escapeHtml(jpDate(next.date))}${next.time?" "+escapeHtml(next.time):""}${next.open===false?`<span class="round-closed">非公開・要確認</span>`:""}${next.reportMeeting?`<span class="round-note">期日報告会あり</span>`:""}</div>`+
          ([next.court,next.place].filter(Boolean).length?`<div>${escapeHtml([next.court,next.place].filter(Boolean).join(" "))}</div>`:"")
        ) + factRow("手続", next.type?escapeHtml(next.type):"")
      : "";
    const caseNoRow = (c.caseNoPublic && (full || c.showCaseNoOnTop))
      ? factRow("事件番号", courtLinesHtml(c.caseNo)) : "";
    const pointsRow = (full || c.showPointsOnTop) ? factRow("争点", points?`<ul class="pts">${points}</ul>`:"") : "";
    const plaintiffRow = (full || c.showPlaintiffOnTop) ? factRow("原告", partyNameHtml(c.plaintiffName)+partyLinksHtml(c.plaintiffLinks)) : "";
    const defendantRow = (full || c.showDefendantOnTop) ? factRow("被告", partyNameHtml(c.defendantName)+partyLinksHtml(c.defendantLinks)) : "";
    const judgeRow = (full || c.showJudgeOnTop) ? factRow("裁判官", c.judge?courtLinesHtml(c.judge):"") : "";
    const pressRow = (full || c.showPressOnTop) ? factRow("掲載", c.press.length?`<ul class="pts">${c.press.map(line=>`<li>${linkify(line)}</li>`).join("")}</ul>`:"") : "";
    const facts1 = nextRow+caseNoRow+pointsRow+plaintiffRow+defendantRow+judgeRow+pressRow;

    // 写真・掲示板・事件本体（dcard）は、1つの塊として続けて出す（箱の中に箱、を解消するため）。
    // 継ぎ目は角丸にせず、塊の外側（写真の上／事件本体の下）だけ角丸にする（詳しくは style.css）
    const galHtml = full ? galleryHtml(caseId) : "";
    const galCard = galHtml ? `<div class="card gal-card">${galHtml}</div>` : "";
    let html = galCard + boardHtml(caseId, full) + `
      <div class="card dcard">
        <div class="d-head">
          ${presenterHeaderHtml(c)}
          <div class="d-head-main">
            <h2 class="d-title">${escapeHtml(c.name)} ${likeHtml(c)}</h2>
            ${full?presenterNameHtml(c):""}
          </div>
        </div>
        ${tagsHtml(c)}
        ${full ? shareHtml(c) : ""}
        ${facts1?`<dl class="facts">${facts1}</dl>`:""}
        ${noticeHtml(c, full)}`;

    if(!full){
      // ピックアップカードだけ：問題提起人名・事件の詳細を見る、を右下にまとめる（枠で囲まない下線リンク・2026-08-27）
      html += `<p class="d-more">${presenterNameHtml(c)}<a class="detail-link" href="case?id=${encodeURIComponent(c.id)}">事件の詳細を見る</a></p>`;
    }
    if(full){
      const editCaseQact = me.canWrite ? `<p class="qact"><a href="case-edit.html?id=${encodeURIComponent(c.id)}">＋ 事件情報を編集</a></p>` : "";
      html += callHtml(c) + editCaseQact + relatedCasesHtml(c) + timelineHtml(caseId) + materialsListHtml(caseId);
    } else {
      // ピックアップカードでも、項目ごとのチェックがある「裁判について」「関連裁判」は出す
      // （編集リンク・タイムライン・訴訟資料一覧は事件ページだけの機能なのでここには出さない）
      html += (c.showCallOnTop ? callHtml(c) : "") + (c.showRelatedOnTop ? relatedCasesHtml(c) : "");
    }
    html += `</div>`;
    return html;
  }

  // ---- 期日案内（支援者が作る一覧チラシ。あれば埋め込み表示する。2026-08-27） ----
  // 新規アップロードはJPEGのみ（2026-08-28）。画像はそのまま<img>で出す（画像はどの環境でも確実に表示され、
  // 拡大はブラウザの標準機能・別タブで開いた先の画像表示に任せる）。isImageでないPDF分岐は、制限前に
  // アップロード済みの既存データ（PDF・PNG）を引き続き表示するための後方互換（新規には出てこない）。
  // PDFはブラウザのネイティブビューアで表示・拡大できる（埋め込みが効かない環境＝Android端末の一部に
  // 備えて「新しいタブで開く」を必ず添える）。トップのピックアップカード（!full）
  // でも事件ページ（full）と同じ大きさで出す（2026-08-27：以前は低めに切り詰めていたが拡大表示に変更）
  function noticeHtml(c, full){
    if(!c.noticeUrl) return "";
    const isImage = c.noticeMime==="image/png" || c.noticeMime==="image/jpeg";
    // 埋め込み側はツールバー（拡大・ページ送り・印刷・ダウンロードのアイコン列）を隠してすっきりさせる。
    // #toolbar=0 はChromeが慣習的に対応しているだけの指定（Adobeの古い仕様が起源）で、対応していない
    // ブラウザでは単に元のツールバー付きに戻るだけ・実害なし。拡大等が必要な人は「新しいタブで開く」
    // （こちらはtoolbar=0を付けないのでフル機能）へ誘導する
    const body = isImage
      ? `<img src="${escapeAttr(c.noticeUrl)}" alt="${escapeAttr(c.noticeFileName||"期日案内")}" loading="lazy">`
      : `<iframe src="${escapeAttr(c.noticeUrl)}#toolbar=0&navpanes=0" title="${escapeAttr(c.noticeFileName||"期日案内")}" loading="lazy"></iframe>`;
    return `<div class="notice${full?"":" compact"}">
      <div class="notice-head"><span class="notice-lab">期日案内</span>
        <a class="notice-open" href="${escapeAttr(c.noticeUrl)}" target="_blank" rel="noopener">新しいタブで開く <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>
      </div>
      <div class="notice-frame">${body}</div>
    </div>`;
  }

  // ---- 裁判について（よびかけ文。呼びかけ団体・連絡先はここには出さない） ----
  function callHtml(c){
    if(!c.callText) return "";
    // 空行区切りを段落として分ける（旧「事件の説明」欄との統合で、1つの欄に複数段落が入るようになったため）
    const paras = c.callText.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean).map(p=>`<p class="call">${escapeHtml(p)}</p>`).join("");
    return `<div class="lede"><p class="lede-title">裁判について</p>${paras}</div>`;
  }


  // ---- タイムラインと訴訟資料 ----
  const SIDE_CLASS = { "原告側":"g", "被告側":"k", "裁判所":"j", "その他":"" };
  function matIcon(m){
    const u=(m.fileUrl||"").toLowerCase();
    if(m.mime==="application/pdf" || /\.pdf(\?|#|$)/.test(u)) return "bi-file-earmark-pdf";
    if(/^image\//.test(m.mime||"") || /\.(png|jpe?g|gif|webp)(\?|#|$)/.test(u)) return "bi-image";
    return "bi-box-arrow-up-right";
  }
  // PDF・テキスト・要約の3つのボタン。無いものはグレーのまま押せない（「この資料には無い」ことが分かるように）
  function matButtonsHtml(m){
    const icon = matIcon(m);
    const pdf = m.fileUrl
      ? `<a class="btn pdf" href="${escapeAttr(m.fileUrl)}" target="_blank" rel="noopener"><i class="bi ${icon}" aria-hidden="true"></i>.pdf</a>`
      : `<span class="btn off"><i class="bi bi-file-earmark-pdf" aria-hidden="true"></i>.pdf</span>`;
    // 本文はページを開かず、その場でクリップボードにコピーする（再利用・AIへの貼り付け用。中身はMarkdownを貼り付けたもの）
    const body = m.body
      ? `<button type="button" class="btn" data-copybody="${escapeAttr(m.id)}"><i class="bi bi-clipboard" aria-hidden="true"></i>.md</button>`
      : `<span class="btn off"><i class="bi bi-clipboard" aria-hidden="true"></i>.md</span>`;
    // 要約はその場で展開せず、ポップアップ（モーダル）で開く
    const sum = m.summary
      ? `<button type="button" class="btn" data-sumopen="${escapeAttr(m.id)}"><i class="bi bi-stars" aria-hidden="true"></i>要約</button>`
      : `<span class="btn off"><i class="bi bi-stars" aria-hidden="true"></i>要約</span>`;
    return `<span class="btns">${pdf}${body}${sum}</span>`;
  }
  function matBlockHtml(m){
    const claims=(m.claims||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    return `<div class="mat">
      <span class="mmain"><span class="mat-name">${escapeHtml(m.title)}</span>${matButtonsHtml(m)}</span>
      ${claims?`<ul class="pts mat-claims">${claims}</ul>`:""}
    </div>`;
  }
  // 期日ごとの「原告の主張／被告の主張」（3行程度の箇条書き）
  function argsHtml(ev){
    const p=(ev.plaintiffArgument||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    const d=(ev.defendantArgument||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    if(!p && !d) return "";
    return `<div class="args">
      ${p?`<div class="arg g"><h4>原告の主張</h4><ul>${p}</ul></div>`:""}
      ${d?`<div class="arg k"><h4>被告の主張</h4><ul>${d}</ul></div>`:""}
    </div>`;
  }
  function timelineHtml(caseId){
    const rounds=caseEvents(caseId);
    const mats=caseMaterials(caseId);
    const today=todayStr();
    const next=nextEvent(caseId);
    const items=rounds.map(ev=>{
      const own=mats.filter(m=>m.eventId===ev.id);
      const hasArgs = (ev.plaintiffArgument&&ev.plaintiffArgument.length) || (ev.defendantArgument&&ev.defendantArgument.length);
      const state = ev.date<today ? "past" : (next&&ev.id===next.id ? "next" : "future");
      const expandable = own.length>0 || hasArgs;
      const place=[ev.court,ev.place].filter(Boolean).join(" ");
      const closed = ev.open===false ? `<span class="round-closed">非公開・要確認</span>` : "";
      const reportNote = ev.reportMeeting ? `<span class="round-note">期日報告会あり</span>` : "";
      const editLink = me.canWrite ? `<a class="round-edit" href="case-edit.html?id=${encodeURIComponent(caseId)}&open=ev:${encodeURIComponent(ev.id)}">編集</a>` : "";
      return `<li class="tl-item ${state}">
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-head">
          <span class="tl-date">${escapeHtml(jpDate(ev.date))}${ev.time?" "+escapeHtml(ev.time):""}</span>
          <span class="tl-type">${escapeHtml(ev.type||"期日")}</span>
          <span class="tl-meta">${escapeHtml(place)}${closed}${reportNote}${bookmarkHtml(ev)}${editLink}</span>
        </div>
        ${expandable?`<div class="tl-body">${argsHtml(ev)}${own.map(matBlockHtml).join("")}</div>`:""}
      </li>`;
    }).join("");
    return `<p class="subhead">タイムライン</p>
      ${rounds.length?`<ol class="tl">${items}</ol>`:`<p class="d-body mut">期日はまだ登録されていません。</p>`}
      ${me.canWrite?`<p class="qact"><a href="case-edit.html?id=${encodeURIComponent(caseId)}&open=ev:new">＋ 期日を編集</a></p>`:""}`;
  }
  function matRowHtml(m, caseId){
    const edit = me.canWrite ? `<a class="round-edit" href="case-edit.html?id=${encodeURIComponent(caseId)}&open=mat:${encodeURIComponent(m.id)}">編集</a>` : "";
    return `<li class="mrow">
      ${m.filedOn?`<span class="mdate">${escapeHtml(dotDate(m.filedOn))}</span>`:""}
      <span class="mmain"><span class="mat-name">${escapeHtml(m.title)}</span>${matButtonsHtml(m)}${edit}</span>
    </li>`;
  }
  // 訴訟資料一覧：提出者側ごとに見出しで束ねる（初出の順。側が空のものは「その他」にまとめる）。
  // 全件が側なしなら、旧来どおり見出し無しの1本の並びにする
  function materialsListHtml(caseId){
    const mats=caseMaterials(caseId);
    // 訴訟資料が1件も無ければ、見出しごと何も出さない（追加は事件情報の編集ページからいつでもできるため、
    // ここに専用の入り口が無くても困らない）
    if(!mats.length) return "";
    let body;
    if(mats.every(m=>!m.side)){
      body = `<ul class="mlist">${mats.map(m=>matRowHtml(m,caseId)).join("")}</ul>`;
    }else{
      const order=[], groups={};
      mats.forEach(m=>{
        const side=m.side||"その他";
        if(!groups[side]){ groups[side]=[]; order.push(side); }
        groups[side].push(m);
      });
      body = order.map(side=>
        `<p class="mside-h ${SIDE_CLASS[side]||""}">${escapeHtml(side)}</p><ul class="mlist">${groups[side].map(m=>matRowHtml(m,caseId)).join("")}</ul>`
      ).join("");
    }
    return `<p class="subhead">訴訟資料一覧</p>
      ${body}
      ${me.canWrite?`<p class="qact"><a href="case-edit.html?id=${encodeURIComponent(caseId)}&open=mat:new">＋ 資料を編集</a></p>`:""}`;
  }

  // ---- 行ってきたよ掲示板 ----
  // 発言者ごとの色（吹き出しの頭の「原告」「被告」「裁判官」）
  const SUBJ_CLASS = { "原告":"g", "被告":"k", "裁判官":"j" };

  function bubbleHtml(p, roundLabel){
    const tail = p.verb==="求めた" ? "を求めました" : "と主張しました";
    return `<div class="bubble">`+
      `<span class="bwho ${SUBJ_CLASS[p.subject]||""}">${escapeHtml(p.subject)}</span>`+
      `<span class="btext">「${escapeHtml(p.quote)}」${tail}</span>`+
      (roundLabel?`<span class="bround">${escapeHtml(roundLabel)}</span>`:"")+
      (me.canWrite?`<a class="del" data-delpost="${escapeAttr(p.id)}">消す</a>`:"")+
      `</div>`;
  }

  // 「報告を書く」ボタン（左上・右下の2か所で使い回す。見出しが「掲示板」なので「傍聴の」は省く）
  function writeBtnHtml(caseId){
    return `<a data-openpost="${escapeAttr(caseId)}"><i class="bi bi-chat-left-text" aria-hidden="true"></i>報告を書く</a>`;
  }
  function boardHtml(caseId, full){
    const c = caseById(caseId);
    // 事件ごとに掲示板を非表示にできる（2026-08-25）。非表示なら既存の報告も含めて丸ごと出さない
    if(c && c.boardEnabled===false) return "";
    const rounds = caseEvents(caseId);
    const mine = casePosts(caseId);
    // 投稿できるのは：スパム対策(Turnstile)設定済みのとき＝誰でも／未設定でも運営は可。
    // 事件が「投稿を制限する」設定のときは、一般の匿名投稿を締めて運営のみにする
    const canPost = (c && c.boardRestricted ? me.canWrite : (me.boardOpen || me.canWrite)) && rounds.length>0;
    // フォームを開いている間は、左上・右下どちらのボタンも隠す（フォーム自体は右下の位置に出る）
    const showWriteBtn = canPost && boardFormForCase!==caseId;
    const items = mine.map(p=>{
      const ev = rounds.find(e=>e.id===p.eventId);
      return bubbleHtml(p, (ev && ev.type) || p.round || "");
    }).join("");
    let html=`<div class="bpanel">`+
      `<div class="bhead"><span class="btitle"><span class="bt-red">傍聴に行ってきたよ</span><span class="bt-bang">！</span><span class="nowrap">掲示板</span></span>`+
      (mine.length?`<span class="bcount">${mine.length}件の報告</span>`:"")+
      `</div>`+
      // 掲示板だけが独立した箱になったので、どの事件の掲示板かが分かるようアイコン・事件名・いいねを添える。
      // アイコン（見出しの「傍」・下の事件カードのアイコンと左端がそろう）の右に、事件名・「報告を書く」を
      // 縦に2段重ねる（2026-08-24。アイコンが56pxと大きくなり、事件名の1行だけでは右に余白が余るため）。
      // 事件名は事件ページへのリンクにする（下線などの装飾はしない）。ただし事件ページ自身では
      // 自分へのリンクになってしまうので、そこだけは素のテキストのまま
      (c?`<div class="board-id">${iconHtml(c)}<div class="board-id-main">`+
          `<p class="d-title board-name">${full
            ? escapeHtml(c.name)
            : `<a class="board-name-link" href="case?id=${encodeURIComponent(c.id)}">${escapeHtml(c.name)}</a>`
          } ${likeHtml(c)}</p>`+
          // 左上（事件名の下）にも書き込みボタンを置く。長い報告一覧を下までスクロールしなくても書き始められる
          (showWriteBtn?`<p class="bwrite bwrite-top">${writeBtnHtml(caseId)}</p>`:"")+
        `</div></div>`:"");
    html += items
      || `<p class="board-empty">${canPost
          ? "まだ報告はありません。傍聴に行かれた方の最初の報告をお待ちしています。"
          : "まだ報告はありません。"}</p>`;
    if(canPost){
      html += boardFormForCase===caseId
        ? postFormHtml(caseId)
        : `<p class="bwrite">${writeBtnHtml(caseId)}</p>`;
    }else if(rounds.length){
      // 一般の投稿はまだ受け付けていない（Turnstile未設定）。運営は編集パスワードで書けるので、その導線だけ出す
      html += `<p class="board-empty">傍聴の報告の投稿には、<a data-unlock="1">パスワード</a>が必要です。</p>`;
    }
    html += `</div>`;
    return html;
  }

  function postFormHtml(caseId){
    const c = caseById(caseId);
    const rounds = caseEvents(caseId);
    const today = todayStr();
    let defaultIdx = 0;
    rounds.forEach((e,i)=>{ if(e.date<=today) defaultIdx=i; });
    const roundOptions = rounds.map((e,i)=>
      `<option value="${escapeAttr(e.id)}"${i===defaultIdx?" selected":""}>${escapeHtml(e.type||e.date)}</option>`
    ).join("");
    // フォームの先頭にも事件名を出す。報告が溜まると上の事件名の行はスクロールで画面外に出るので、
    // 「どの裁判への報告か」を投稿ボタンの直前でもう一度示して、書き間違いを防ぐ
    return `
      <div class="pform">
        ${c?`<p class="pform-case">${iconHtml(c)}<span>${escapeHtml(c.name)}</span></p>`:""}
        <div class="field">
          <label>どの期日についての報告ですか</label>
          <select id="pRound">${roundOptions}</select>
        </div>
        <div class="line">
          <select id="pSubject"><option>原告</option><option>被告</option><option>裁判官</option></select>
          <span>は「</span>
          <input type="text" id="pQuote" maxlength="60" placeholder="法廷で聞いたこと">
          <span>」</span>
          <select id="pVerb">
            <option value="主張した">と主張した</option>
            <option value="求めた">を求めた</option>
          </select>
        </div>
        <p class="count"><span id="pCount">0</span>／60字</p>
        <div class="ts" id="pTurnstile"></div>
        <div class="acts">
          <button class="send" id="pSend">投稿する</button>
          <button class="cancel" data-closepost="1">やめる</button>
        </div>
        <p class="note">法廷で実際に見聞きしたことだけを、この形にあてはめて書いてください。人の評価や感想は書けません。</p>
      </div>`;
  }

  function ensureTurnstileScript(){
    if(window.turnstile) return Promise.resolve();
    if(!tsScriptPromise){
      tsScriptPromise=new Promise((resolve,reject)=>{
        const s=document.createElement("script");
        s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async=true; s.defer=true;
        s.onload=resolve; s.onerror=reject;
        document.head.appendChild(s);
      });
    }
    return tsScriptPromise;
  }
  async function mountTurnstile(container){
    tsToken="";
    if(!me.turnstileSiteKey) return;      // ローカル開発ではウィジェットなしで通す
    const el=container.querySelector("#pTurnstile");
    if(!el) return;
    try{
      await ensureTurnstileScript();
      window.turnstile.render(el,{sitekey:me.turnstileSiteKey, action:"board-post", callback:(t)=>{ tsToken=t; }});
    }catch(e){
      el.innerHTML=`<span style="color:var(--mut);font-size:.75rem">スパム対策の読み込みに失敗しました。再読み込みしてください。</span>`;
    }
  }

  async function submitPost(caseId, container){
    const quote=container.querySelector("#pQuote").value.trim();
    if(!quote){ alert("かぎ括弧の中を入力してください。"); return; }
    const data={
      eventId: container.querySelector("#pRound").value,
      subject: container.querySelector("#pSubject").value,
      verb: container.querySelector("#pVerb").value,
      quote,
    };
    const send=container.querySelector("#pSend"); send.disabled=true;
    try{
      const created=await api("POST","/api/posts",data, tsToken?{"X-Turnstile-Token":tsToken}:undefined);
      posts.push(created);
      boardFormForCase=null; tsToken="";
      if(onChange) onChange();
    }catch(err){
      alert("投稿できませんでした：" + (err && err.message || err));
      send.disabled=false;
    }
  }
  async function removePost(id){
    if(!confirm("この投稿を消します。よろしいですか？")) return;
    try{
      await apiDeletePost(id);
      posts=posts.filter(p=>p.id!==id);
      if(onChange) onChange();
    }catch(err){ alert("消せませんでした：" + (err && err.message || err)); }
  }

  // ---- いいね ----
  async function toggleLike(caseId, btn){
    const c=caseById(caseId); if(!c) return;
    btn.disabled=true;
    try{
      const r = c.liked ? await apiUnlike(caseId) : await apiLike(caseId);
      c.likes=r.likes; c.liked=r.liked;
      if(onChange) onChange();
    }catch(err){ btn.disabled=false; }
  }

  // ---- 期日のお気に入り ----
  // ボタン自身も直接書き換える：カレンダーの日付ポップオーバーは onChange の再描画対象に入っていない
  // （開いている間はそのまま）ため、押した本人のボタンだけは即座に見た目を反映させておく。
  // 他の場所（今後の期日・タイムライン・期日をさがす）は onChange の再描画で自然に揃う。
  async function toggleBookmark(eventId, btn){
    const ev=events.find(e=>e.id===eventId); if(!ev) return;
    btn.disabled=true;
    try{
      const r = ev.bookmarked ? await apiUnbookmark(eventId) : await apiBookmark(eventId);
      ev.bookmarked=r.bookmarked;
      btn.classList.toggle("on", ev.bookmarked);
      btn.setAttribute("aria-pressed", ev.bookmarked?"true":"false");
      const i=btn.querySelector("i"); if(i) i.className="bi "+(ev.bookmarked?"bi-bookmark-fill":"bi-bookmark");
      btn.disabled=false;
      if(onChange) onChange();
    }catch(err){ btn.disabled=false; }
  }

  // 事件のカードを、指定した入れ物に描く（トップの「最近の期日」／事件ページ共通）
  function renderCaseDetail(container, caseId, opts){
    const full = !!(opts && opts.full);
    if(!loaded){
      container.innerHTML = `<div class="card"><p class="empty-msg">読み込んでいます…</p></div>`;
      return;
    }
    if(!caseId){
      container.innerHTML = `<div class="card"><p class="empty-msg">これから先の期日は、まだ登録されていません。</p></div>`;
      return;
    }
    const html = caseCardHtml(caseId, full);
    if(!html){
      container.innerHTML =
        `<div class="card"><p class="empty-msg">その事件は見つかりませんでした。</p>`+
        `<p class="qact" style="text-align:center;padding-bottom:20px"><a href="index.html">カレンダーに戻る</a></p></div>`;
      return;
    }
    container.innerHTML = html;
    wireCaseDetail(container, caseId, opts);
  }

  function wireCaseDetail(container, caseId, opts){
    const rerender=()=>renderCaseDetail(container, caseId, opts);
    container.querySelectorAll("[data-gal]").forEach(gal=>wireGallery(gal));
    // 写真・期日・資料の追加・編集・並び替えは、すべて事件情報の編集ページ（case-edit.html）への
    // 普通のリンクになった（2026-08-27）。ここでのJSでの配線は不要
    container.querySelectorAll("[data-like]").forEach(b=>{
      b.addEventListener("click",()=>toggleLike(b.dataset.like, b));
    });
    container.querySelectorAll("[data-bookmark]").forEach(b=>{
      b.addEventListener("click",(e)=>{ e.stopPropagation(); toggleBookmark(b.dataset.bookmark, b); });
    });
    container.querySelectorAll("[data-sumopen]").forEach(b=>{
      b.addEventListener("click",(e)=>{
        e.stopPropagation();
        openSummaryModal(b.dataset.sumopen);
      });
    });
    container.querySelectorAll("[data-copylink]").forEach(b=>{
      b.addEventListener("click",async ()=>{
        try{
          await navigator.clipboard.writeText(b.dataset.copylink);
          const orig=b.innerHTML;
          b.innerHTML=`<i class="bi bi-check2" aria-hidden="true"></i>`;
          b.classList.add("copied");
          setTimeout(()=>{ b.innerHTML=orig; b.classList.remove("copied"); },1500);
        }catch(err){
          alert("コピーできませんでした。アドレス欄からコピーしてください。");
        }
      });
    });
    container.querySelectorAll("[data-copybody]").forEach(b=>{
      b.addEventListener("click",async ()=>{
        const m = materialById(b.dataset.copybody); if(!m) return;
        const c = caseById(m.caseId);
        const meta = [c?c.name:"", [m.side,m.kind].filter(Boolean).join("・"), m.title].filter(Boolean).join("／");
        const text = meta ? `${meta}\n\n${m.body}` : m.body;
        try{
          await navigator.clipboard.writeText(text);
          const orig=b.innerHTML;
          b.innerHTML=`<i class="bi bi-check2" aria-hidden="true"></i>コピーしました`;
          b.classList.add("copied");
          setTimeout(()=>{ b.innerHTML=orig; b.classList.remove("copied"); },1500);
        }catch(err){
          alert("コピーできませんでした。");
        }
      });
    });
    container.querySelectorAll("[data-openpost]").forEach(a=>{
      a.addEventListener("click",()=>{ boardFormForCase=a.dataset.openpost; rerender(); });
    });
    container.querySelectorAll("[data-closepost]").forEach(b=>{
      b.addEventListener("click",()=>{ boardFormForCase=null; tsToken=""; rerender(); });
    });
    container.querySelectorAll("[data-delpost]").forEach(a=>{
      a.addEventListener("click",()=>removePost(a.dataset.delpost));
    });
    const unlockLink = container.querySelector("[data-unlock]");
    if(unlockLink) unlockLink.addEventListener("click",unlockEditing);
    const q=container.querySelector("#pQuote");
    if(q){
      const c=container.querySelector("#pCount");
      q.addEventListener("input",()=>{ c.textContent=[...q.value].length; });
      q.focus();
    }
    const send=container.querySelector("#pSend");
    if(send) send.addEventListener("click",()=>submitPost(caseId, container));
    if(boardFormForCase===caseId) mountTurnstile(container);
  }

  // ================= 下部のひっそりしたステータス =================
  // opts.hideWhenUnlocked: トップページ用。トップはシンプルにしたいので、編集ロック解除中は何も表示しない
  // （編集の導線は事件ページ・事件をさがすページに集約する。ロックされている間の案内はトップにも出す）
  // el は「ソースコード」リンクと同じ行に続ける想定（区切りは付けず、間は半角スペースだけで空ける）
  function renderStatus(el, opts){
    opts = opts || {};
    if(!loaded){ el.innerHTML=""; return; }
    if(me.canWrite){
      if(opts.hideWhenUnlocked){ el.innerHTML=""; return; }
      el.innerHTML =
        `<br>編集できます ── この端末は編集ロック解除済みです。`+
        `<br><a id="stAddCase">新たな事件を追加</a><span class="sep">・</span>`+
        `<a id="stLock">ロックする</a>`+
        `<br><span class="status-sub">バックアップ（複数件をまとめて登録・復元するとき用）：`+
        `<a id="stExport">書き出す</a><span class="sep">・</span>`+
        `<a id="stImport">ファイルから取り込む</a></span>`;
      el.querySelector("#stAddCase").addEventListener("click",()=>{ location.href="case-edit.html"; });
      el.querySelector("#stLock").addEventListener("click",lockEditing);
      el.querySelector("#stExport").addEventListener("click",exportData);
      el.querySelector("#stImport").addEventListener("click",()=>{
        const fi=document.getElementById("fileInput"); if(fi) fi.click();
      });
    }else{
      el.innerHTML =
        ` <a id="stUnlock" title="期日の追加・編集には、パスワードが必要です。"><i class="bi bi-lock" aria-hidden="true"></i> 事務局用</a>`;
      el.querySelector("#stUnlock").addEventListener("click",unlockEditing);
    }
  }
  async function unlockEditing(){
    const pw = prompt("編集パスワードを入力してください");
    if(pw==null) return;
    editKey = pw;
    try{
      const r = await apiMe();
      if(r && r.canWrite){
        localStorage.setItem(EDITKEY_LS, editKey);
        me = r;
        if(onChange) onChange();
      }else{
        editKey=""; alert("パスワードが違います。");
      }
    }catch(e){ editKey=""; alert("確認できませんでした：" + (e.message||e)); }
  }
  function lockEditing(){
    editKey=""; localStorage.removeItem(EDITKEY_LS);
    me = Object.assign({}, me, {canWrite:false});
    if(onChange) onChange();
  }

  // ================= モーダル：AIによる要約のポップアップのみ（閲覧専用） =================
  // 写真・事件情報・期日・資料の編集は、2026-08-27にすべて全画面の編集ページ（case-edit.html）へ
  // 移した（旧・タブ切替の1つの窓は廃止）。要約ポップアップだけは読み取り専用でどのページにも
  // 出うるため、引き続きここでHTMLを作って先に差し込む
  const EXTRA_MODALS = `
<div class="overlay" id="sumOverlay">
  <div class="modal sum-modal">
    <div class="mhead" id="sumModalTitle"></div>
    <div class="mbody">
      <p class="msec">AIによる要約</p>
      <p class="sum-text" id="sumModalText"></p>
    </div>
    <div class="mfoot">
      <span class="spacer"></span>
      <button class="btn-cancel" id="sumClose">閉じる</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML("beforeend", EXTRA_MODALS);

  // ---- 入力欄（textarea）は書いた分だけ自動で伸ばす（2026-08-27） ----
  // 2行の覗き窓＋内側スクロールで長文を編集させない。プログラムから値を入れたとき（fill○○）は
  // inputイベントが出ないので、値を入れた直後に autosizeAll() を呼び直す（非表示の間は
  // scrollHeight が 0 になるため、必ず表示してから測る）。事件情報の編集ページ・写真/期日/資料の
  // 行内エディタ、どちらからも使う共通ユーティリティ
  function autosize(el){ el.style.height="auto"; el.style.height=(el.scrollHeight+2)+"px"; }
  function wireAutosize(root){
    root.querySelectorAll("textarea").forEach(el=>{
      if(el.dataset.auto) return;
      el.dataset.auto="1";
      el.addEventListener("input",()=>autosize(el));
    });
  }
  function autosizeAll(root){ (root||document).querySelectorAll("textarea[data-auto]").forEach(autosize); }

  const $ = (id)=>document.getElementById(id);

  // ================= 事件情報の編集ページ（case-edit.html、2026-08-27） =================
  // 事件情報はモーダルから分離し、全画面ページで編集する。フォームの実体は case-edit.html に
  // 静的に置いてあり、ここではそのページでだけ配線する（他のページでは何もしない）。
  // 欄の並びは事件ページの実際の掲載順（掲示板→事件名とタグ→終結→争点・当事者→裁判について→関連裁判）。
  let initCaseEditPage = function(){};
  if(document.getElementById("cName")){
    const cFields = { name:$("cName"), caseNo:$("cCaseNo"), plaintiff:$("cPlaintiff"), defendant:$("cDefendant"), judge:$("cJudge"), points:$("cPoints"),
                      callText:$("cCall"), press:$("cPress"), plaintiffLinks:$("cPlaintiffLinks"), defendantLinks:$("cDefendantLinks"),
                      tags:$("cTags"), related:$("cRelated"), archivedAt:$("cArchivedAt"), closeType:$("cCloseType") };
    const cBoardEnabled=$("cBoardEnabled"), cBoardRestricted=$("cBoardRestricted");
    const cCaseNoPublic=$("cCaseNoPublic");
    // 争点・当事者〜関連裁判の各項目を、トップのピックアップカードにも出すかの項目ごとのチェックボックス（2026-08-28）
    const cShowOnTop = { caseNo:$("cShowCaseNoOnTop"), points:$("cShowPointsOnTop"), plaintiff:$("cShowPlaintiffOnTop"),
                          defendant:$("cShowDefendantOnTop"), judge:$("cShowJudgeOnTop"), press:$("cShowPressOnTop"),
                          call:$("cShowCallOnTop"), related:$("cShowRelatedOnTop") };
    const cNoticeFile=$("cNoticeFile"), cNoticeRemove=$("cNoticeRemove"), cNoticeNote=$("cNoticeNote"), cNoticeStatus=$("cNoticeStatus");
    const cPresenterSelect=$("cPresenterSelect"), cPresenterNewRow=$("cPresenterNewRow"), cPresenterNewNickname=$("cPresenterNewNickname"),
          cPresenterNewSave=$("cPresenterNewSave"), cPresenterIconRow=$("cPresenterIconRow"), cPresenterIconPreview=$("cPresenterIconPreview"),
          cPresenterIconFile=$("cPresenterIconFile"), cPresenterIconRemove=$("cPresenterIconRemove"),
          cPresenterRenameRow=$("cPresenterRenameRow"), cPresenterRenameNickname=$("cPresenterRenameNickname"), cPresenterRenameSave=$("cPresenterRenameSave"),
          cPresenterStatus=$("cPresenterStatus");
    // 連絡先は入力欄を廃止したが、既存データは保持する（保存のたびに空で上書きしないよう、
    // 編集を開いたときの値をここに覚えておいて、保存時にそのまま送り返す）
    let editingCaseContact="";
    let edCaseId=null;    // 編集対象の事件ID（null＝新規作成）
    let edInited=false;   // フォームを一度充填したか（onChangeのたびに入力中の内容を上書きしないため）
    let edDirty=false;    // 未保存の入力があるか（ページを離れる前の確認に使う）
    // 問題提起人プルダウンの選択肢を作る（未設定／既存の問題提起人／＋新規作成）
    function renderPresenterOptions(selectedId){
      const opts = [`<option value="">（未設定）</option>`]
        .concat(presenters.map(p=>`<option value="${escapeAttr(p.id)}"${p.id===selectedId?" selected":""}>${escapeHtml(p.nickname)}${p.caseCount?`（${p.caseCount}件）`:""}</option>`))
        .concat([`<option value="__new__">＋ 新しい問題提起人を作る…</option>`]);
      cPresenterSelect.innerHTML = opts.join("");
      if(selectedId) cPresenterSelect.value = selectedId;
    }
    // 選んだ内容に応じて、新規作成欄・アイコン欄の出し分けを更新する
    // （説明文 cPresenterIconNote はアイコン欄の中にあるので、欄ごと出し入れすれば一緒に付いてくる）
    function updatePresenterFieldUI(){
      const v = cPresenterSelect.value;
      cPresenterStatus.hidden = true;
      if(v==="__new__"){
        cPresenterNewRow.hidden=false; cPresenterIconRow.hidden=true; cPresenterRenameRow.hidden=true;
        cPresenterNewNickname.value="";
      }else if(v){
        cPresenterNewRow.hidden=true; cPresenterIconRow.hidden=false; cPresenterRenameRow.hidden=false;
        const p = presenterById(v);
        cPresenterRenameNickname.value = p ? p.nickname : "";
        cPresenterIconPreview.innerHTML = p && p.icon
          ? `<img class="cicon" src="${escapeAttr(p.icon)}" alt="">`
          : `<span class="cicon cicon-ph" aria-hidden="true">${escapeHtml(placeholderChar(p?p.nickname:""))}</span>`;
        cPresenterIconRemove.hidden = !(p && p.icon);
      }else{
        cPresenterNewRow.hidden=true; cPresenterIconRow.hidden=true; cPresenterRenameRow.hidden=true;
      }
    }
    cPresenterSelect.addEventListener("change", updatePresenterFieldUI);
    // 「作成」を押すとその場ですぐ問題提起人を作り、続けてアイコンも設定できるようにする
    cPresenterNewSave.addEventListener("click", async ()=>{
      const nickname = cPresenterNewNickname.value.trim();
      if(!nickname){ alert("ニックネームを入力してください。"); cPresenterNewNickname.focus(); return; }
      cPresenterNewSave.disabled=true;
      try{
        const created = await apiCreatePresenter({nickname});
        presenters.push(created);
        renderPresenterOptions(created.id);
        updatePresenterFieldUI();
      }catch(err){ alert(saveErr(err)); }
      finally{ cPresenterNewSave.disabled=false; }
    });
    // ニックネームの変更（同じ問題提起人の他の事件もまとめて表示名が変わる）
    cPresenterRenameSave.addEventListener("click", async ()=>{
      const pid=cPresenterSelect.value;
      if(!pid || pid==="__new__") return;
      const nickname = cPresenterRenameNickname.value.trim();
      if(!nickname){ alert("ニックネームを入力してください。"); cPresenterRenameNickname.focus(); return; }
      cPresenterRenameSave.disabled=true;
      cPresenterStatus.hidden=false; cPresenterStatus.textContent="変更しています…";
      try{
        const up = await apiUpdatePresenter(pid, {nickname});
        const i=presenters.findIndex(x=>x.id===pid); if(i>=0) presenters[i]=up;
        renderPresenterOptions(pid); updatePresenterFieldUI();
        cPresenterStatus.hidden=false; cPresenterStatus.textContent="ニックネームを変更しました。";
        await reloadCases();
      }catch(err){ cPresenterStatus.hidden=false; cPresenterStatus.textContent="変更できませんでした：" + (err && err.message || err); }
      finally{ cPresenterRenameSave.disabled=false; }
    });
    cPresenterIconFile.addEventListener("change", async ()=>{
      const f=cPresenterIconFile.files[0];
      const pid=cPresenterSelect.value;
      if(!f || !pid || pid==="__new__") return;
      if(!["image/jpeg","image/webp"].includes(f.type)){ alert("アイコンは JPEG・WebP のみ登録できます。"); cPresenterIconFile.value=""; return; }
      if(f.size>5*1024*1024){ alert("アイコンは5MBまでです。"); cPresenterIconFile.value=""; return; }
      const fd=new FormData(); fd.append("file", f, f.name);
      cPresenterStatus.hidden=false; cPresenterStatus.textContent="アップロード中…";
      try{
        const up=await apiUpdatePresenterIcon(pid,fd);
        const i=presenters.findIndex(x=>x.id===pid); if(i>=0) presenters[i]=up;
        renderPresenterOptions(pid); updatePresenterFieldUI();
        cPresenterStatus.hidden=false; cPresenterStatus.textContent="アイコンを更新しました。";
        await reloadCases();
      }catch(err){ cPresenterStatus.hidden=false; cPresenterStatus.textContent="アップロードできませんでした：" + (err && err.message || err); }
      finally{ cPresenterIconFile.value=""; }
    });
    cPresenterIconRemove.addEventListener("click", async ()=>{
      const pid=cPresenterSelect.value;
      if(!pid || pid==="__new__") return;
      if(!confirm("アイコンを外します。よろしいですか？")) return;
      cPresenterStatus.hidden=false; cPresenterStatus.textContent="外しています…";
      try{
        const up=await apiDeletePresenterIcon(pid);
        const i=presenters.findIndex(x=>x.id===pid); if(i>=0) presenters[i]=up;
        updatePresenterFieldUI();
        cPresenterStatus.hidden=false; cPresenterStatus.textContent="アイコンを外しました。";
        await reloadCases();
      }catch(err){ cPresenterStatus.hidden=false; cPresenterStatus.textContent="外せませんでした：" + (err && err.message || err); }
    });
    // ---- 期日案内（JPEGのみ。事件につき1枚・差し替え専用。選ぶとすぐ反映される＝presenterアイコンと同じ挙動） ----
    function updateNoticeFieldUI(c){
      const has = !!(c && c.noticeUrl);
      cNoticeRemove.hidden = !has;
      cNoticeNote.innerHTML = (has
        ? `いまの案内：<a href="${escapeAttr(c.noticeUrl)}" target="_blank" rel="noopener">${escapeHtml(c.noticeFileName||"ファイル")}</a>　ファイルを選ぶと差し替わります。`
        : `JPEG、20MBまで。支援者向けの「裁判期日一覧のご案内」のようなチラシを想定しています。選ぶとすぐ反映され（「保存」を待ちません）、事件ページとトップに埋め込み表示されます。`)
        + `<a id="cNoticeRemove" class="cicon-remove" ${has?"":"hidden"}>外す</a>`;
      // innerHTML で作り直したので、id="cNoticeRemove" は同じidの新しい要素に置き換わっている。参照を取り直して配線する
      const removeLink = $("cNoticeRemove");
      if(removeLink) removeLink.addEventListener("click", onNoticeRemove);
    }
    async function onNoticeRemove(){
      if(!edCaseId) return;
      if(!confirm("期日案内を外します。よろしいですか？")) return;
      cNoticeStatus.hidden=false; cNoticeStatus.textContent="外しています…";
      try{
        const up=await apiDeleteCaseNotice(edCaseId);
        const i=cases.findIndex(x=>x.id===edCaseId); if(i>=0) cases[i]=up;
        updateNoticeFieldUI(up);
        cNoticeStatus.hidden=false; cNoticeStatus.textContent="外しました。";
      }catch(err){ cNoticeStatus.hidden=false; cNoticeStatus.textContent="外せませんでした：" + (err && err.message || err); }
    }
    cNoticeFile.addEventListener("change", async ()=>{
      const f=cNoticeFile.files[0];
      if(!f || !edCaseId) return;
      if(f.type!=="image/jpeg"){ alert("期日案内は JPEG のみ登録できます。"); cNoticeFile.value=""; return; }
      if(f.size>20*1024*1024){ alert("ファイルは20MBまでです。"); cNoticeFile.value=""; return; }
      const fd=new FormData(); fd.append("file", f, f.name);
      cNoticeStatus.hidden=false; cNoticeStatus.textContent="アップロード中…";
      try{
        const up=await apiUpdateCaseNotice(edCaseId,fd);
        const i=cases.findIndex(x=>x.id===edCaseId); if(i>=0) cases[i]=up;
        updateNoticeFieldUI(up);
        cNoticeStatus.hidden=false; cNoticeStatus.textContent="アップロードしました。";
      }catch(err){ cNoticeStatus.hidden=false; cNoticeStatus.textContent="アップロードできませんでした：" + (err && err.message || err); }
      finally{ cNoticeFile.value=""; }
    });
    function fillCaseForm(c){
      cFields.name.value=c.name||""; cFields.caseNo.value=c.caseNo||"";
      cCaseNoPublic.checked = c.caseNoPublic===true;
      cShowOnTop.caseNo.checked = c.showCaseNoOnTop===true;
      cShowOnTop.points.checked = c.showPointsOnTop===true;
      cShowOnTop.plaintiff.checked = c.showPlaintiffOnTop===true;
      cShowOnTop.defendant.checked = c.showDefendantOnTop===true;
      cShowOnTop.judge.checked = c.showJudgeOnTop===true;
      cShowOnTop.press.checked = c.showPressOnTop===true;
      cShowOnTop.call.checked = c.showCallOnTop===true;
      cShowOnTop.related.checked = c.showRelatedOnTop===true;
      cFields.plaintiff.value=c.plaintiffName||""; cFields.defendant.value=c.defendantName||"";
      cFields.judge.value=c.judge||"";
      cFields.points.value=(c.points||[]).join("\n"); cFields.callText.value=c.callText||"";
      editingCaseContact=c.contact||"";
      cFields.press.value=(c.press||[]).join("\n");
      cFields.plaintiffLinks.value=(c.plaintiffLinks||[]).join("\n");
      cFields.defendantLinks.value=(c.defendantLinks||[]).join("\n");
      cFields.tags.value=(c.tags||[]).join("\n");
      // 関連裁判はIDで持つが、入力欄には事件名で表示する（見つからないIDは消えている事件なので無視）
      cFields.related.value=(c.relatedCaseIds||[]).map(id=>caseById(id)).filter(Boolean).map(r=>r.name).join("\n");
      cFields.archivedAt.value=c.archivedAt||""; cFields.closeType.value=c.closeType||"";
      cBoardEnabled.checked = c.boardEnabled!==false;
      cBoardRestricted.checked = c.boardRestricted===true;
      renderPresenterOptions(c.presenterId||"");
      updatePresenterFieldUI();
      updateNoticeFieldUI(c);
    }
    async function saveCase(){
      if(!me.canWrite) return;
      const name=cFields.name.value.trim();
      if(!name){ alert("事件名を入力してください。"); cFields.name.focus(); return; }
      // 関連裁判：1行1事件名→サイトに登録済みの事件のIDに変換する（期日の事件名と同じく、未登録の事件名は指定できない）
      const relatedNames=cFields.related.value.split("\n").map(s=>s.trim()).filter(Boolean);
      const relatedCaseIds=[];
      const unknownRelated=[];
      relatedNames.forEach(n=>{
        const found=caseByName(n);
        if(!found) { unknownRelated.push(n); return; }
        if(edCaseId && found.id===edCaseId) return; // 自分自身は無視
        if(!relatedCaseIds.includes(found.id)) relatedCaseIds.push(found.id);
      });
      if(unknownRelated.length){
        alert(`関連裁判のうち、次の事件名はまだ登録されていません。先にその事件を登録するか、事件名を確認してください：\n${unknownRelated.join("\n")}`);
        cFields.related.focus();
        return;
      }
      // 問題提起人：「＋新規作成」を選んだままなら、保存の前にここで作る（作成ボタンを押し忘れていても保存できるように）
      let presenterId = cPresenterSelect.value;
      if(presenterId==="__new__"){
        const nickname = cPresenterNewNickname.value.trim();
        if(!nickname){ alert("問題提起人のニックネームを入力するか、「（未設定）」に戻してください。"); cPresenterNewNickname.focus(); return; }
        try{
          const created = await apiCreatePresenter({nickname});
          presenters.push(created);
          presenterId = created.id;
          renderPresenterOptions(presenterId); updatePresenterFieldUI();
        }catch(err){ alert(saveErr(err)); return; }
      }
      const data={
        name, presenterId, caseNo:cFields.caseNo.value.trim(), caseNoPublic:cCaseNoPublic.checked,
        showCaseNoOnTop:cShowOnTop.caseNo.checked, showPointsOnTop:cShowOnTop.points.checked,
        showPlaintiffOnTop:cShowOnTop.plaintiff.checked, showDefendantOnTop:cShowOnTop.defendant.checked,
        showJudgeOnTop:cShowOnTop.judge.checked, showPressOnTop:cShowOnTop.press.checked,
        showCallOnTop:cShowOnTop.call.checked, showRelatedOnTop:cShowOnTop.related.checked,
        plaintiffName:cFields.plaintiff.value.trim(), defendantName:cFields.defendant.value.trim(),
        judge:cFields.judge.value.trim(),
        points:cFields.points.value.split("\n").map(s=>s.trim()).filter(Boolean),
        callText:cFields.callText.value.trim(),
        contact:editingCaseContact,
        press:cFields.press.value.split("\n").map(s=>s.trim()).filter(Boolean),
        plaintiffLinks:cFields.plaintiffLinks.value.split("\n").map(s=>s.trim()).filter(Boolean),
        defendantLinks:cFields.defendantLinks.value.split("\n").map(s=>s.trim()).filter(Boolean),
        tags:cFields.tags.value.split("\n").map(s=>s.trim()).filter(Boolean),
        relatedCaseIds,
        archivedAt:cFields.archivedAt.value, closeType:cFields.closeType.value.trim(),
        boardEnabled:cBoardEnabled.checked, boardRestricted:cBoardRestricted.checked,
      };
      $("cSave").disabled=true;
      try{
        let goId;
        if(edCaseId){
          const up=await apiUpdateCase(edCaseId,data);
          goId=up.id;
        }else{
          const created=await apiCreateCase(data);
          goId=created.id;
        }
        // 保存できたら事件ページへ戻って結果を見る（見たまま確認の往復）
        edDirty=false;
        location.href="case?id="+encodeURIComponent(goId);
      }catch(err){ alert(saveErr(err)); $("cSave").disabled=false; }
    }
    async function deleteCase(){
      if(!edCaseId || !me.canWrite) return;
      if(!confirm("この事件を削除します。よろしいですか？（期日や資料が残っていると削除できません）")) return;
      $("cDelete").disabled=true;
      try{
        await apiDeleteCase(edCaseId);
        edDirty=false;
        location.href="index.html";
      }catch(err){ alert(saveErr(err)); $("cDelete").disabled=false; }
    }
    $("cSave").addEventListener("click",saveCase);
    $("cCancel").addEventListener("click",()=>{
      edDirty=false;   // キャンセル＝破棄の意思表示なので、beforeunloadの確認は出さない
      location.href = edCaseId ? "case?id="+encodeURIComponent(edCaseId) : "index.html";
    });
    $("cDelete").addEventListener("click",deleteCase);
    const ceForm=$("ceForm");
    wireAutosize(ceForm);
    // 写真・期日・資料の行内エディタ（.ieditor）は保存・削除・閉じるがそれぞれ独立して完結するので、
    // その中の入力は「事件情報」側の未保存扱い（edDirty）に含めない（含めると、行を保存・キャンセル
    // しただけで「事件情報に未保存の変更がある」という誤った警告が出てしまう）
    ceForm.addEventListener("input",(e)=>{ if(!e.target.closest(".ieditor")) edDirty=true; });
    ceForm.addEventListener("change",(e)=>{ if(!e.target.closest(".ieditor")) edDirty=true; });
    window.addEventListener("beforeunload",(e)=>{ if(edDirty){ e.preventDefault(); e.returnValue=""; } });
    // ページの初期化。CC.load() 後にページ側から呼ぶ。編集ロック解除（onChange）でも呼ばれるが、
    // フォームの充填は一度だけ（アイコン即時反映などの onChange で入力中の内容を上書きしない）
    initCaseEditPage = function(){
      if(!loaded) return;
      const locked=$("ceLocked"), grid=$("ceGrid");
      if(!me.canWrite){ locked.hidden=false; grid.hidden=true; return; }
      locked.hidden=true; grid.hidden=false;
      if(edInited) return;
      edInited=true;
      const params=new URLSearchParams(location.search);
      const id=params.get("id")||"";
      if(id){
        const c=caseById(id);
        if(!c){
          grid.hidden=true; locked.hidden=false;
          locked.querySelector(".empty-msg").textContent="その事件は見つかりませんでした。";
          return;
        }
        edCaseId=id;
        $("ceTitle").textContent="事件情報を編集";
        $("ceCaseName").textContent=c.name;
        document.title=c.name+"の編集 ｜ 応援傍聴ナビ";
        $("ceBack").href="case?id="+encodeURIComponent(id);
        $("ceBackLabel").textContent="事件ページに戻る";
        $("cDelete").style.display="";
        fillCaseForm(c);
      }else{
        edCaseId=null;
        $("ceTitle").textContent="事件を追加";
        document.title="事件を追加 ｜ 応援傍聴ナビ";
        $("ceBack").href="index.html";
        $("ceBackLabel").textContent="トップに戻る";
        $("cDelete").style.display="none";
        fillCaseForm({});
      }
      autosizeAll(ceForm);   // gridはこの時点で表示済みなので同期で測れる
      renderImgList(); renderEvList(); renderMatList();
      // 新規作成のときはまだ事件が無いので、写真・期日・資料の3節ごと隠す
      document.querySelectorAll(".lssec").forEach(s=>{ s.hidden = !edCaseId; });
      $("sec-notice").hidden = !edCaseId;
      openDeepLink();
    };

    // ================= 写真・期日・資料（1件ずつ、行を開いてその場で編集する。2026-08-27） =================
    // 事件情報の保存とは別に、1件ごとにその場で保存する。開けるのは同時に1件だけ
    // （どれかを開くと、他の行・他の節で開いていたエディタは閉じる）。
    function closeEditor(){
      document.querySelectorAll(".ieditor").forEach(x=>x.remove());
      document.querySelectorAll(".irow.editing").forEach(x=>x.classList.remove("editing"));
    }
    function openEditorAfter(afterEl, html){
      closeEditor();
      afterEl.insertAdjacentHTML("afterend", html);
      const root = afterEl.nextElementSibling;
      wireAutosize(root); autosizeAll(root);
      const first = root.querySelector("input,textarea,select");
      if(first) first.focus();
      return root;
    }

    // ---- 写真 ----
    function renderImgList(){
      const imgs = edCaseId ? caseImages(edCaseId) : [];
      const html = imgs.map((im,i)=>`<div class="irow" data-kind="img" data-id="${escapeAttr(im.id)}">
          <img class="ithumb" src="${escapeAttr(im.url)}" alt="">
          <span class="ititle">${im.caption?escapeHtml(im.caption):`<span class="mut">（説明なし）</span>`}</span>
          <span class="imove">
            ${i>0?`<a data-imgmove="${escapeAttr(im.id)}" data-dir="-1" title="前へ">↑</a>`:""}
            ${i<imgs.length-1?`<a data-imgmove="${escapeAttr(im.id)}" data-dir="1" title="後ろへ">↓</a>`:""}
          </span>
        </div>`).join("") || `<p class="d-body mut">まだ写真はありません。</p>`;
      $("imgList").innerHTML = html;
      $("imgCount").textContent = imgs.length + "件";
      $("navImgCount").textContent = imgs.length || "";
    }
    function imgEditorHtml(im){
      const isNew = !im;
      const hasR2 = im && im.url;
      return `<div class="ieditor">
        <div class="ihead">写真を${isNew?"追加":"編集"}</div>
        <div class="field"><label>写真ファイル ${isNew?'<span class="reqmark">＊</span>':""}</label>
          <input type="file" class="ef-file" accept="image/jpeg,image/png,image/webp">
          ${hasR2?`<p class="fnote">いまの写真：<img src="${escapeAttr(im.url)}" alt="" style="width:64px;height:46px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-left:6px">　ファイルを選ぶと差し替わります。</p>`:""}
          <p class="fnote">JPEG・PNG・WebP、12MBまで。証拠写真は人の顔・氏名・住所が写り込んでいないか確認してから登録してください。</p>
        </div>
        <div class="field"><label>説明（1行）</label><input type="text" class="ef-caption" value="${escapeAttr(im?im.caption:"")}" placeholder="例）提訴後の記者会見にて"></div>
        <div class="ifoot">
          ${isNew?"":`<button type="button" class="del" data-del="img" data-id="${escapeAttr(im.id)}">この写真を削除</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn-cancel" data-close>閉じる</button>
          <button type="button" class="btn-save" data-save="img" data-id="${isNew?"":escapeAttr(im.id)}">この写真を保存</button>
        </div>
      </div>`;
    }
    async function saveImgRow(root, id){
      if(!me.canWrite || !edCaseId) return;
      const f = root.querySelector(".ef-file").files[0];
      if(!id && !f){ alert("写真ファイルを選んでください。"); return; }
      if(f && f.size>12*1024*1024){ alert("写真は12MBまでです。"); return; }
      const fd=new FormData();
      fd.append("caseId", edCaseId);
      fd.append("caption", root.querySelector(".ef-caption").value.trim());
      if(f) fd.append("file", f, f.name);
      const btn=root.querySelector("[data-save]"); btn.disabled=true;
      try{
        if(id){
          const up=await apiUpdateImage(id,fd);
          const i=images.findIndex(x=>x.id===id); if(i>=0) images[i]=up;
        }else{
          const created=await apiCreateImage(fd);
          images.push(created);
        }
        closeEditor(); renderImgList();
      }catch(err){ alert(saveErr(err)); btn.disabled=false; }
    }
    async function deleteImgRow(id){
      if(!id || !me.canWrite) return;
      if(!confirm("この写真を削除します。よろしいですか？")) return;
      try{
        await apiDeleteImage(id);
        images=images.filter(x=>x.id!==id);
        closeEditor(); renderImgList();
      }catch(err){ alert(saveErr(err)); }
    }

    // ---- 期日 ----
    function renderEvList(){
      const evs = edCaseId ? caseEvents(edCaseId) : [];
      const html = evs.map(ev=>`<div class="irow" data-kind="ev" data-id="${escapeAttr(ev.id)}">
          <span class="idate">${escapeHtml(dotDate(ev.date))}</span>
          <span class="ititle">${escapeHtml(ev.type||"期日")}${ev.court||ev.place?`　<span class="mut">${escapeHtml([ev.court,ev.place].filter(Boolean).join(" "))}</span>`:""}</span>
        </div>`).join("") || `<p class="d-body mut">まだ期日はありません。</p>`;
      $("evList").innerHTML = html;
      $("evCount").textContent = evs.length + "件";
      $("navEvCount").textContent = evs.length || "";
    }
    const EVENT_TYPES = ["口頭弁論","弁論準備","進行協議","和解","尋問","当事者尋問","判決言渡","控訴審 第1回","提出期限（書面）"];
    function evEditorHtml(ev){
      const isNew = !ev;
      let e = ev;
      if(isNew){
        const rounds = caseEvents(edCaseId);
        const src = rounds[rounds.length-1];
        e = { date:"", time:"", type:"", court:src&&src.court||"", place:src&&src.place||"", open:true, reportMeeting:false, plaintiffArgument:[], defendantArgument:[] };
      }
      return `<div class="ieditor">
        <div class="ihead">期日を${isNew?"追加":"編集"}</div>
        <div class="two">
          <div class="field"><label>期日 <span class="reqmark">＊</span></label><input type="date" class="ef-date" value="${escapeAttr(e.date)}"></div>
          <div class="field"><label>時刻</label><input type="time" class="ef-time" value="${escapeAttr(e.time)}"></div>
        </div>
        <div class="field"><label>手続</label><input type="text" class="ef-type" list="evTypeList" value="${escapeAttr(e.type)}" placeholder="例）第3回口頭弁論">
          <datalist id="evTypeList">${EVENT_TYPES.map(t=>`<option value="${escapeAttr(t)}">`).join("")}</datalist>
        </div>
        <div class="two">
          <div class="field"><label>裁判所</label><input type="text" class="ef-court" value="${escapeAttr(e.court)}" placeholder="例）東京地方裁判所"></div>
          <div class="field"><label>法廷</label><input type="text" class="ef-place" value="${escapeAttr(e.place)}" placeholder="例）610号法廷"></div>
        </div>
        <div class="field"><label>原告の主張</label><span class="lhint">1行に1項目</span><textarea class="ef-plaintiff" placeholder="例）不開示決定の取消しを求める">${escapeHtml((e.plaintiffArgument||[]).join("\n"))}</textarea></div>
        <div class="field"><label>被告の主張</label><span class="lhint">1行に1項目</span><textarea class="ef-defendant" placeholder="例）該当する文書は保有していない">${escapeHtml((e.defendantArgument||[]).join("\n"))}</textarea></div>
        <div class="field"><label class="check"><input type="checkbox" class="ef-open" ${e.open!==false?"checked":""}> だれでも傍聴できます（外すと「非公開・要確認」）</label></div>
        <div class="field"><label class="check"><input type="checkbox" class="ef-report" ${e.reportMeeting?"checked":""}> 期日報告会があります</label></div>
        <div class="ifoot">
          ${isNew?"":`<button type="button" class="del" data-del="ev" data-id="${escapeAttr(ev.id)}">この期日を削除</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn-cancel" data-close>閉じる</button>
          <button type="button" class="btn-save" data-save="ev" data-id="${isNew?"":escapeAttr(ev.id)}">この期日を保存</button>
        </div>
      </div>`;
    }
    async function saveEvRow(root, id){
      if(!me.canWrite || !edCaseId) return;
      const date=root.querySelector(".ef-date").value;
      if(!date){ alert("期日（日付）を入力してください。"); return; }
      const data={
        caseId: edCaseId, date, time: root.querySelector(".ef-time").value,
        type: root.querySelector(".ef-type").value.trim(),
        court: root.querySelector(".ef-court").value.trim(), place: root.querySelector(".ef-place").value.trim(),
        open: root.querySelector(".ef-open").checked, reportMeeting: root.querySelector(".ef-report").checked,
        plaintiffArgument: root.querySelector(".ef-plaintiff").value.split("\n").map(s=>s.trim()).filter(Boolean),
        defendantArgument: root.querySelector(".ef-defendant").value.split("\n").map(s=>s.trim()).filter(Boolean),
      };
      const btn=root.querySelector("[data-save]"); btn.disabled=true;
      try{
        if(id){
          const up=await apiUpdate(id,data);
          const i=events.findIndex(x=>x.id===id); if(i>=0) events[i]=up;
        }else{
          const created=await apiCreate(data);
          events.push(created);
        }
        closeEditor(); renderEvList(); renderMatList();  // 資料の「どの期日か」候補も変わりうる
      }catch(err){ alert(saveErr(err)); btn.disabled=false; }
    }
    async function deleteEvRow(id){
      if(!id || !me.canWrite) return;
      if(!confirm("この期日を削除します。この期日への掲示板の報告も一緒に消えます。よろしいですか？")) return;
      try{
        await apiDelete(id);
        events=events.filter(e=>e.id!==id);
        posts=posts.filter(p=>p.eventId!==id);
        materials.forEach(m=>{ if(m.eventId===id) m.eventId=""; });
        closeEditor(); renderEvList(); renderMatList();
      }catch(err){ alert(saveErr(err)); }
    }

    // ---- 資料 ----
    function renderMatList(){
      const mats = edCaseId ? caseMaterials(edCaseId) : [];
      const html = mats.map(m=>`<div class="irow" data-kind="mat" data-id="${escapeAttr(m.id)}">
          ${m.side?`<span class="iside ${SIDE_CLASS[m.side]||""}">${escapeHtml(m.side)}</span>`:""}
          <span class="ititle">${escapeHtml(m.title)}</span>
        </div>`).join("") || `<p class="d-body mut">まだ資料はありません。</p>`;
      $("matList").innerHTML = html;
      $("matCount").textContent = mats.length + "件";
      $("navMatCount").textContent = mats.length || "";
    }
    function matEventOptionsHtml(selectedId){
      const rounds = caseEvents(edCaseId);
      return `<option value="">（紐づけない）</option>` + rounds.map(e=>
        `<option value="${escapeAttr(e.id)}"${selectedId===e.id?" selected":""}>${escapeHtml(e.type||"期日")}　${escapeHtml(e.date)}</option>`).join("");
    }
    function matEditorHtml(m){
      const isNew = !m;
      let mm = m;
      if(isNew){
        const rounds=caseEvents(edCaseId), today=todayStr();
        let def=""; rounds.forEach(e=>{ if(e.date<=today) def=e.id; });
        mm = { title:"", side:"", eventId:def, filedOn:"", url:"", claims:[], body:"", summary:"", fileUrl:"", fileName:"" };
      }
      const hasR2 = !!(mm.fileUrl && mm.fileUrl.startsWith("/files/"));
      const showFileField = me.uploads || hasR2;
      return `<div class="ieditor">
        <div class="ihead">資料を${isNew?"追加":"編集"}</div>
        <div class="field"><label>資料名 <span class="reqmark">＊</span></label><input type="text" class="ef-title" value="${escapeAttr(mm.title)}" placeholder="例）訴状、第1準備書面、甲3 ○○"></div>
        <div class="field"><label>提出者側</label>
          <select class="ef-side"><option value=""${!mm.side?" selected":""}>（未選択）</option>${["原告側","被告側","裁判所","その他"].map(s=>`<option${mm.side===s?" selected":""}>${s}</option>`).join("")}</select>
        </div>
        <div class="two">
          <div class="field"><label>どの期日の資料か</label><select class="ef-event">${matEventOptionsHtml(mm.eventId)}</select></div>
          <div class="field"><label>提出日</label><input type="date" class="ef-filedon" value="${escapeAttr(mm.filedOn)}"></div>
        </div>
        <div class="field"><label>ファイルのURL</label><input type="text" class="ef-url" value="${escapeAttr(mm.url)}" placeholder="例）/docs/sojo.pdf　または https://…">
          <p class="fnote">PDF を <code>public/docs/</code> に入れて公開すると <code>/docs/ファイル名.pdf</code> で開けます。外部サイトのURLでも可。</p>
        </div>
        ${showFileField?`<div class="field"><label>ファイルをアップロード（PDF・PNG・JPEG、20MBまで）</label><input type="file" class="ef-file" accept="application/pdf,image/png,image/jpeg">
          ${hasR2?`<p class="fnote">いまのファイル：<a href="${escapeAttr(mm.fileUrl)}" target="_blank" rel="noopener">${escapeHtml(mm.fileName||"ファイル")}</a>　<label class="inl"><input type="checkbox" class="ef-removefile"> ファイルを外す</label></p>`:""}
        </div>`:""}
        <div class="field"><label>この書面で主張していること</label><span class="lhint">1行に1項目</span><textarea class="ef-claims" placeholder="例）不開示決定の取消しを求める">${escapeHtml((mm.claims||[]).join("\n"))}</textarea></div>
        <div class="field"><label>本文（Markdownを貼り付け）</label><textarea class="ef-body" style="min-height:120px" placeholder="書面の本文をそのまま貼り付けられます（見出し・箇条書き・**強調**などが使えます）">${escapeHtml(mm.body)}</textarea>
          <p class="fnote">「本文」ボタンから読めるページになります。原本はPDFなので、本文は補助（検索されやすくする・要点を読みやすくする）目的です。</p>
        </div>
        <div class="field"><label>要約</label><textarea class="ef-summary" placeholder="手で書いた要約、またはAIに作らせて確認した要約">${escapeHtml(mm.summary)}</textarea></div>
        <div class="ifoot">
          ${isNew?"":`<button type="button" class="del" data-del="mat" data-id="${escapeAttr(m.id)}">この資料を削除</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn-cancel" data-close>閉じる</button>
          <button type="button" class="btn-save" data-save="mat" data-id="${isNew?"":escapeAttr(m.id)}">この資料を保存</button>
        </div>
      </div>`;
    }
    async function saveMatRow(root, id){
      if(!me.canWrite || !edCaseId) return;
      const title=root.querySelector(".ef-title").value.trim();
      if(!title){ alert("資料名を入力してください。"); return; }
      const fd=new FormData();
      fd.append("caseId", edCaseId);
      fd.append("eventId", root.querySelector(".ef-event").value);
      fd.append("title", title);
      fd.append("side", root.querySelector(".ef-side").value);
      fd.append("filedOn", root.querySelector(".ef-filedon").value);
      fd.append("url", root.querySelector(".ef-url").value.trim());
      fd.append("claims", root.querySelector(".ef-claims").value);
      fd.append("body", root.querySelector(".ef-body").value);
      fd.append("summary", root.querySelector(".ef-summary").value);
      const fEl=root.querySelector(".ef-file");
      const f=fEl && fEl.files[0];
      if(f){
        if(f.size>20*1024*1024){ alert("ファイルは20MBまでです。"); return; }
        fd.append("file", f, f.name);
      }
      const rm=root.querySelector(".ef-removefile");
      if(rm && rm.checked) fd.append("removeFile","1");
      const btn=root.querySelector("[data-save]"); btn.disabled=true;
      try{
        if(id){
          const up=await apiUpdateMat(id,fd);
          const i=materials.findIndex(m=>m.id===id); if(i>=0) materials[i]=up;
        }else{
          const created=await apiCreateMat(fd);
          materials.push(created);
        }
        closeEditor(); renderMatList();
      }catch(err){ alert(saveErr(err)); btn.disabled=false; }
    }
    async function deleteMatRow(id){
      if(!id || !me.canWrite) return;
      if(!confirm("この資料を削除します。ファイルも消えます。よろしいですか？")) return;
      try{
        await apiDeleteMat(id);
        materials=materials.filter(m=>m.id!==id);
        closeEditor(); renderMatList();
      }catch(err){ alert(saveErr(err)); }
    }

    // ---- 3節ぶんの配線（クリックの委譲・1か所にまとめる） ----
    const LIST = {
      img:{ items:()=>edCaseId?caseImages(edCaseId):[], editorHtml:imgEditorHtml, save:saveImgRow, del:deleteImgRow, addBtn:"imgAddBtn", list:"imgList" },
      ev:{ items:()=>edCaseId?caseEvents(edCaseId):[], editorHtml:evEditorHtml, save:saveEvRow, del:deleteEvRow, addBtn:"evAddBtn", list:"evList" },
      mat:{ items:()=>edCaseId?caseMaterials(edCaseId):[], editorHtml:matEditorHtml, save:saveMatRow, del:deleteMatRow, addBtn:"matAddBtn", list:"matList" },
    };
    ceGrid_wireOnce();
    function ceGrid_wireOnce(){
      const grid=$("ceGrid");
      grid.addEventListener("click",(e)=>{
        const head=e.target.closest(".lshead");
        if(head){ head.closest(".lssec").classList.toggle("open"); return; }

        const mv=e.target.closest("[data-imgmove]");
        if(mv){
          e.stopPropagation();
          moveImage(mv.dataset.imgmove, Number(mv.dataset.dir)).then(renderImgList);
          return;
        }

        const close=e.target.closest("[data-close]");
        if(close){ closeEditor(); return; }

        const save=e.target.closest("[data-save]");
        if(save){
          const kind=save.dataset.save, id=save.dataset.id||null;
          LIST[kind].save(save.closest(".ieditor"), id);
          return;
        }

        const del=e.target.closest("[data-del]");
        if(del){ LIST[del.dataset.del].del(del.dataset.id); return; }

        const add=e.target.closest(".addbtn");
        if(add){
          const kind=Object.keys(LIST).find(k=>LIST[k].addBtn===add.id);
          if(!kind || !edCaseId) return;
          closeEditor();
          add.insertAdjacentHTML("beforebegin", LIST[kind].editorHtml(null));
          const root=add.previousElementSibling;
          wireAutosize(root); autosizeAll(root);
          const first=root.querySelector("input,textarea,select"); if(first) first.focus();
          return;
        }

        const row=e.target.closest(".irow");
        if(row){
          if(e.target.closest(".imove")) return;   // 並び替えは編集を開かない
          const alreadyOpen = row.nextElementSibling && row.nextElementSibling.classList.contains("ieditor");
          if(alreadyOpen){ closeEditor(); return; }
          const kind=row.dataset.kind, id=row.dataset.id;
          const item=LIST[kind].items().find(x=>x.id===id);
          if(!item) return;
          row.classList.add("editing");
          openEditorAfter(row, LIST[kind].editorHtml(item));
          row.classList.add("editing");   // openEditorAfter内のcloseEditor()で消えるため、開いた後に付け直す
        }
      });
    }

    // ---- 深いリンク：case.html の「編集」「＋◯◯を編集」から ?open=img:new / ev:<id> / mat:<id> で来たとき、
    // 該当節を開いて、そのエディタも開いた状態にする ----
    function openDeepLink(){
      const open=new URLSearchParams(location.search).get("open");
      if(!open || !edCaseId) return;
      const [kind, idOrNew] = open.split(":");
      const def=LIST[kind]; if(!def) return;
      const sec=document.getElementById("sec-"+kind); if(sec) sec.classList.add("open");
      if(idOrNew==="new"){
        const addBtn=$(def.addBtn);
        addBtn.insertAdjacentHTML("beforebegin", def.editorHtml(null));
        const root=addBtn.previousElementSibling;
        wireAutosize(root); autosizeAll(root);
        requestAnimationFrame(()=>root.scrollIntoView({block:"center"}));
      }else{
        const item=def.items().find(x=>x.id===idOrNew);
        if(!item) return;
        const row=document.querySelector(`.irow[data-kind="${kind}"][data-id="${CSS.escape(idOrNew)}"]`);
        if(!row) return;
        row.classList.add("editing");
        openEditorAfter(row, def.editorHtml(item));
        row.classList.add("editing");
        requestAnimationFrame(()=>row.scrollIntoView({block:"center"}));
      }
    }
  }


  // ---- 要約（ポップアップで開く。編集はできない・閲覧専用） ----
  const sumOverlay=$("sumOverlay");
  function openSummaryModal(id){
    const m = materialById(id); if(!m || !m.summary) return;
    $("sumModalTitle").textContent = m.title;
    $("sumModalText").textContent = m.summary;
    sumOverlay.classList.add("show");
  }
  function closeSummaryModal(){ sumOverlay.classList.remove("show"); }
  $("sumClose").addEventListener("click",closeSummaryModal);
  sumOverlay.addEventListener("click",(e)=>{ if(e.target===sumOverlay) closeSummaryModal(); });

  // ================= バックアップ =================
  function exportData(){
    const data={ version:3, exportedAt:new Date().toISOString(), cases, presenters, events, materials, images };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const t=new Date();
    a.href=url;
    a.download=`裁判カレンダー_${t.getFullYear()}${String(t.getMonth()+1).padStart(2,"0")}${String(t.getDate()).padStart(2,"0")}.json`;
    a.click(); URL.revokeObjectURL(url);
  }
  // 旧形式の parties（「原告 ○○ ／ 被告 ○○」の自由記述1本）を、取り込み時だけ原告名・被告名に分割する
  function splitLegacyParties(raw){
    const parts=String(raw||"").split("／").map(s=>s.trim()).filter(Boolean);
    if(parts.length!==2) return {plaintiffName:String(raw||"").trim(), defendantName:""};
    const m0=parts[0].match(/^(\S+)[\s　]+(.+)$/), m1=parts[1].match(/^(\S+)[\s　]+(.+)$/);
    return { plaintiffName: m0?m0[2]:parts[0], defendantName: m1?m1[2]:parts[1] };
  }
  // 取り込みで既存の事件に追加データが来たとき用のマージ。incoming側で値が入っている欄だけ上書きし、
  // 空欄（未入力）は existing の値をそのまま残す
  const CASE_FIELDS = ["name","caseNo","plaintiffName","defendantName","judge","points","callText","presenterId","contact",
    "press","plaintiffLinks","defendantLinks","tags","relatedCaseIds","archivedAt","closeType","boardEnabled","boardRestricted"];
  function mergeCaseFields(existing, incoming){
    const merged={};
    CASE_FIELDS.forEach(k=>{
      const v=incoming[k];
      const empty = v==null || v==="" || (Array.isArray(v) && v.length===0);
      merged[k]= empty ? existing[k] : v;
    });
    return merged;
  }
  // 取り込み：v3 形式（{cases, events}）と旧形式（期日の配列。各行に事件の説明が入っている）の両方を受ける。
  // 資料（materials）はファイル本体を含まないので取り込まない。
  async function importMerge(file){
    if(!me.canWrite){ alert("取り込みには編集権限が必要です。"); return; }
    let data;
    try{ data=JSON.parse(await file.text()); }catch(e){ alert("読み込めませんでした：" + e.message); return; }
    const inCases = Array.isArray(data) ? [] : (Array.isArray(data.cases) ? data.cases : []);
    const inEvents = Array.isArray(data) ? data : (Array.isArray(data.events) ? data.events : null);
    if(!inEvents){ alert("形式が違います。"); return; }
    if(!confirm(`事件${inCases.length}件・期日${inEvents.length}件を共有カレンダーに追加します。よろしいですか？`)) return;
    let ok=0, ng=0;
    for(const c of inCases){
      try{
        // presenterNickname（問題提起人の自由記述の名前）が来ていれば、同じ名前の問題提起人を
        // こちらで探すか、無ければ新しく作ってから presenterId に変換する（旧掲載依頼フォームの
        // 取り込み形式との互換用。手作りのJSONでも同様に使える）
        let cc = c;
        if(c.presenterNickname){
          let p = presenters.find(x=>x.nickname===c.presenterNickname);
          if(!p){ p = await apiCreatePresenter({ nickname: c.presenterNickname }); presenters.push(p); }
          cc = Object.assign({}, c, { presenterId: p.id });
        }
        const existing=caseByName(cc.name);
        if(existing){
          // すでにある事件は、新しく来た欄（空でないものだけ）で上書きする。同じ事件を何度かに
          // 分けて取り込む場合に、後から来たデータで前の欄を空で消してしまわないため
          const up=await apiUpdateCase(existing.id, mergeCaseFields(existing, cc));
          const i=cases.findIndex(x=>x.id===existing.id); if(i>=0) cases[i]=up;
        }else{
          cases.push(await apiCreateCase(cc));
        }
      }catch(err){ ng++; }
    }
    for(const e of inEvents){
      try{
        let known=caseByName(e.case);
        if(!known){
          if(!e.case){ ng++; continue; }
          // 旧形式（期日の行に事件の説明が埋め込まれている）：取り込みのときだけ、その内容で事件を先に作る。
          // 普段の「＋期日を追加」では事件の自動作成はしない（誤字で事件が乱立するのを防ぐため）。
          // parties は当時「原告 ○○ ／ 被告 ○○」の自由記述1本だったので、取り込み時だけ分割する。
          // host（当時は自由記述テキスト1本）があれば、取り込み時だけ問題提起人を新規に起こして紐付ける
          const pp = splitLegacyParties(e.parties);
          let presenterId = "";
          if(e.host){
            try{ const p=await apiCreatePresenter({nickname:e.host}); presenters.push(p); presenterId=p.id; }catch(err){}
          }
          known = await apiCreateCase({
            name:e.case, plaintiffName:pp.plaintiffName, defendantName:pp.defendantName,
            presenterId, contact:e.contact, callText:e.lede, points:e.points,
          });
          cases.push(known);
        }
        const created=await apiCreate({
          caseId: known.id, case:e.case, date:e.date, time:e.time, type:e.type,
          court:e.court, place:e.place, open:e.open, reportMeeting:e.reportMeeting,
          plaintiffArgument:e.plaintiffArgument, defendantArgument:e.defendantArgument,
        });
        events.push(created); ok++;
      }catch(err){ ng++; }
    }
    if(onChange) onChange();
    alert(`追加：${ok}件${ng?`／失敗：${ng}件`:""}`);
  }

  // ---- 要約ポップアップ（sumOverlay）の配線（両ページ共通） ----
  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape" && sumOverlay.classList.contains("show")) closeSummaryModal();
  });
  const fileInputEl = document.getElementById("fileInput");
  if(fileInputEl){
    fileInputEl.addEventListener("change",(e)=>{ if(e.target.files[0]) importMerge(e.target.files[0]); e.target.value=""; });
  }

  return {
    WD,
    startOfMonth, ymd, parseYmd, todayStr, byTime, escapeHtml, escapeAttr, cssEsc,
    get cases(){ return cases; },
    get presenters(){ return presenters; },
    get events(){ return events; },
    get posts(){ return posts; },
    get materials(){ return materials; },
    get images(){ return images; },
    get me(){ return me; },
    get loaded(){ return loaded; },
    caseById, caseByName, presenterById, caseEvents, casePosts, caseMaterials, caseImages, nearestCase, pickupCase, nextEvent, eventLine, jpDate,
    likeHtml, toggleLike, bookmarkHtml, toggleBookmark, isArchived, iconHtml, presenterHeaderHtml,
    apiListPresenters, apiCreatePresenter, apiUpdatePresenter, apiDeletePresenter,
    apiUpdatePresenterIcon, apiDeletePresenterIcon, reloadPresenters, saveErr,
    load, renderCaseDetail, renderStatus,
    initCaseEditPage(){ initCaseEditPage(); },
    setOnChange(fn){ onChange = fn; },
  };
})();
