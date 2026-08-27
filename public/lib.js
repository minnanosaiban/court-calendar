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
  let editingId = null;          // 編集中の期日
  let editingCaseId = null;      // 編集中の事件
  let editingMatId = null;       // 編集中の資料
  let editingImgId = null;       // 編集中の写真
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
  // 1行のテキストに https://... が含まれていればリンクにする（必ず先にエスケープしてから当てはめる）
  function linkify(s){
    return escapeHtml(s).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
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
  // nearestCase() にフォールバックする
  function pickupCase(){
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
    return ["bi-globe2", "ウェブサイト"];
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
  // 「地裁」＋「太郎」に割ってしまわないため ----
  const COURT_LEVELS = "最高裁|高裁|地裁|簡裁|家裁";
  function courtLinesHtml(raw){
    const lines = String(raw||"").split("\n").map(s=>s.trim()).filter(Boolean);
    if(!lines.length) return "";
    const re = new RegExp(`^(${COURT_LEVELS})[\\s　]+(.*)$`);
    return lines.map(line=>{
      const m = line.match(re);
      return m
        ? `<div class="court-line"><span class="cl-level">${escapeHtml(m[1])}</span>${escapeHtml(m[2].trim())}</div>`
        : `<div>${escapeHtml(line)}</div>`;
    }).join("");
  }
  // ファクトシートの1行。値が無ければ何も出さない（dt/ddのペアをまとめて返す）
  function factRow(label, valueHtml){ return valueHtml ? `<dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd>` : ""; }
  function likeHtml(c){
    return `<button type="button" class="like${c.liked?" on":""}" data-like="${escapeAttr(c.id)}" aria-pressed="${c.liked?"true":"false"}" aria-label="いいね">`+
      `<i class="bi ${c.liked?"bi-heart-fill":"bi-heart"}" aria-hidden="true"></i><span class="like-n">${c.likes||0}</span></button>`;
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
    if(me.canWrite){
      const rows = imgs.map((im,i)=>`<li class="imgrow">
        <img class="ithumb" src="${escapeAttr(im.url)}" alt="">
        <span class="icap">${escapeHtml(im.caption)||"&nbsp;"}</span>
        <span class="iacts">
          ${i>0?`<a data-imgup="${escapeAttr(im.id)}" title="前へ">↑</a>`:""}
          ${i<imgs.length-1?`<a data-imgdown="${escapeAttr(im.id)}" title="後ろへ">↓</a>`:""}
          <a data-editimg="${escapeAttr(im.id)}">編集</a>
        </span>
      </li>`).join("");
      html += `<div class="imgmanage">
        ${rows?`<ul class="imglist">${rows}</ul>`:`<p class="d-body mut">まだ写真はありません。</p>`}
        <p class="qact"><a data-addimg="${escapeAttr(caseId)}">＋ 写真を編集</a></p>
      </div>`;
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

    // ファクトシート：最近の期日・手続・争点・原告・被告・裁判官・掲載（値がある行だけ出す）。
    // 掲載は参照情報なので、事件ページ（full=true）でだけ末尾に続ける（トップの
    // ピックアップカードでは出さない）。事件番号はここには出さない（下のcaseNoRow廃止のコメント参照）
    const nextRow = next
      ? factRow("期日",
          `<div>${escapeHtml(jpDate(next.date))}${next.time?" "+escapeHtml(next.time):""}${next.open===false?`<span class="round-closed">非公開・要確認</span>`:""}${next.reportMeeting?`<span class="round-note">期日報告会あり</span>`:""}</div>`+
          ([next.court,next.place].filter(Boolean).length?`<div>${escapeHtml([next.court,next.place].filter(Boolean).join(" "))}</div>`:"")
        ) + factRow("手続", next.type?escapeHtml(next.type):"")
      : "";
    const pointsRow = factRow("争点", points?`<ul class="pts">${points}</ul>`:"");
    const plaintiffRow = factRow("原告", (c.plaintiffName?escapeHtml(c.plaintiffName):"")+partyLinksHtml(c.plaintiffLinks));
    const defendantRow = factRow("被告", (c.defendantName?escapeHtml(c.defendantName):"")+partyLinksHtml(c.defendantLinks));
    const judgeRow = factRow("裁判官", c.judge?courtLinesHtml(c.judge):"");
    const pressRow = full ? factRow("掲載", c.press.length?`<ul class="pts">${c.press.map(line=>`<li>${linkify(line)}</li>`).join("")}</ul>`:"") : "";
    // 事件番号は運営が事件を見分けるための内部用の欄なので、画面には出さない（APIも書き込み権限がない人には返さない）
    const facts1 = nextRow+pointsRow+plaintiffRow+defendantRow+judgeRow+pressRow;

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
            ${presenterNameHtml(c)}
          </div>
        </div>
        ${tagsHtml(c)}
        ${full ? shareHtml(c) : ""}
        ${facts1?`<dl class="facts">${facts1}</dl>`:""}`;

    if(!full){
      html += `<p class="d-more"><a class="pillbtn" href="case?id=${encodeURIComponent(c.id)}">事件詳細を見る <i class="bi bi-arrow-right" aria-hidden="true"></i></a></p>`;
    }else{
      const editCaseQact = me.canWrite ? `<p class="qact"><a data-editcase="${escapeAttr(c.id)}">＋ 事件情報を編集</a></p>` : "";
      html += callHtml(c) + editCaseQact + relatedCasesHtml(c) + timelineHtml(caseId) + materialsListHtml(caseId);
    }
    html += `</div>`;
    return html;
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
      const editLink = me.canWrite ? `<a class="round-edit" data-edit="${escapeAttr(ev.id)}">編集</a>` : "";
      return `<li class="tl-item ${state}">
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-head">
          <span class="tl-date">${escapeHtml(jpDate(ev.date))}${ev.time?" "+escapeHtml(ev.time):""}</span>
          <span class="tl-type">${escapeHtml(ev.type||"期日")}</span>
          <span class="tl-meta">${escapeHtml(place)}${closed}${reportNote}${editLink}</span>
        </div>
        ${expandable?`<div class="tl-body">${argsHtml(ev)}${own.map(matBlockHtml).join("")}</div>`:""}
      </li>`;
    }).join("");
    return `<p class="subhead">タイムライン</p>
      ${rounds.length?`<ol class="tl">${items}</ol>`:`<p class="d-body mut">期日はまだ登録されていません。</p>`}
      ${me.canWrite?`<p class="qact"><a data-addround="${escapeAttr(caseId)}">＋ 期日を編集</a></p>`:""}`;
  }
  function matRowHtml(m){
    const edit = me.canWrite ? `<a class="round-edit" data-editmat="${escapeAttr(m.id)}">編集</a>` : "";
    return `<li class="mrow">
      ${m.filedOn?`<span class="mdate">${escapeHtml(dotDate(m.filedOn))}</span>`:""}
      <span class="mmain"><span class="mat-name">${escapeHtml(m.title)}</span>${matButtonsHtml(m)}${edit}</span>
    </li>`;
  }
  // 訴訟資料一覧：提出者側ごとに見出しで束ねる（初出の順。側が空のものは「その他」にまとめる）。
  // 全件が側なしなら、旧来どおり見出し無しの1本の並びにする
  function materialsListHtml(caseId){
    const mats=caseMaterials(caseId);
    // 訴訟資料が1件も無ければ、見出しごと何も出さない（追加は編集モーダルの「資料」タブから常にできるため、
    // ここに専用の入り口が無くても困らない）
    if(!mats.length) return "";
    let body;
    if(mats.every(m=>!m.side)){
      body = `<ul class="mlist">${mats.map(matRowHtml).join("")}</ul>`;
    }else{
      const order=[], groups={};
      mats.forEach(m=>{
        const side=m.side||"その他";
        if(!groups[side]){ groups[side]=[]; order.push(side); }
        groups[side].push(m);
      });
      body = order.map(side=>
        `<p class="mside-h ${SIDE_CLASS[side]||""}">${escapeHtml(side)}</p><ul class="mlist">${groups[side].map(matRowHtml).join("")}</ul>`
      ).join("");
    }
    return `<p class="subhead">訴訟資料一覧</p>
      ${body}
      ${me.canWrite?`<p class="qact"><a data-addmat="${escapeAttr(caseId)}">＋ 資料を編集</a></p>`:""}`;
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
    container.querySelectorAll("[data-addimg]").forEach(a=>{
      a.addEventListener("click",()=>openImgAdd(a.dataset.addimg));
    });
    container.querySelectorAll("[data-editimg]").forEach(a=>{
      a.addEventListener("click",()=>openImgEdit(a.dataset.editimg));
    });
    container.querySelectorAll("[data-imgup]").forEach(a=>{
      a.addEventListener("click",()=>moveImage(a.dataset.imgup,-1));
    });
    container.querySelectorAll("[data-imgdown]").forEach(a=>{
      a.addEventListener("click",()=>moveImage(a.dataset.imgdown,1));
    });
    container.querySelectorAll("[data-like]").forEach(b=>{
      b.addEventListener("click",()=>toggleLike(b.dataset.like, b));
    });
    container.querySelectorAll("[data-editcase]").forEach(a=>{
      a.addEventListener("click",()=>{ location.href="case-edit.html?id="+encodeURIComponent(a.dataset.editcase); });
    });
    container.querySelectorAll("[data-edit]").forEach(a=>{
      a.addEventListener("click",(e)=>{ e.stopPropagation(); openEdit(a.dataset.edit); });
    });
    container.querySelectorAll("[data-addround]").forEach(a=>{
      a.addEventListener("click",()=>openAddRound(a.dataset.addround));
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
    container.querySelectorAll("[data-addmat]").forEach(a=>{
      a.addEventListener("click",()=>openMatAdd(a.dataset.addmat));
    });
    container.querySelectorAll("[data-editmat]").forEach(a=>{
      a.addEventListener("click",(e)=>{ e.stopPropagation(); openMatEdit(a.dataset.editmat); });
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

  // ================= モーダル：写真・事件情報・期日・資料は1つの窓（タブ切替）。HTMLはここで作って先に差し込む =================
  const EXTRA_MODALS = `
<div class="overlay" id="overlay">
  <div class="modal">
    <div class="tabs" id="ceTabs" hidden>
      <span data-cetab="img">写真</span>
      <span data-cetab="round">期日</span>
      <span data-cetab="mat">資料</span>
    </div>

    <div class="cepanel" data-panel="round">
      <div class="mhead"><span id="modalTitle">期日を追加</span><span class="mreq"><span class="reqmark">＊</span>のみ必須</span></div>
      <div class="mbody">
        <div class="field" id="fCaseFixed" hidden>
          <label>事件</label>
          <div class="fixedcase" id="fCaseFixedName"></div>
        </div>
        <div class="field" id="fCaseField">
          <label>事件名 <span class="reqmark">＊</span></label>
          <input type="text" id="fCase" list="caseList" placeholder="例）令和7年(ネ)第○○号 損害賠償請求控訴事件">
          <datalist id="caseList"></datalist>
          <p class="fnote">候補（一覧）から選んでください。まだ登録されていない事件は、先に「新たな事件を追加」で事件を登録してから期日を追加できます。</p>
        </div>
        <div class="two">
          <div class="field">
            <label>期日 <span class="reqmark">＊</span></label>
            <input type="date" id="fDate">
          </div>
          <div class="field">
            <label>時刻</label>
            <input type="time" id="fTime">
          </div>
        </div>
        <div class="field">
          <label>手続</label>
          <input type="text" id="fType" list="typeList" placeholder="例）第3回口頭弁論">
          <datalist id="typeList">
            <option value="口頭弁論">
            <option value="弁論準備">
            <option value="進行協議">
            <option value="和解">
            <option value="尋問">
            <option value="当事者尋問">
            <option value="判決言渡">
            <option value="控訴審 第1回">
            <option value="提出期限（書面）">
          </datalist>
        </div>
        <div class="two">
          <div class="field">
            <label>裁判所</label>
            <input type="text" id="fCourt" placeholder="例）東京地方裁判所">
          </div>
          <div class="field">
            <label>法廷</label>
            <input type="text" id="fPlace" placeholder="例）610号法廷">
          </div>
        </div>
        <p class="msec">この回の主張の要約</p>
        <div class="field">
          <label>原告の主張 <span class="lhint">1行に1項目</span></label>
          <textarea id="fPlaintiff" placeholder="例）不開示決定の取消しを求める"></textarea>
        </div>
        <div class="field">
          <label>被告の主張 <span class="lhint">1行に1項目</span></label>
          <textarea id="fDefendant" placeholder="例）該当する文書は保有していない"></textarea>
        </div>
        <div class="field">
          <label class="check"><input type="checkbox" id="fOpen" checked> だれでも傍聴できます（チェックを外すと「非公開・要確認」）</label>
        </div>
        <div class="field">
          <label class="check"><input type="checkbox" id="fReportMeeting"> 期日報告会があります</label>
        </div>
      </div>
      <div class="mfoot">
        <button class="btn-del" id="btnDelete" style="display:none;">この期日を削除</button>
        <span class="spacer"></span>
        <button class="btn-cancel" id="btnCancel">キャンセル</button>
        <button class="btn-save" id="btnSave">保存</button>
      </div>
    </div>

    <div class="cepanel" data-panel="mat" hidden>
      <div class="mhead"><span id="matModalTitle">資料を追加</span><span class="mreq"><span class="reqmark">＊</span>のみ必須</span></div>
      <div class="mbody">
        <div class="field">
          <label>資料名 <span class="reqmark">＊</span></label>
          <input type="text" id="mTitle" placeholder="例）訴状、第1準備書面、甲3 ○○">
        </div>
        <div class="field"><label>提出者側</label>
          <select id="mSide"><option value="">（未選択）</option><option>原告側</option><option>被告側</option><option>裁判所</option><option>その他</option></select>
        </div>
        <div class="two">
          <div class="field"><label>どの期日の資料か</label><select id="mEvent"></select></div>
          <div class="field"><label>提出日</label><input type="date" id="mFiledOn"></div>
        </div>
        <div class="field">
          <label>ファイルのURL</label>
          <input type="text" id="mUrl" placeholder="例）/docs/sojo.pdf　または https://…">
          <p class="fnote">PDF を <code>public/docs/</code> に入れて公開すると <code>/docs/ファイル名.pdf</code> で開けます。外部サイトのURLでも可。</p>
        </div>
        <div class="field" id="mFileField">
          <label>ファイルをアップロード（PDF・PNG・JPEG、20MBまで）</label>
          <input type="file" id="mFile" accept="application/pdf,image/png,image/jpeg">
          <p class="fnote" id="mFileNow" hidden></p>
        </div>
        <div class="field"><label>この書面で主張していること <span class="lhint">1行に1項目</span></label><textarea id="mClaims" placeholder="例）不開示決定の取消しを求める"></textarea></div>
        <div class="field">
          <label>本文（Markdownを貼り付け）</label>
          <textarea id="mBody" placeholder="書面の本文をそのまま貼り付けられます（見出し・箇条書き・**強調**などが使えます）" style="min-height:120px"></textarea>
          <p class="fnote">「本文」ボタンから読めるページになります。原本はPDFなので、本文は補助（検索されやすくする・要点を読みやすくする）目的です。</p>
        </div>
        <div class="field"><label>要約</label><textarea id="mSummary" placeholder="手で書いた要約、またはAIに作らせて確認した要約"></textarea></div>
      </div>
      <div class="mfoot">
        <button class="btn-del" id="mDelete" style="display:none;">この資料を削除</button>
        <span class="spacer"></span>
        <button class="btn-cancel" id="mCancel">キャンセル</button>
        <button class="btn-save" id="mSave">保存</button>
      </div>
    </div>

    <div class="cepanel" data-panel="img" hidden>
      <div class="mhead"><span id="imgModalTitle">写真を追加</span><span class="mreq"><span class="reqmark">＊</span>のみ必須</span></div>
      <div class="mbody">
        <div class="field">
          <label>写真ファイル <span id="iFileReq" class="reqmark">＊</span></label>
          <input type="file" id="iFile" accept="image/jpeg,image/png,image/webp">
          <p class="fnote" id="iFileNow" hidden></p>
          <p class="fnote">JPEG・PNG・WebP、12MBまで。証拠写真は人の顔・氏名・住所が写り込んでいないか確認してから登録してください。</p>
        </div>
        <div class="field"><label>説明（1行）</label><input type="text" id="iCaption" placeholder="例）提訴後の記者会見にて"></div>
      </div>
      <div class="mfoot">
        <button class="btn-del" id="iDelete" style="display:none;">この写真を削除</button>
        <span class="spacer"></span>
        <button class="btn-cancel" id="iCancel">キャンセル</button>
        <button class="btn-save" id="iSave">保存</button>
      </div>
    </div>
  </div>
</div>
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

  // ================= モーダル：写真・期日・資料（1つの窓をタブで切り替える） =================
  // 3つとも lib.js が生成するモーダル（EXTRA_MODALS）の中にある。要素はここで一度だけ取得する。
  // 事件情報はモーダルから分離し、全画面の編集ページ（case-edit.html）で編集する（2026-08-27）。
  const overlay = document.getElementById("overlay");

  // ---- 入力欄（textarea）は書いた分だけ自動で伸ばす（2026-08-27） ----
  // 2行の覗き窓＋内側スクロールで長文を編集させない。プログラムから値を入れたとき（fill○○）は
  // inputイベントが出ないので、開いたあとに autosizeAll() を呼び直す（display:none の間は
  // scrollHeight が 0 になるため、必ず表示してから測る）。
  function autosize(el){ el.style.height="auto"; el.style.height=(el.scrollHeight+2)+"px"; }
  function wireAutosize(root){
    root.querySelectorAll("textarea").forEach(el=>{
      if(el.dataset.auto) return;
      el.dataset.auto="1";
      el.addEventListener("input",()=>autosize(el));
    });
  }
  function autosizeAll(root){ (root||document).querySelectorAll("textarea[data-auto]").forEach(autosize); }
  wireAutosize(overlay);
  function openOverlay(){
    overlay.classList.add("show");
    // .show は同期で効くので、その場で測って伸ばせる（rAF頼みにすると、非アクティブな
    // タブでは発火が遅れて2行の覗き窓のまま見えてしまう）
    autosizeAll(overlay);
  }
  const modalTitle = document.getElementById("modalTitle");
  const fCase = document.getElementById("fCase");
  const fCaseFixed = document.getElementById("fCaseFixed");
  const fCaseFixedName = document.getElementById("fCaseFixedName");
  const fCaseField = document.getElementById("fCaseField");
  const fDate = document.getElementById("fDate");
  const fTime = document.getElementById("fTime");
  const fType = document.getElementById("fType");
  const fCourt = document.getElementById("fCourt");
  const fPlace = document.getElementById("fPlace");
  const fOpen = document.getElementById("fOpen");
  const fReportMeeting = document.getElementById("fReportMeeting");
  const fPlaintiff = document.getElementById("fPlaintiff");
  const fDefendant = document.getElementById("fDefendant");
  const caseList = document.getElementById("caseList");
  const btnSave = document.getElementById("btnSave");
  const btnCancel = document.getElementById("btnCancel");
  const btnDelete = document.getElementById("btnDelete");
  const formInputs = [fCase,fDate,fTime,fType,fCourt,fPlace,fOpen,fReportMeeting,fPlaintiff,fDefendant];

  // ---- タブ（写真／事件情報／期日／資料）。既存の事件を対象に開いたときだけ表示する ----
  const ceTabs = document.getElementById("ceTabs");
  let ceCaseId = null;
  let ceActiveTab = "round";
  // タブ切替は open○○() を呼び直してフォームをデータから再充填するので、入力中の内容は残らない。
  // 黙って消えるのを防ぐため、開いてから入力があったか（ceDirty）を覚えておき、切替前に確認する。
  let ceDirty = false;
  overlay.querySelectorAll(".cepanel input, .cepanel textarea, .cepanel select").forEach(el=>{
    el.addEventListener("input",()=>{ ceDirty=true; });
    el.addEventListener("change",()=>{ ceDirty=true; });
  });
  function ceShowTabs(show){ ceTabs.hidden = !show; }
  function ceSwitchTo(tab){
    ceActiveTab = tab;
    ceDirty = false;   // 切替（＝再充填）した時点で「入力中の変更なし」に戻す
    document.querySelectorAll(".cepanel").forEach(p=>{ p.hidden = (p.dataset.panel !== tab); });
    ceTabs.querySelectorAll("[data-cetab]").forEach(s=>{ s.classList.toggle("on", s.dataset.cetab===tab); });
    autosizeAll(overlay);
  }
  ceTabs.querySelectorAll("[data-cetab]").forEach(s=>{
    s.addEventListener("click",()=>{
      const id=ceCaseId; if(!id) return;
      const tab=s.dataset.cetab;
      if(tab===ceActiveTab) return;   // いま開いているタブをもう一度押しても、再充填で入力を消さない
      if(ceDirty && !confirm("入力中の内容は保存されていません。保存せずにタブを切り替えますか？")) return;
      if(tab==="round") openAddRound(id);
      else if(tab==="mat") openMatAdd(id);
      else if(tab==="img") openImgAdd(id);
    });
  });
  function closeCaseEditModal(){
    overlay.classList.remove("show");
    editingId=null; editingCaseId=null; editingMatId=null; matCaseId=null; editingImgId=null; imgCaseId=null;
    ceCaseId=null;
  }

  function refreshCaseList(){
    const names=cases.map(c=>c.name).sort();
    caseList.innerHTML=names.map(n=>`<option value="${escapeAttr(n)}">`).join("");
  }
  function setReadonly(ro){
    formInputs.forEach(el=>{ el.disabled=ro; });
    btnSave.style.display = ro ? "none" : "";
    btnCancel.textContent = ro ? "閉じる" : "キャンセル";
  }
  function fillEventForm(ev){
    fCase.value=ev.case||""; fDate.value=ev.date||""; fTime.value=ev.time||"";
    fType.value=ev.type||""; fCourt.value=ev.court||""; fPlace.value=ev.place||"";
    fOpen.checked = ev.open!==false;
    fReportMeeting.checked = ev.reportMeeting===true;
    fPlaintiff.value=(ev.plaintiffArgument||[]).join("\n");
    fDefendant.value=(ev.defendantArgument||[]).join("\n");
  }
  // 事件が決まっているとき（事件ページのタブから開いたとき）は、事件名を入力欄でなく固定表示にする。
  // 書き換え事故（別の事件に期日が付く・誤字で弾かれる）を防ぐ。値は fCase に入れたままにするので、
  // saveEntry() 側は今まで通り fCase.value を読めばよい。
  function setCaseFieldMode(fixedName){
    fCaseFixed.hidden = !fixedName;
    fCaseField.hidden = !!fixedName;
    if(fixedName) fCaseFixedName.textContent = fixedName;
  }
  function openAdd(dateStr){
    if(!me.canWrite) return;
    editingId=null; modalTitle.textContent="期日を追加"; btnDelete.style.display="none";
    setReadonly(false); refreshCaseList();
    fillEventForm({date:dateStr||todayStr(), open:true});
    if(events.length){
      const recent=[...events].sort((a,b)=>b.date.localeCompare(a.date))[0];
      fCase.value=recent.case; fCourt.value=recent.court||""; fPlace.value=recent.place||"";
    }
    setCaseFieldMode(null);
    ceCaseId=null; ceShowTabs(false); ceSwitchTo("round");
    openOverlay(); fDate.focus();
  }
  // 既にある事件に、新しい回を追加する（裁判所・法廷は直近の回から引き継ぐ）
  function openAddRound(caseId){
    if(!me.canWrite) return;
    const c=caseById(caseId); if(!c) return;
    const rounds = caseEvents(caseId);
    const src = rounds[rounds.length-1];
    editingId=null; modalTitle.textContent="期日を追加"; btnDelete.style.display="none";
    setReadonly(false); refreshCaseList();
    fillEventForm({case:c.name, court:src&&src.court, place:src&&src.place, open:true});
    setCaseFieldMode(c.name);
    ceCaseId=c.id; ceShowTabs(true); ceSwitchTo("round");
    openOverlay(); fDate.focus();
  }
  function openEdit(id){
    const ev=events.find(e=>e.id===id); if(!ev) return;
    editingId=id;
    const ro = !me.canWrite;
    modalTitle.textContent = ro ? "期日の詳細" : "期日を編集";
    setReadonly(ro);
    btnDelete.style.display = ro ? "none" : "inline-block";
    refreshCaseList();
    fillEventForm(ev);
    setCaseFieldMode(ev.case || null);
    ceCaseId=ev.caseId||null; ceShowTabs(!!ev.caseId); ceSwitchTo("round");
    openOverlay();
  }

  async function saveEntry(){
    if(!me.canWrite) return;
    const c=fCase.value.trim(), d=fDate.value;
    if(!c){ alert("事件名を入力してください。"); fCase.focus(); return; }
    if(!d){ alert("期日（日付）を入力してください。"); fDate.focus(); return; }
    const known=caseByName(c);
    // 事件が先に登録されていないと期日は追加できない（誤字での事件乱立を防ぐため）
    if(!known){
      alert(`「${c}」という事件はまだ登録されていません。先に「新たな事件を追加」でこの事件を登録してから、期日を追加してください。`);
      fCase.focus();
      return;
    }
    const data={
      caseId: known.id, case:c, date:d, time:fTime.value,
      type:fType.value.trim(), court:fCourt.value.trim(), place:fPlace.value.trim(),
      open:fOpen.checked, reportMeeting:fReportMeeting.checked,
      plaintiffArgument:fPlaintiff.value.split("\n").map(s=>s.trim()).filter(Boolean),
      defendantArgument:fDefendant.value.split("\n").map(s=>s.trim()).filter(Boolean),
    };
    btnSave.disabled=true;
    try{
      if(editingId){
        const up=await apiUpdate(editingId,data);
        const i=events.findIndex(e=>e.id===editingId); if(i>=0) events[i]=up;
      }else{
        const created=await apiCreate(data);
        events.push(created);
      }
      closeCaseEditModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ btnSave.disabled=false; }
  }
  async function deleteEntry(){
    if(!editingId || !me.canWrite) return;
    if(!confirm("この期日を削除します。この期日への掲示板の報告も一緒に消えます。よろしいですか？")) return;
    btnDelete.disabled=true;
    try{
      await apiDelete(editingId);
      events=events.filter(e=>e.id!==editingId);
      posts=posts.filter(p=>p.eventId!==editingId);
      materials.forEach(m=>{ if(m.eventId===editingId) m.eventId=""; });
      closeCaseEditModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ btnDelete.disabled=false; }
  }

  const $ = (id)=>document.getElementById(id);
  const mFields = { title:$("mTitle"), side:$("mSide"), event:$("mEvent"), filedOn:$("mFiledOn"),
                    url:$("mUrl"), file:$("mFile"), fileField:$("mFileField"), fileNow:$("mFileNow"),
                    claims:$("mClaims"), body:$("mBody"), summary:$("mSummary") };
  let matCaseId = null;

  // ================= 事件情報の編集ページ（case-edit.html、2026-08-27） =================
  // 事件情報はモーダルから分離し、全画面ページで編集する。フォームの実体は case-edit.html に
  // 静的に置いてあり、ここではそのページでだけ配線する（他のページでは何もしない）。
  // 欄の並びは事件ページの実際の掲載順（掲示板→事件名とタグ→終結→争点・当事者→裁判について→関連裁判→非公開の情報）。
  let initCaseEditPage = function(){};
  if(document.getElementById("cName")){
    const cFields = { name:$("cName"), caseNo:$("cCaseNo"), plaintiff:$("cPlaintiff"), defendant:$("cDefendant"), judge:$("cJudge"), points:$("cPoints"),
                      callText:$("cCall"), press:$("cPress"), plaintiffLinks:$("cPlaintiffLinks"), defendantLinks:$("cDefendantLinks"),
                      tags:$("cTags"), related:$("cRelated"), archivedAt:$("cArchivedAt"), closeType:$("cCloseType") };
    const cBoardEnabled=$("cBoardEnabled"), cBoardRestricted=$("cBoardRestricted");
    const cPresenterSelect=$("cPresenterSelect"), cPresenterNewRow=$("cPresenterNewRow"), cPresenterNewNickname=$("cPresenterNewNickname"),
          cPresenterNewSave=$("cPresenterNewSave"), cPresenterIconRow=$("cPresenterIconRow"), cPresenterIconPreview=$("cPresenterIconPreview"),
          cPresenterIconFile=$("cPresenterIconFile"), cPresenterIconRemove=$("cPresenterIconRemove"),
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
        cPresenterNewRow.hidden=false; cPresenterIconRow.hidden=true;
        cPresenterNewNickname.value="";
      }else if(v){
        cPresenterNewRow.hidden=true; cPresenterIconRow.hidden=false;
        const p = presenterById(v);
        cPresenterIconPreview.innerHTML = p && p.icon
          ? `<img class="cicon" src="${escapeAttr(p.icon)}" alt="">`
          : `<span class="cicon cicon-ph" aria-hidden="true">${escapeHtml(placeholderChar(p?p.nickname:""))}</span>`;
        cPresenterIconRemove.hidden = !(p && p.icon);
      }else{
        cPresenterNewRow.hidden=true; cPresenterIconRow.hidden=true;
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
    cPresenterIconFile.addEventListener("change", async ()=>{
      const f=cPresenterIconFile.files[0];
      const pid=cPresenterSelect.value;
      if(!f || !pid || pid==="__new__") return;
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
    function fillCaseForm(c){
      cFields.name.value=c.name||""; cFields.caseNo.value=c.caseNo||"";
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
        name, presenterId, caseNo:cFields.caseNo.value.trim(),
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
    ceForm.addEventListener("input",()=>{ edDirty=true; });
    ceForm.addEventListener("change",()=>{ edDirty=true; });
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
    };
  }

  // ---- 資料 ----
  function fillMatForm(m, caseId){
    matCaseId=caseId;
    const rounds=caseEvents(caseId);
    mFields.event.innerHTML = `<option value="">（紐づけない）</option>` + rounds.map(e=>
      `<option value="${escapeAttr(e.id)}"${m.eventId===e.id?" selected":""}>${escapeHtml(e.type||"期日")}　${escapeHtml(e.date)}</option>`).join("");
    mFields.title.value=m.title||""; mFields.side.value=m.side||"";
    mFields.filedOn.value=m.filedOn||""; mFields.url.value=m.url||""; mFields.file.value="";
    mFields.claims.value=(m.claims||[]).join("\n"); mFields.body.value=m.body||""; mFields.summary.value=m.summary||"";
    // アップロード欄は R2 が使えるとき（me.uploads）か、すでに R2 のファイルが付いているときだけ出す
    const hasR2 = !!(m.fileUrl && m.fileUrl.startsWith("/files/"));
    mFields.fileField.hidden = !(me.uploads || hasR2);
    if(hasR2){
      mFields.fileNow.hidden=false;
      mFields.fileNow.innerHTML=`いまのファイル：<a href="${escapeAttr(m.fileUrl)}" target="_blank" rel="noopener">${escapeHtml(m.fileName||"ファイル")}</a>`+
        `　<label class="inl"><input type="checkbox" id="mRemove"> ファイルを外す</label>`;
    }else{ mFields.fileNow.hidden=true; mFields.fileNow.innerHTML=""; }
  }
  function openMatAdd(caseId){
    if(!me.canWrite) return;
    editingMatId=null; $("matModalTitle").textContent="資料を追加"; $("mDelete").style.display="none";
    // 既定の期日＝「最近の期日」（済んだ回があればその最後）
    const rounds=caseEvents(caseId), today=todayStr();
    let def=""; rounds.forEach(e=>{ if(e.date<=today) def=e.id; });
    fillMatForm({eventId:def}, caseId);
    ceCaseId=caseId; ceShowTabs(true); ceSwitchTo("mat");
    openOverlay(); mFields.title.focus();
  }
  function openMatEdit(id){
    if(!me.canWrite) return;
    const m=materials.find(x=>x.id===id); if(!m) return;
    editingMatId=id; $("matModalTitle").textContent="資料を編集"; $("mDelete").style.display="inline-block";
    fillMatForm(m, m.caseId);
    ceCaseId=m.caseId; ceShowTabs(true); ceSwitchTo("mat");
    openOverlay();
  }
  async function saveMat(){
    if(!me.canWrite || !matCaseId) return;
    const title=mFields.title.value.trim();
    if(!title){ alert("資料名を入力してください。"); mFields.title.focus(); return; }
    const fd=new FormData();
    fd.append("caseId", matCaseId);
    fd.append("eventId", mFields.event.value);
    fd.append("title", title);
    fd.append("side", mFields.side.value);
    fd.append("filedOn", mFields.filedOn.value);
    fd.append("url", mFields.url.value.trim());
    fd.append("claims", mFields.claims.value);
    fd.append("body", mFields.body.value);
    fd.append("summary", mFields.summary.value);
    const f=mFields.file.files[0];
    if(f){
      if(f.size>20*1024*1024){ alert("ファイルは20MBまでです。"); return; }
      fd.append("file", f, f.name);
    }
    const rm=$("mRemove"); if(rm && rm.checked) fd.append("removeFile","1");
    $("mSave").disabled=true;
    try{
      if(editingMatId){
        const up=await apiUpdateMat(editingMatId,fd);
        const i=materials.findIndex(m=>m.id===editingMatId); if(i>=0) materials[i]=up;
      }else{
        const created=await apiCreateMat(fd);
        materials.push(created);
      }
      closeCaseEditModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("mSave").disabled=false; }
  }
  async function deleteMat(){
    if(!editingMatId || !me.canWrite) return;
    if(!confirm("この資料を削除します。ファイルも消えます。よろしいですか？")) return;
    $("mDelete").disabled=true;
    try{
      await apiDeleteMat(editingMatId);
      materials=materials.filter(m=>m.id!==editingMatId);
      closeCaseEditModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("mDelete").disabled=false; }
  }
  $("mSave").addEventListener("click",saveMat);
  $("mCancel").addEventListener("click",closeCaseEditModal);
  $("mDelete").addEventListener("click",deleteMat);

  // ---- 写真 ----
  const iFields = { file:$("iFile"), fileNow:$("iFileNow"), fileReq:$("iFileReq"), caption:$("iCaption") };
  let imgCaseId = null;

  function openImgAdd(caseId){
    if(!me.canWrite) return;
    editingImgId=null; imgCaseId=caseId; $("imgModalTitle").textContent="写真を追加"; $("iDelete").style.display="none";
    iFields.file.value=""; iFields.caption.value=""; iFields.fileNow.hidden=true; iFields.fileReq.style.display="";
    ceCaseId=caseId; ceShowTabs(true); ceSwitchTo("img");
    openOverlay(); iFields.file.focus();
  }
  function openImgEdit(id){
    if(!me.canWrite) return;
    const im=images.find(x=>x.id===id); if(!im) return;
    editingImgId=id; imgCaseId=im.caseId; $("imgModalTitle").textContent="写真を編集"; $("iDelete").style.display="inline-block";
    iFields.file.value=""; iFields.caption.value=im.caption||""; iFields.fileReq.style.display="none";
    iFields.fileNow.hidden=false;
    iFields.fileNow.innerHTML=`いまの写真：<img src="${escapeAttr(im.url)}" alt="" style="width:64px;height:46px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-left:6px">`+
      `　ファイルを選ぶと差し替わります。`;
    ceCaseId=im.caseId; ceShowTabs(true); ceSwitchTo("img");
    openOverlay();
  }
  async function saveImg(){
    if(!me.canWrite || !imgCaseId) return;
    const f=iFields.file.files[0];
    if(!editingImgId && !f){ alert("写真ファイルを選んでください。"); return; }
    if(f && f.size>12*1024*1024){ alert("写真は12MBまでです。"); return; }
    const fd=new FormData();
    fd.append("caseId", imgCaseId);
    fd.append("caption", iFields.caption.value.trim());
    if(f) fd.append("file", f, f.name);
    $("iSave").disabled=true;
    try{
      if(editingImgId){
        const up=await apiUpdateImage(editingImgId,fd);
        const i=images.findIndex(x=>x.id===editingImgId); if(i>=0) images[i]=up;
      }else{
        const created=await apiCreateImage(fd);
        images.push(created);
      }
      closeCaseEditModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("iSave").disabled=false; }
  }
  async function deleteImg(){
    if(!editingImgId || !me.canWrite) return;
    if(!confirm("この写真を削除します。よろしいですか？")) return;
    $("iDelete").disabled=true;
    try{
      await apiDeleteImage(editingImgId);
      images=images.filter(x=>x.id!==editingImgId);
      closeCaseEditModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("iDelete").disabled=false; }
  }
  $("iSave").addEventListener("click",saveImg);
  $("iCancel").addEventListener("click",closeCaseEditModal);
  $("iDelete").addEventListener("click",deleteImg);

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

  // ---- モーダルの配線（両ページ共通） ----
  btnSave.addEventListener("click",saveEntry);
  btnCancel.addEventListener("click",closeCaseEditModal);
  btnDelete.addEventListener("click",deleteEntry);
  overlay.addEventListener("click",(e)=>{ if(e.target===overlay) closeCaseEditModal(); });
  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape"){
      if(overlay.classList.contains("show")) closeCaseEditModal();
      if(sumOverlay.classList.contains("show")) closeSummaryModal();
    }
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){
      if(overlay.classList.contains("show")){
        if(ceActiveTab==="round") saveEntry();
        else if(ceActiveTab==="mat") saveMat();
        else if(ceActiveTab==="img") saveImg();
      }
    }
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
    likeHtml, toggleLike, isArchived, iconHtml, presenterHeaderHtml,
    apiListPresenters, apiCreatePresenter, apiUpdatePresenter, apiDeletePresenter,
    apiUpdatePresenterIcon, apiDeletePresenterIcon, reloadPresenters, saveErr,
    load, renderCaseDetail, renderStatus, openAdd,
    initCaseEditPage(){ initCaseEditPage(); },
    setOnChange(fn){ onChange = fn; },
  };
})();
