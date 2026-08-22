// 裁判カレンダー・共通ロジック（index.html / case.html の両方から読み込む）
// モーダルや「編集パスワード」の状態など、両ページに共通のものはここに集約する。
// 呼び出す側（各ページ末尾のスクリプト）は window.CC 経由で使う。
window.CC = (function(){
  "use strict";
  const EDITKEY_LS = "court-calendar.editkey";
  const VIEWER_LS  = "court-calendar.viewer";
  const WD = ["日","月","火","水","木","金","土"];

  // ---- state ----
  let editKey = localStorage.getItem(EDITKEY_LS) || "";   // 編集パスワード（この端末に保存）
  let loaded = false;   // 最初のデータ取得が終わったか（終わるまで「まだありません」系の文言を出さない）
  let cases = [];
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
  let openNodes = new Set();     // タイムラインで開いている節（期日ID）
  let openSummaries = new Set(); // 開いている「要約」ボタン（資料ID）
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
  function cssEsc(s){ return String(s).replace(/"/g,'\\"'); }
  function jpDate(s){ const d=parseYmd(s); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${WD[d.getDay()]}）`; }
  function dotDate(s){ return s ? s.replace(/-/g,".") : ""; }

  // ---- 資料の本文（Markdown）を、簡単な安全なHTMLに変換 ----
  // まず全体をエスケープしてから記法を当てはめるので、貼り付けた本文に生のHTMLが混ざっても実行されない。
  function inlineMd(s){
    let t = escapeHtml(s);
    t = t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g,"$1<em>$2</em>");
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }
  function mdToHtml(src){
    const blocks = String(src||"").replace(/\r\n/g,"\n").trim().split(/\n{2,}/);
    return blocks.map(block=>{
      const lines = block.split("\n").map(l=>l.replace(/\s+$/,""));
      if(lines.length===1){
        const h = lines[0].match(/^(#{1,3})\s+(.*)$/);
        if(h){ const lv=h[1].length+2; return `<h${lv}>${inlineMd(h[2])}</h${lv}>`; }
      }
      if(lines.every(l=>/^[-・]\s+/.test(l))){
        return `<ul>${lines.map(l=>`<li>${inlineMd(l.replace(/^[-・]\s+/,""))}</li>`).join("")}</ul>`;
      }
      if(lines.every(l=>/^\d+[.)]\s+/.test(l))){
        return `<ol>${lines.map(l=>`<li>${inlineMd(l.replace(/^\d+[.)]\s+/,""))}</li>`).join("")}</ol>`;
      }
      if(lines.every(l=>/^>\s?/.test(l))){
        return `<blockquote><p>${lines.map(l=>inlineMd(l.replace(/^>\s?/,""))).join("<br>")}</p></blockquote>`;
      }
      return `<p>${lines.map(inlineMd).join("<br>")}</p>`;
    }).join("\n");
  }

  // ================= API =================
  async function api(method, path, body, extra){
    const opt = { method, headers:{ "X-Viewer": viewer } };
    if(editKey) opt.headers["X-Edit-Key"]=editKey;
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
  function saveErr(err){
    if(err && err.status===403) return "この操作は許可されていません（閲覧のみの権限です）。";
    return "保存できませんでした：" + (err && err.message || err);
  }

  async function load(){
    try{ me = await apiMe(); }catch(e){ me={email:null,canWrite:false,allowAll:false,boardOpen:false,turnstileSiteKey:""}; }
    const [c,e,p,m,im] = await Promise.all([
      apiListCases().catch(()=>[]), apiList().catch(()=>[]),
      apiListPosts().catch(()=>[]), apiListMats().catch(()=>[]),
      apiListImages().catch(()=>[]),
    ]);
    cases=c; events=e; posts=p; materials=m; images=im;
    loaded = true;
  }
  async function reloadCases(){ try{ cases = await apiListCases(); }catch(e){} }

  // ================= 事件 =================
  function caseById(id){ return cases.find(c=>c.id===id) || null; }
  function caseByName(name){ return cases.find(c=>c.name===name) || null; }
  function caseEvents(caseId){ return events.filter(e=>e.caseId===caseId).sort(byDate); }
  function casePosts(caseId){ return posts.filter(p=>p.caseId===caseId); }
  function caseMaterials(caseId){ return materials.filter(m=>m.caseId===caseId); }
  function materialById(id){ return materials.find(m=>m.id===id) || null; }
  function caseImages(caseId){ return images.filter(im=>im.caseId===caseId).sort((a,b)=>a.sortOrder-b.sortOrder); }
  // 直近に期日がある事件（トップの「最近の期日」・カレンダーの初期表示月に使う）
  function nearestCase(){
    const today=todayStr();
    const list=events.filter(e=>e.date>=today && !isArchived(e.caseId)).sort(byDate);
    return list[0] ? list[0].caseId : null;
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

  // ---- リンクのアイコン（URLのドメインで決める） ----
  function linkIcon(url){
    let h=""; try{ h=new URL(url).hostname.replace(/^www\./,""); }catch(e){}
    if(h==="x.com"||h==="twitter.com") return ["bi-twitter-x","X"];
    if(h.endsWith("instagram.com")) return ["bi-instagram","Instagram"];
    if(h.endsWith("youtube.com")||h==="youtu.be") return ["bi-youtube","YouTube"];
    if(h.endsWith("facebook.com")) return ["bi-facebook","Facebook"];
    if(h==="note.com") return ["bi-journal-text","note"];
    return ["bi-globe2", h||"リンク"];
  }
  function linksHtml(c){
    if(!c.links.length) return "";
    return `<div class="d-links">`+c.links.map(u=>{
      const [ic,label]=linkIcon(u);
      return `<a class="d-link" href="${escapeAttr(u)}" target="_blank" rel="noopener" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"><i class="bi ${ic}" aria-hidden="true"></i></a>`;
    }).join("")+`</div>`;
  }
  function likeHtml(c){
    return `<button type="button" class="like${c.liked?" on":""}" data-like="${escapeAttr(c.id)}" aria-pressed="${c.liked?"true":"false"}" aria-label="いいね">`+
      `<i class="bi ${c.liked?"bi-heart-fill":"bi-heart"}" aria-hidden="true"></i><span class="like-n">${c.likes||0}</span></button>`;
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
  // 終結した裁判（裁判アーカイブ）の帯
  function archivedHtml(c){
    if(!c.archivedAt) return "";
    const when=[jpDate(c.archivedAt), c.closeType].filter(Boolean).join("　");
    return `<div class="archived"><i class="bi bi-archive" aria-hidden="true"></i><span>この裁判は <b>${escapeHtml(when)}</b> で終結しました。${c.result?escapeHtml(c.result):""}</span></div>`;
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
        <p class="qact"><a data-addimg="${escapeAttr(caseId)}">＋ 写真を追加</a></p>
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
    function start(){ stop(); timer=setInterval(()=>show(idx+1),4500); }
    function stop(){ if(timer) clearInterval(timer); timer=null; }
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
  // full=true : 事件ページ用（さらに よびかけ・タイムラインと訴訟資料・資料一覧）
  function caseCardHtml(caseId, full){
    const c = caseById(caseId);
    if(!c) return null;
    const next = nextEvent(caseId);
    const points=(c.points||[]).map(p=>`<li>${escapeHtml(p)}</li>`).join("");
    const editCase = me.canWrite ? `<a class="d-edit" data-editcase="${escapeAttr(c.id)}">事件を編集</a>` : "";

    let html = `
      <div class="card dcard">
        ${full ? galleryHtml(caseId) : ""}
        <div class="d-head">
          <h2 class="d-title">${escapeHtml(c.name)} ${likeHtml(c)}</h2>
          ${linksHtml(c)}
        </div>
        ${tagsHtml(c)}
        ${full ? shareHtml(c) : ""}
        ${archivedHtml(c)}
        ${editCase}
        ${next?`<p class="minih">最近の期日</p><p class="d-body d-next">${escapeHtml(eventLine(next))}${next.open===false?`<span class="round-closed">非公開・要確認</span>`:""}</p>`:""}
        ${points?`<p class="minih">争点</p><ul class="pts">${points}</ul>`:""}
        ${c.parties?`<p class="minih">当事者</p><p class="d-body">${escapeHtml(c.parties)}</p>`:""}
        ${boardHtml(caseId)}`;

    if(!full){
      html += `<p class="d-more"><a class="pillbtn" href="case?id=${encodeURIComponent(c.id)}">詳細を見る <i class="bi bi-arrow-right" aria-hidden="true"></i></a></p>`;
    }else{
      html += callHtml(c) + timelineHtml(caseId) + materialsListHtml(caseId);
    }
    html += `</div>`;
    return html;
  }

  // ---- よびかけ ----
  function callHtml(c){
    const credit=[
      c.host?`呼びかけ：${escapeHtml(c.host)}`:"",
      c.contact?`連絡先：<a href="mailto:${escapeAttr(c.contact)}">${escapeHtml(c.contact)}</a>`:""
    ].filter(Boolean).join("<br>");
    if(!c.callText && !c.lede && !credit) return "";
    return `<p class="minih">よびかけ</p>
      <div class="lede">${c.lede?`<p>${escapeHtml(c.lede)}</p>`:""}${c.callText?`<p class="call">${escapeHtml(c.callText)}</p>`:""}${credit?`<span class="credit">${credit}</span>`:""}</div>`;
  }

  // ---- タイムラインと訴訟資料 ----
  const SIDE_CLASS = { "原告側":"g", "被告側":"k", "裁判所":"j", "その他":"" };
  function matIcon(m){
    const u=(m.fileUrl||"").toLowerCase();
    if(m.mime==="application/pdf" || /\.pdf(\?|#|$)/.test(u)) return "bi-file-earmark-pdf";
    if(/^image\//.test(m.mime||"") || /\.(png|jpe?g|gif|webp)(\?|#|$)/.test(u)) return "bi-image";
    return "bi-box-arrow-up-right";
  }
  function sideTag(m){ return m.side ? `<span class="mat-side ${SIDE_CLASS[m.side]||""}">${escapeHtml(m.side)}</span>` : ""; }
  // PDF・本文・要約の3つのボタン。無いものはグレーのまま押せない（「この資料には無い」ことが分かるように）
  function matButtonsHtml(m){
    // ファイル本体（R2/PDF/画像）か、外部サイトへのリンクかでラベル・アイコンを出し分ける
    const icon = matIcon(m);
    const label = icon==="bi-box-arrow-up-right" ? "資料" : "PDF";
    const pdf = m.fileUrl
      ? `<a class="btn pdf" href="${escapeAttr(m.fileUrl)}" target="_blank" rel="noopener"><i class="bi ${icon}" aria-hidden="true"></i>${label}</a>`
      : `<span class="btn off"><i class="bi bi-file-earmark-pdf" aria-hidden="true"></i>PDF</span>`;
    const body = m.body
      ? `<a class="btn" href="doc?id=${encodeURIComponent(m.id)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-text" aria-hidden="true"></i>本文</a>`
      : `<span class="btn off"><i class="bi bi-file-earmark-text" aria-hidden="true"></i>本文</span>`;
    const sum = m.summary
      ? `<button type="button" class="btn${openSummaries.has(m.id)?" on":""}" data-sumtoggle="${escapeAttr(m.id)}"><i class="bi bi-stars" aria-hidden="true"></i>要約</button>`
      : `<span class="btn off"><i class="bi bi-stars" aria-hidden="true"></i>要約</span>`;
    return `<span class="btns">${pdf}${body}${sum}</span>`;
  }
  function matBlockHtml(m){
    const claims=(m.claims||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    const showSum = m.summary && openSummaries.has(m.id);
    return `<div class="mat">
      <p class="mat-h">${sideTag(m)}<span class="mat-name">${escapeHtml(m.title)}</span>${m.kind?`<span class="mat-kind">${escapeHtml(m.kind)}</span>`:""}</p>
      ${matButtonsHtml(m)}
      ${claims?`<ul class="pts mat-claims">${claims}</ul>`:""}
      ${showSum?`<p class="mat-sum"><span class="mat-sumh">要約</span>${escapeHtml(m.summary)}</p>`:""}
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
      const isOpen = expandable && openNodes.has(ev.id);
      const place=[ev.court,ev.place].filter(Boolean).join(" ");
      const closed = ev.open===false ? `<span class="round-closed">非公開・要確認</span>` : "";
      const editLink = me.canWrite ? `<a class="round-edit" data-edit="${escapeAttr(ev.id)}">編集</a>` : "";
      const countLabel = own.length>0 ? `資料${own.length}件` : "詳細";
      return `<li class="tl-item ${state}${isOpen?" open":""}">
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-head${expandable?" tl-click":""}"${expandable?` data-tl="${escapeAttr(ev.id)}" role="button" aria-expanded="${isOpen}"`:""}>
          <span class="tl-date">${escapeHtml(jpDate(ev.date))}${ev.time?" "+escapeHtml(ev.time):""}</span>
          <span class="tl-type">${escapeHtml(ev.type||"期日")}</span>
          <span class="tl-meta">${escapeHtml(place)}${closed}${editLink}</span>
          ${expandable?`<span class="tl-count">${countLabel} <i class="bi bi-chevron-down" aria-hidden="true"></i></span>`:""}
        </div>
        ${isOpen?`<div class="tl-body">${argsHtml(ev)}${own.map(matBlockHtml).join("")}</div>`:""}
      </li>`;
    }).join("");
    // 期日に紐づいていない資料があることを、タイムラインの下で知らせる（一覧で見られる）
    const loose = mats.filter(m=>!m.eventId).length;
    return `<p class="minih">タイムラインと訴訟資料</p>
      ${rounds.length?`<ol class="tl">${items}</ol>`:`<p class="d-body mut">期日はまだ登録されていません。</p>`}
      ${loose?`<p class="tl-note">期日に紐づかない資料が${loose}件あります（下の一覧にあります）。</p>`:""}
      ${me.canWrite?`<p class="qact"><a data-addround="${escapeAttr(caseId)}">＋ この事件に期日を追加</a></p>`:""}`;
  }
  function materialsListHtml(caseId){
    const mats=caseMaterials(caseId);
    const rows=mats.map(m=>{
      const edit = me.canWrite ? `<a class="round-edit" data-editmat="${escapeAttr(m.id)}">編集</a>` : "";
      const showSum = m.summary && openSummaries.has(m.id);
      return `<li class="mrow">
        <span class="mdate">${escapeHtml(dotDate(m.filedOn))||"&nbsp;"}</span>
        <span class="mmain">${sideTag(m)}<span class="mat-name">${escapeHtml(m.title)}</span>${m.kind?`<span class="mat-kind">${escapeHtml(m.kind)}</span>`:""}${matButtonsHtml(m)}${edit}
        ${showSum?`<span class="mat-sum"><span class="mat-sumh">要約</span>${escapeHtml(m.summary)}</span>`:""}</span>
      </li>`;
    }).join("");
    return `<p class="minih">訴訟資料一覧</p>
      ${rows?`<ul class="mlist">${rows}</ul>`:`<p class="d-body mut">訴訟資料はまだ登録されていません。</p>`}
      ${me.canWrite?`<p class="qact"><a data-addmat="${escapeAttr(caseId)}">＋ 資料を追加</a></p>`:""}`;
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

  function boardHtml(caseId){
    const rounds = caseEvents(caseId);
    const mine = casePosts(caseId);
    // 投稿できるのは：スパム対策(Turnstile)設定済みのとき＝誰でも／未設定でも運営は可
    const canPost = (me.boardOpen || me.canWrite) && rounds.length>0;
    const items = mine.map(p=>{
      const ev = rounds.find(e=>e.id===p.eventId);
      return bubbleHtml(p, (ev && ev.type) || p.round || "");
    }).join("");
    let html=`<div class="bpanel">`+
      `<div class="bhead"><span class="btitle">傍聴に<span class="bt-red">行ってきたよ</span><span class="bt-bang">！</span>掲示板</span>`+
      (mine.length?`<span class="bcount">${mine.length}件の報告</span>`:"")+
      `</div>`;
    html += items
      || `<p class="board-empty">${canPost
          ? "まだ報告はありません。傍聴に行かれた方の最初の報告をお待ちしています。"
          : "まだ報告はありません。"}</p>`;
    if(canPost){
      html += boardFormForCase===caseId
        ? postFormHtml(caseId)
        : `<p class="bwrite"><a data-openpost="${escapeAttr(caseId)}"><i class="bi bi-chat-left-text" aria-hidden="true"></i> 傍聴の報告を書く</a></p>`;
    }else if(rounds.length){
      // 一般の投稿はまだ受け付けていない（Turnstile未設定）。運営は編集パスワードで書けるので、その導線だけ出す
      html += `<p class="board-empty">傍聴の報告の投稿には、<a data-unlock="1">パスワード</a>が必要です。</p>`;
    }
    html += `</div>`;
    return html;
  }

  function postFormHtml(caseId){
    const rounds = caseEvents(caseId);
    const today = todayStr();
    let defaultIdx = 0;
    rounds.forEach((e,i)=>{ if(e.date<=today) defaultIdx=i; });
    const roundOptions = rounds.map((e,i)=>
      `<option value="${escapeAttr(e.id)}"${i===defaultIdx?" selected":""}>${escapeHtml(e.type||e.date)}</option>`
    ).join("");
    return `
      <div class="pform">
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
      a.addEventListener("click",()=>openCaseEdit(a.dataset.editcase));
    });
    container.querySelectorAll("[data-edit]").forEach(a=>{
      a.addEventListener("click",(e)=>{ e.stopPropagation(); openEdit(a.dataset.edit); });
    });
    container.querySelectorAll("[data-addround]").forEach(a=>{
      a.addEventListener("click",()=>openAddRound(a.dataset.addround));
    });
    container.querySelectorAll("[data-tl]").forEach(h=>{
      h.addEventListener("click",()=>{
        const id=h.dataset.tl;
        if(openNodes.has(id)) openNodes.delete(id); else openNodes.add(id);
        rerender();
      });
    });
    container.querySelectorAll("[data-sumtoggle]").forEach(b=>{
      b.addEventListener("click",(e)=>{
        e.stopPropagation();
        const id=b.dataset.sumtoggle;
        if(openSummaries.has(id)) openSummaries.delete(id); else openSummaries.add(id);
        rerender();
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
  function renderStatus(el){
    if(!loaded){ el.innerHTML=""; return; }
    if(me.canWrite){
      el.innerHTML =
        `編集できます ── この端末は編集ロック解除済みです。`+
        `<br><a id="stAddCase">＋ 事件を追加</a><span class="sep">・</span>`+
        `<a id="stAdd">＋ 期日を追加</a><span class="sep">・</span>`+
        `<a id="stLock">ロックする</a><span class="sep">・</span>`+
        `<a id="stExport">バックアップを書き出す</a><span class="sep">・</span>`+
        `<a id="stImport">ファイルから取り込み</a>`;
      el.querySelector("#stAddCase").addEventListener("click",openCaseAdd);
      el.querySelector("#stAdd").addEventListener("click",()=>openAdd(todayStr()));
      el.querySelector("#stLock").addEventListener("click",lockEditing);
      el.querySelector("#stExport").addEventListener("click",exportData);
      el.querySelector("#stImport").addEventListener("click",()=>{
        const fi=document.getElementById("fileInput"); if(fi) fi.click();
      });
    }else{
      el.innerHTML =
        `どなたでも閲覧できる公開カレンダーです。掲載内容は呼びかけ人から提供された情報にもとづきます。`+
        `<br>期日の追加・編集には、<a id="stUnlock">パスワード</a>が必要です。`;
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

  // ================= モーダル：期日（追加・編集） =================
  // 両ページに同じモーダルのHTMLがある前提で、要素はここで一度だけ取得する。
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const fCase = document.getElementById("fCase");
  const fDate = document.getElementById("fDate");
  const fTime = document.getElementById("fTime");
  const fType = document.getElementById("fType");
  const fCourt = document.getElementById("fCourt");
  const fPlace = document.getElementById("fPlace");
  const fOpen = document.getElementById("fOpen");
  const fLevel = document.getElementById("fLevel");
  const fPlaintiff = document.getElementById("fPlaintiff");
  const fDefendant = document.getElementById("fDefendant");
  const caseList = document.getElementById("caseList");
  const btnSave = document.getElementById("btnSave");
  const btnCancel = document.getElementById("btnCancel");
  const btnDelete = document.getElementById("btnDelete");
  const formInputs = [fCase,fDate,fTime,fType,fCourt,fPlace,fOpen,fLevel,fPlaintiff,fDefendant];

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
    fOpen.checked = ev.open!==false; fLevel.value=ev.level||"";
    fPlaintiff.value=(ev.plaintiffArgument||[]).join("\n");
    fDefendant.value=(ev.defendantArgument||[]).join("\n");
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
    overlay.classList.add("show"); fDate.focus();
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
    overlay.classList.add("show"); fDate.focus();
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
    overlay.classList.add("show");
  }
  function closeModal(){ overlay.classList.remove("show"); editingId=null; }

  async function saveEntry(){
    if(!me.canWrite) return;
    const c=fCase.value.trim(), d=fDate.value;
    if(!c){ alert("事件名を入力してください。"); fCase.focus(); return; }
    if(!d){ alert("期日（日付）を入力してください。"); fDate.focus(); return; }
    const known=caseByName(c);
    const data={
      caseId: known ? known.id : "", case:c, date:d, time:fTime.value,
      type:fType.value.trim(), court:fCourt.value.trim(), place:fPlace.value.trim(),
      open:fOpen.checked, level:fLevel.value.trim(),
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
      if(!known) await reloadCases();   // 新しい事件名なら、サーバ側で事件が起こされている
      closeModal();
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
      closeModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ btnDelete.disabled=false; }
  }

  // ================= モーダル：事件・資料（HTMLはここで作って差し込む） =================
  const EXTRA_MODALS = `
<div class="overlay" id="caseOverlay">
  <div class="modal">
    <div class="mhead" id="caseModalTitle">事件を追加</div>
    <div class="mbody">
      <div class="field">
        <label>事件名 <span style="color:var(--stamp)">*</span></label>
        <input type="text" id="cName" placeholder="例）情報公開請求をめぐる訴訟">
      </div>
      <div class="two">
        <div class="field"><label>事件番号</label><input type="text" id="cCaseNo" placeholder="わかれば"></div>
        <div class="field"><label>当事者</label><input type="text" id="cParties" placeholder="例）原告 ○○　被告 △△"></div>
      </div>
      <div class="field"><label>争点（1行に1つ）</label><textarea id="cPoints" placeholder="例）◯◯の事実があったか"></textarea></div>
      <div class="field"><label>事件の説明（3〜4行）</label><textarea id="cLede" placeholder="どんな裁判か"></textarea></div>
      <div class="field"><label>よびかけ</label><textarea id="cCall" placeholder="傍聴や支援をお願いする文章（任意）"></textarea></div>
      <div class="two">
        <div class="field"><label>呼びかけ団体・お名前</label><input type="text" id="cHost"></div>
        <div class="field"><label>連絡先（公開してよいもの）</label><input type="text" id="cContact" placeholder="例）メールアドレス"></div>
      </div>
      <div class="field">
        <label>リンク（1行に1つのURL。X・ホームページなど）</label>
        <textarea id="cLinks" placeholder="https://x.com/..."></textarea>
      </div>
      <div class="field">
        <label>タグ（1行に1つ・任意）</label>
        <textarea id="cTags" placeholder="例）情報公開、行政"></textarea>
      </div>
      <p class="msec">終結（裁判アーカイブ・終結した事件のみ入れる）</p>
      <div class="two">
        <div class="field"><label>終結日</label><input type="date" id="cArchivedAt"></div>
        <div class="field"><label>終結の種類</label><input type="text" id="cCloseType" placeholder="例）判決、和解、取下げ"></div>
      </div>
      <div class="field">
        <label>結果（1〜2行・任意）</label>
        <textarea id="cResult" placeholder="例）原告の請求を一部認容（請求額の約6割）。控訴せず確定。"></textarea>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn-del" id="cDelete" style="display:none;">削除</button>
      <span class="spacer"></span>
      <button class="btn-cancel" id="cCancel">キャンセル</button>
      <button class="btn-save" id="cSave">保存</button>
    </div>
  </div>
</div>
<div class="overlay" id="matOverlay">
  <div class="modal">
    <div class="mhead" id="matModalTitle">資料を追加</div>
    <div class="mbody">
      <div class="field">
        <label>資料名 <span style="color:var(--stamp)">*</span></label>
        <input type="text" id="mTitle" placeholder="例）訴状、第1準備書面、甲3 ○○">
      </div>
      <div class="two">
        <div class="field"><label>提出者側</label>
          <select id="mSide"><option value="">（未選択）</option><option>原告側</option><option>被告側</option><option>裁判所</option><option>その他</option></select>
        </div>
        <div class="field"><label>種別</label>
          <select id="mKind"><option value="">（未選択）</option><option>主張書面</option><option>証拠</option><option>判決・決定</option><option>その他</option></select>
        </div>
      </div>
      <div class="two">
        <div class="field"><label>どの期日の資料か</label><select id="mEvent"></select></div>
        <div class="field"><label>提出日</label><input type="date" id="mFiledOn"></div>
      </div>
      <div class="field">
        <label>ファイルのURL（任意）</label>
        <input type="text" id="mUrl" placeholder="例）/docs/sojo.pdf　または https://…">
        <p class="fnote">PDF を <code>public/docs/</code> に入れて公開すると <code>/docs/ファイル名.pdf</code> で開けます。外部サイトのURLでも可。</p>
      </div>
      <div class="field" id="mFileField">
        <label>ファイルをアップロード（PDF・PNG・JPEG、20MBまで・任意）</label>
        <input type="file" id="mFile" accept="application/pdf,image/png,image/jpeg">
        <p class="fnote" id="mFileNow" hidden></p>
      </div>
      <div class="field"><label>この書面で主張していること（1行に1つ・任意）</label><textarea id="mClaims" placeholder="例）不開示決定の取消しを求める"></textarea></div>
      <div class="field">
        <label>本文（Markdownを貼り付け・任意）</label>
        <textarea id="mBody" placeholder="書面の本文をそのまま貼り付けられます（見出し・箇条書き・**強調**などが使えます）" style="min-height:120px"></textarea>
        <p class="fnote">「本文」ボタンから読めるページになります。原本はPDFなので、本文は補助（検索されやすくする・要点を読みやすくする）目的です。</p>
      </div>
      <div class="field"><label>要約（任意）</label><textarea id="mSummary" placeholder="手で書いた要約、またはAIに作らせて確認した要約"></textarea></div>
    </div>
    <div class="mfoot">
      <button class="btn-del" id="mDelete" style="display:none;">削除</button>
      <span class="spacer"></span>
      <button class="btn-cancel" id="mCancel">キャンセル</button>
      <button class="btn-save" id="mSave">保存</button>
    </div>
  </div>
</div>
<div class="overlay" id="imgOverlay">
  <div class="modal">
    <div class="mhead" id="imgModalTitle">写真を追加</div>
    <div class="mbody">
      <div class="field">
        <label>写真ファイル <span id="iFileReq" style="color:var(--stamp)">*</span></label>
        <input type="file" id="iFile" accept="image/jpeg,image/png,image/webp">
        <p class="fnote" id="iFileNow" hidden></p>
        <p class="fnote">JPEG・PNG・WebP、12MBまで。証拠写真は人の顔・氏名・住所が写り込んでいないか確認してから登録してください。</p>
      </div>
      <div class="field"><label>説明（1行・任意）</label><input type="text" id="iCaption" placeholder="例）提訴後の記者会見にて"></div>
    </div>
    <div class="mfoot">
      <button class="btn-del" id="iDelete" style="display:none;">削除</button>
      <span class="spacer"></span>
      <button class="btn-cancel" id="iCancel">キャンセル</button>
      <button class="btn-save" id="iSave">保存</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML("beforeend", EXTRA_MODALS);
  const $ = (id)=>document.getElementById(id);
  const caseOverlay=$("caseOverlay"), matOverlay=$("matOverlay");
  const cFields = { name:$("cName"), caseNo:$("cCaseNo"), parties:$("cParties"), points:$("cPoints"),
                    lede:$("cLede"), callText:$("cCall"), host:$("cHost"), contact:$("cContact"), links:$("cLinks"),
                    tags:$("cTags"), archivedAt:$("cArchivedAt"), closeType:$("cCloseType"), result:$("cResult") };
  const mFields = { title:$("mTitle"), side:$("mSide"), kind:$("mKind"), event:$("mEvent"), filedOn:$("mFiledOn"),
                    url:$("mUrl"), file:$("mFile"), fileField:$("mFileField"), fileNow:$("mFileNow"),
                    claims:$("mClaims"), body:$("mBody"), summary:$("mSummary") };
  let matCaseId = null;

  // ---- 事件 ----
  function fillCaseForm(c){
    cFields.name.value=c.name||""; cFields.caseNo.value=c.caseNo||""; cFields.parties.value=c.parties||"";
    cFields.points.value=(c.points||[]).join("\n"); cFields.lede.value=c.lede||""; cFields.callText.value=c.callText||"";
    cFields.host.value=c.host||""; cFields.contact.value=c.contact||""; cFields.links.value=(c.links||[]).join("\n");
    cFields.tags.value=(c.tags||[]).join("\n");
    cFields.archivedAt.value=c.archivedAt||""; cFields.closeType.value=c.closeType||""; cFields.result.value=c.result||"";
  }
  function openCaseAdd(){
    if(!me.canWrite) return;
    editingCaseId=null; $("caseModalTitle").textContent="事件を追加"; $("cDelete").style.display="none";
    fillCaseForm({});
    caseOverlay.classList.add("show"); cFields.name.focus();
  }
  function openCaseEdit(id){
    if(!me.canWrite) return;
    const c=caseById(id); if(!c) return;
    editingCaseId=id; $("caseModalTitle").textContent="事件を編集"; $("cDelete").style.display="inline-block";
    fillCaseForm(c);
    caseOverlay.classList.add("show");
  }
  function closeCaseModal(){ caseOverlay.classList.remove("show"); editingCaseId=null; }
  async function saveCase(){
    if(!me.canWrite) return;
    const name=cFields.name.value.trim();
    if(!name){ alert("事件名を入力してください。"); cFields.name.focus(); return; }
    const data={
      name, caseNo:cFields.caseNo.value.trim(), parties:cFields.parties.value.trim(),
      points:cFields.points.value.split("\n").map(s=>s.trim()).filter(Boolean),
      lede:cFields.lede.value.trim(), callText:cFields.callText.value.trim(),
      host:cFields.host.value.trim(), contact:cFields.contact.value.trim(),
      links:cFields.links.value.split("\n").map(s=>s.trim()).filter(Boolean),
      tags:cFields.tags.value.split("\n").map(s=>s.trim()).filter(Boolean),
      archivedAt:cFields.archivedAt.value, closeType:cFields.closeType.value.trim(), result:cFields.result.value.trim(),
    };
    $("cSave").disabled=true;
    try{
      if(editingCaseId){
        const up=await apiUpdateCase(editingCaseId,data);
        const i=cases.findIndex(c=>c.id===editingCaseId); if(i>=0) cases[i]=up;
        events.forEach(e=>{ if(e.caseId===up.id) e.case=up.name; });
      }else{
        const created=await apiCreateCase(data);
        cases.push(created);
      }
      closeCaseModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("cSave").disabled=false; }
  }
  async function deleteCase(){
    if(!editingCaseId || !me.canWrite) return;
    if(!confirm("この事件を削除します。よろしいですか？（期日や資料が残っていると削除できません）")) return;
    $("cDelete").disabled=true;
    try{
      await apiDeleteCase(editingCaseId);
      cases=cases.filter(c=>c.id!==editingCaseId);
      closeCaseModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("cDelete").disabled=false; }
  }
  $("cSave").addEventListener("click",saveCase);
  $("cCancel").addEventListener("click",closeCaseModal);
  $("cDelete").addEventListener("click",deleteCase);
  caseOverlay.addEventListener("click",(e)=>{ if(e.target===caseOverlay) closeCaseModal(); });

  // ---- 資料 ----
  function fillMatForm(m, caseId){
    matCaseId=caseId;
    const rounds=caseEvents(caseId);
    mFields.event.innerHTML = `<option value="">（紐づけない）</option>` + rounds.map(e=>
      `<option value="${escapeAttr(e.id)}"${m.eventId===e.id?" selected":""}>${escapeHtml(e.type||"期日")}　${escapeHtml(e.date)}</option>`).join("");
    mFields.title.value=m.title||""; mFields.side.value=m.side||""; mFields.kind.value=m.kind||"";
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
    matOverlay.classList.add("show"); mFields.title.focus();
  }
  function openMatEdit(id){
    if(!me.canWrite) return;
    const m=materials.find(x=>x.id===id); if(!m) return;
    editingMatId=id; $("matModalTitle").textContent="資料を編集"; $("mDelete").style.display="inline-block";
    fillMatForm(m, m.caseId);
    matOverlay.classList.add("show");
  }
  function closeMatModal(){ matOverlay.classList.remove("show"); editingMatId=null; matCaseId=null; }
  async function saveMat(){
    if(!me.canWrite || !matCaseId) return;
    const title=mFields.title.value.trim();
    if(!title){ alert("資料名を入力してください。"); mFields.title.focus(); return; }
    const fd=new FormData();
    fd.append("caseId", matCaseId);
    fd.append("eventId", mFields.event.value);
    fd.append("title", title);
    fd.append("side", mFields.side.value);
    fd.append("kind", mFields.kind.value);
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
        if(created.eventId) openNodes.add(created.eventId);   // 追加した資料が見える節を開いておく
      }
      closeMatModal();
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
      closeMatModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("mDelete").disabled=false; }
  }
  $("mSave").addEventListener("click",saveMat);
  $("mCancel").addEventListener("click",closeMatModal);
  $("mDelete").addEventListener("click",deleteMat);
  matOverlay.addEventListener("click",(e)=>{ if(e.target===matOverlay) closeMatModal(); });

  // ---- 写真 ----
  const imgOverlay=$("imgOverlay");
  const iFields = { file:$("iFile"), fileNow:$("iFileNow"), fileReq:$("iFileReq"), caption:$("iCaption") };
  let imgCaseId = null;

  function openImgAdd(caseId){
    if(!me.canWrite) return;
    editingImgId=null; imgCaseId=caseId; $("imgModalTitle").textContent="写真を追加"; $("iDelete").style.display="none";
    iFields.file.value=""; iFields.caption.value=""; iFields.fileNow.hidden=true; iFields.fileReq.style.display="";
    imgOverlay.classList.add("show"); iFields.file.focus();
  }
  function openImgEdit(id){
    if(!me.canWrite) return;
    const im=images.find(x=>x.id===id); if(!im) return;
    editingImgId=id; imgCaseId=im.caseId; $("imgModalTitle").textContent="写真を編集"; $("iDelete").style.display="inline-block";
    iFields.file.value=""; iFields.caption.value=im.caption||""; iFields.fileReq.style.display="none";
    iFields.fileNow.hidden=false;
    iFields.fileNow.innerHTML=`いまの写真：<img src="${escapeAttr(im.url)}" alt="" style="width:64px;height:46px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-left:6px">`+
      `　ファイルを選ぶと差し替わります。`;
    imgOverlay.classList.add("show");
  }
  function closeImgModal(){ imgOverlay.classList.remove("show"); editingImgId=null; imgCaseId=null; }
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
      closeImgModal();
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
      closeImgModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ $("iDelete").disabled=false; }
  }
  $("iSave").addEventListener("click",saveImg);
  $("iCancel").addEventListener("click",closeImgModal);
  $("iDelete").addEventListener("click",deleteImg);
  imgOverlay.addEventListener("click",(e)=>{ if(e.target===imgOverlay) closeImgModal(); });

  // ================= バックアップ =================
  function exportData(){
    const data={ version:3, exportedAt:new Date().toISOString(), cases, events, materials, images };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const t=new Date();
    a.href=url;
    a.download=`裁判カレンダー_${t.getFullYear()}${String(t.getMonth()+1).padStart(2,"0")}${String(t.getDate()).padStart(2,"0")}.json`;
    a.click(); URL.revokeObjectURL(url);
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
      if(caseByName(c.name)) continue;
      try{ cases.push(await apiCreateCase(c)); }catch(err){ if(err.status!==409) ng++; }
    }
    for(const e of inEvents){
      try{
        const known=caseByName(e.case);
        const created=await apiCreate({
          caseId: known?known.id:"", case:e.case, date:e.date, time:e.time, type:e.type,
          court:e.court, place:e.place, open:e.open, level:e.level,
          // 旧形式なら事件の説明も一緒に送る（新しい事件を起こすときに使われる）
          caseNo:e.caseNo, parties:e.parties, host:e.host, contact:e.contact, lede:e.lede, points:e.points,
        });
        events.push(created); ok++;
        if(!known) await reloadCases();
      }catch(err){ ng++; }
    }
    if(onChange) onChange();
    alert(`追加：${ok}件${ng?`／失敗：${ng}件`:""}`);
  }

  // ---- モーダルの配線（両ページ共通） ----
  btnSave.addEventListener("click",saveEntry);
  btnCancel.addEventListener("click",closeModal);
  btnDelete.addEventListener("click",deleteEntry);
  overlay.addEventListener("click",(e)=>{ if(e.target===overlay) closeModal(); });
  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape"){
      if(overlay.classList.contains("show")) closeModal();
      if(caseOverlay.classList.contains("show")) closeCaseModal();
      if(matOverlay.classList.contains("show")) closeMatModal();
      if(imgOverlay.classList.contains("show")) closeImgModal();
    }
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){
      if(overlay.classList.contains("show")) saveEntry();
      else if(caseOverlay.classList.contains("show")) saveCase();
      else if(matOverlay.classList.contains("show")) saveMat();
      else if(imgOverlay.classList.contains("show")) saveImg();
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
    get events(){ return events; },
    get posts(){ return posts; },
    get materials(){ return materials; },
    get images(){ return images; },
    get me(){ return me; },
    get loaded(){ return loaded; },
    caseById, caseByName, caseEvents, casePosts, caseMaterials, caseImages, materialById, nearestCase, nextEvent, eventLine,
    mdToHtml, likeHtml, toggleLike, isArchived,
    load, renderCaseDetail, renderStatus, openAdd,
    setOnChange(fn){ onChange = fn; },
  };
})();
