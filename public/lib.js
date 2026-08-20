// 裁判カレンダー・共通ロジック（index.html / case.html の両方から読み込む）
// モーダルや「編集パスワード」の状態など、両ページに共通のものはここに集約する。
// 呼び出す側（各ページ末尾のスクリプト）は window.CC 経由で使う。
window.CC = (function(){
  "use strict";
  const PALETTE = ["#5c6b7d","#5f7a63","#7d5f74","#8a6a50","#607a7d","#7d6a5c","#6b5c7d","#7a7d5f","#8a5c5c","#5c7d75"];
  const EDITKEY_LS = "court-calendar.editkey";
  const WD = ["日","月","火","水","木","金","土"];

  // ---- state ----
  let editKey = localStorage.getItem(EDITKEY_LS) || "";   // 編集パスワード（この端末に保存）
  let loaded = false;   // 最初のデータ取得が終わったか（終わるまで「まだありません」系の文言を出さない）
  let events = [];
  let posts = [];
  let me = { email:null, canWrite:false, viaAccess:false, allowAll:false, boardOpen:false, turnstileSiteKey:"" };
  let editingId = null;
  let boardFormForCase = null;   // 投稿フォームを開いている事件名
  let tsToken = "";
  let tsScriptPromise = null;
  let onChange = null;           // ページ側が登録する「データが変わったら呼ぶ」コールバック

  // ---- util ----
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function parseYmd(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
  function todayStr(){ return ymd(new Date()); }
  function byTime(a,b){ return (a.time||"99:99").localeCompare(b.time||"99:99"); }
  function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function escapeAttr(s){ return String(s||"").replace(/"/g,"&quot;"); }
  function cssEsc(s){ return String(s).replace(/"/g,'\\"'); }

  function colorFor(name){
    const names=[...new Set(events.map(e=>e.case))].sort();
    const idx=names.indexOf(name);
    return PALETTE[(idx<0?0:idx)%PALETTE.length];
  }

  // ================= API =================
  async function api(method, path, body, extra){
    const opt = { method, headers:{} };
    if(editKey) opt.headers["X-Edit-Key"]=editKey;
    if(extra) Object.assign(opt.headers, extra);
    if(body!==undefined){ opt.headers["content-type"]="application/json"; opt.body=JSON.stringify(body); }
    const res = await fetch(path, opt);
    if(!res.ok){
      let msg = "HTTP " + res.status;
      try{ const j=await res.json(); if(j&&j.error) msg=j.error; }catch(e){}
      const err = new Error(msg); err.status=res.status; throw err;
    }
    if(res.status===204) return null;
    return res.json();
  }
  const apiMe        = ()=> api("GET","/api/me");
  const apiList       = ()=> api("GET","/api/events");
  const apiCreate     = (d)=> api("POST","/api/events", d);
  const apiUpdate     = (id,d)=> api("PUT","/api/events/"+encodeURIComponent(id), d);
  const apiDelete     = (id)=> api("DELETE","/api/events/"+encodeURIComponent(id));
  const apiListPosts  = ()=> api("GET","/api/posts");
  const apiDeletePost = (id)=> api("DELETE","/api/posts/"+encodeURIComponent(id));
  function saveErr(err){
    if(err && err.status===403) return "この操作は許可されていません（閲覧のみの権限です）。";
    return "保存できませんでした：" + (err && err.message || err);
  }

  async function load(){
    try{ me = await apiMe(); }catch(e){ me={email:null,canWrite:false,allowAll:false,boardOpen:false,turnstileSiteKey:""}; }
    try{ events = await apiList(); }catch(e){ events=[]; }
    try{ posts = await apiListPosts(); }catch(e){ posts=[]; }
    loaded = true;
  }

  // ================= 事件（同じ case_name をまとめる） =================
  function caseEvents(caseName){
    return events.filter(e=>e.case===caseName)
      .sort((a,b)=> a.date===b.date ? byTime(a,b) : a.date.localeCompare(b.date));
  }
  function casePosts(caseName){
    return posts.filter(p=>p.case===caseName);
  }
  // 直近に期日がある事件（トップの「最近の期日」・カレンダーの初期表示月に使う）
  function nearestCase(){
    const today=todayStr();
    const list=events.filter(e=>e.date>=today)
      .sort((a,b)=> a.date===b.date?byTime(a,b):a.date.localeCompare(b.date));
    return list[0] ? list[0].case : null;
  }
  // 「第2回口頭弁論　東京地方裁判所 610号法廷　2026年8月26日（水）13:30」の1行
  function eventLine(ev){
    const d=parseYmd(ev.date);
    const place=[ev.court,ev.place].filter(Boolean).join(" ");
    return [
      ev.type, place,
      `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${WD[d.getDay()]}）${ev.time||""}`
    ].filter(Boolean).join("　");
  }
  // ================= 事件の詳細カード（トップ「最近の期日」／別ページ共通） =================
  function caseDetailHtml(caseName){
    const rounds = caseEvents(caseName);
    if(!rounds.length) return null;
    const src = rounds[rounds.length-1];   // 直近の回の内容を、事件の説明として使う
    const points=(src.points||[]).map(p=>`<li>${escapeHtml(p)}</li>`).join("");
    const credit=[
      src.host?`呼びかけ：${escapeHtml(src.host)}`:"",
      src.contact?`連絡先：<a href="mailto:${escapeAttr(src.contact)}">${escapeHtml(src.contact)}</a>`:""
    ].filter(Boolean).join("<br>");
    const roundsHtml = rounds.map(ev=>{
      const closed = ev.open===false ? `<span class="round-closed">非公開・要確認</span>` : "";
      const editLink = me.canWrite ? `<a class="round-edit" data-edit="${escapeAttr(ev.id)}">編集</a>` : "";
      return `<li>${escapeHtml(eventLine(ev))}${closed}${editLink}</li>`;
    }).join("");

    return `
      <div class="card dcard">
        <h2 class="d-title">${escapeHtml(caseName)}</h2>
        ${src.parties?`<p class="minih">当事者</p><p class="d-body">${escapeHtml(src.parties)}</p>`:""}
        ${points?`<p class="minih">争点</p><ul class="pts">${points}</ul>`:""}
        ${(src.lede||credit)?`<p class="lede">${escapeHtml(src.lede)}${credit?`<span class="credit">${credit}</span>`:""}</p>`:""}
        <p class="minih">期日</p>
        <ul class="pts rounds">${roundsHtml}</ul>
        ${me.canWrite?`<p class="qact"><a data-addround="${escapeAttr(caseName)}">＋ この事件に期日を追加</a></p>`:""}
        ${boardHtml(caseName)}
      </div>`;
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

  function boardHtml(caseName){
    const rounds = caseEvents(caseName);
    const mine = casePosts(caseName);
    // 投稿できるのは：スパム対策(Turnstile)設定済みのとき＝誰でも／未設定でも運営は可
    const canPost = me.boardOpen || me.canWrite;
    const items = mine.map(p=>{
      const ev = rounds.find(e=>e.id===p.eventId);
      return bubbleHtml(p, (ev && ev.type) || p.round || "");
    }).join("");
    let html=`<div class="bpanel">`+
      `<div class="bhead"><span class="btitle"><span class="bt-red">行ってきたよ</span>掲示板</span>`+
      (mine.length?`<span class="bcount">${mine.length}件の報告</span>`:"")+
      `</div>`;
    html += items
      || `<p class="board-empty">${canPost
          ? "まだ報告はありません。傍聴に行かれた方の最初の報告をお待ちしています。"
          : "まだ報告はありません。"}</p>`;
    if(canPost){
      html += boardFormForCase===caseName
        ? postFormHtml(caseName)
        : `<p class="bwrite"><a data-openpost="${escapeAttr(caseName)}">傍聴の報告を書く</a></p>`;
    }else{
      // 押させてから断らない：受付前はリンクを出さず、一文だけ添える
      html += `<p class="board-empty">傍聴の報告の投稿は、いま準備中です。</p>`;
    }
    html += `</div>`;
    return html;
  }

  function postFormHtml(caseName){
    const rounds = caseEvents(caseName);
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

  async function submitPost(caseName, container){
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

  // 事件の詳細カードを、指定した入れ物に描く（トップの「最近の期日」／別ページ共通）
  function renderCaseDetail(container, caseName){
    if(!loaded){
      container.innerHTML = `<div class="card"><p class="empty-msg">読み込んでいます…</p></div>`;
      return;
    }
    if(!caseName){
      container.innerHTML = `<div class="card"><p class="empty-msg">これから先の期日は、まだ登録されていません。</p></div>`;
      return;
    }
    const html = caseDetailHtml(caseName);
    if(!html){
      container.innerHTML =
        `<div class="card"><p class="empty-msg">その事件は見つかりませんでした。</p>`+
        `<p class="qact" style="text-align:center;padding-bottom:20px"><a href="index.html">カレンダーに戻る</a></p></div>`;
      return;
    }
    container.innerHTML = html;
    wireCaseDetail(container, caseName);
  }

  function wireCaseDetail(container, caseName){
    container.querySelectorAll("[data-edit]").forEach(a=>{
      a.addEventListener("click",()=>openEdit(a.dataset.edit));
    });
    const addRound = container.querySelector("[data-addround]");
    if(addRound) addRound.addEventListener("click",()=>openAddRound(caseName));
    container.querySelectorAll("[data-openpost]").forEach(a=>{
      a.addEventListener("click",()=>{ boardFormForCase=a.dataset.openpost; renderCaseDetail(container, caseName); });
    });
    container.querySelectorAll("[data-closepost]").forEach(b=>{
      b.addEventListener("click",()=>{ boardFormForCase=null; tsToken=""; renderCaseDetail(container, caseName); });
    });
    container.querySelectorAll("[data-delpost]").forEach(a=>{
      a.addEventListener("click",()=>removePost(a.dataset.delpost));
    });
    const q=container.querySelector("#pQuote");
    if(q){
      const c=container.querySelector("#pCount");
      q.addEventListener("input",()=>{ c.textContent=[...q.value].length; });
      q.focus();
    }
    const send=container.querySelector("#pSend");
    if(send) send.addEventListener("click",()=>submitPost(caseName, container));
    if(boardFormForCase===caseName) mountTurnstile(container);
  }

  // ================= 下部のひっそりしたステータス =================
  function renderStatus(el){
    if(!loaded){ el.innerHTML=""; return; }
    if(me.canWrite){
      el.innerHTML =
        `編集できます ── この端末は編集ロック解除済みです。`+
        `<br><a id="stAdd">＋ 期日を追加</a><span class="sep">・</span>`+
        `<a id="stLock">ロックする</a><span class="sep">・</span>`+
        `<a id="stExport">バックアップを書き出す</a><span class="sep">・</span>`+
        `<a id="stImport">ファイルから取り込み</a>`;
      el.querySelector("#stAdd").addEventListener("click",()=>openAdd(todayStr()));
      el.querySelector("#stLock").addEventListener("click",lockEditing);
      el.querySelector("#stExport").addEventListener("click",exportData);
      el.querySelector("#stImport").addEventListener("click",()=>{
        const fi=document.getElementById("fileInput"); if(fi) fi.click();
      });
    }else{
      el.innerHTML =
        `どなたでも閲覧できる公開カレンダーです。掲載内容は呼びかけ人から提供された情報にもとづきます。`+
        `<br>期日の追加・編集には <a id="stUnlock">編集パスワードを入力</a> してください。`;
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

  // ================= モーダル（追加・編集） =================
  // 両ページに同じモーダルのHTMLがある前提で、要素はここで一度だけ取得する。
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const fCase = document.getElementById("fCase");
  const fCaseNo = document.getElementById("fCaseNo");
  const fDate = document.getElementById("fDate");
  const fTime = document.getElementById("fTime");
  const fType = document.getElementById("fType");
  const fCourt = document.getElementById("fCourt");
  const fPlace = document.getElementById("fPlace");
  const fParties = document.getElementById("fParties");
  const fHost = document.getElementById("fHost");
  const fContact = document.getElementById("fContact");
  const fLede = document.getElementById("fLede");
  const fPoints = document.getElementById("fPoints");
  const fOpen = document.getElementById("fOpen");
  const fLevel = document.getElementById("fLevel");
  const caseList = document.getElementById("caseList");
  const btnSave = document.getElementById("btnSave");
  const btnCancel = document.getElementById("btnCancel");
  const btnDelete = document.getElementById("btnDelete");
  const formInputs = [fCase,fCaseNo,fDate,fTime,fType,fCourt,fPlace,fParties,fHost,fContact,fLede,fPoints,fOpen,fLevel];

  function refreshCaseList(){
    const names=[...new Set(events.map(e=>e.case))].sort();
    caseList.innerHTML=names.map(n=>`<option value="${escapeAttr(n)}">`).join("");
  }
  function setReadonly(ro){
    formInputs.forEach(el=>{ el.disabled=ro; });
    btnSave.style.display = ro ? "none" : "";
    btnCancel.textContent = ro ? "閉じる" : "キャンセル";
  }
  function openAdd(dateStr){
    if(!me.canWrite) return;
    editingId=null; modalTitle.textContent="期日を追加"; btnDelete.style.display="none";
    setReadonly(false); refreshCaseList();
    fCase.value=""; fCaseNo.value=""; fDate.value=dateStr||todayStr(); fTime.value="";
    fType.value=""; fCourt.value=""; fPlace.value="";
    fParties.value=""; fHost.value=""; fContact.value="";
    fLede.value=""; fPoints.value=""; fOpen.checked=true; fLevel.value="";
    if(events.length){
      const recent=[...events].sort((a,b)=>b.date.localeCompare(a.date))[0];
      fCase.value=recent.case; fCourt.value=recent.court||""; fPlace.value=recent.place||"";
    }
    overlay.classList.add("show"); fDate.focus();
  }
  // 既にある事件に、新しい回を追加する（事件の中身は直近の回から引き継ぐ）
  function openAddRound(caseName){
    if(!me.canWrite) return;
    const rounds = caseEvents(caseName);
    const src = rounds[rounds.length-1];
    editingId=null; modalTitle.textContent="期日を追加"; btnDelete.style.display="none";
    setReadonly(false); refreshCaseList();
    fCase.value=caseName; fCaseNo.value = src ? (src.caseNo||"") : "";
    fDate.value=""; fTime.value=""; fType.value="";
    fCourt.value = src ? (src.court||"") : "";
    fPlace.value = src ? (src.place||"") : "";
    fParties.value = src ? (src.parties||"") : "";
    fHost.value = src ? (src.host||"") : "";
    fContact.value = src ? (src.contact||"") : "";
    fLede.value = src ? (src.lede||"") : "";
    fPoints.value = src ? (src.points||[]).join("\n") : "";
    fOpen.checked = true; fLevel.value = "";
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
    fCase.value=ev.case; fCaseNo.value=ev.caseNo||""; fDate.value=ev.date; fTime.value=ev.time||"";
    fType.value=ev.type||""; fCourt.value=ev.court||""; fPlace.value=ev.place||"";
    fParties.value=ev.parties||""; fHost.value=ev.host||""; fContact.value=ev.contact||"";
    fLede.value=ev.lede||""; fPoints.value=(ev.points||[]).join("\n");
    fOpen.checked = ev.open!==false; fLevel.value=ev.level||"";
    overlay.classList.add("show");
  }
  function closeModal(){ overlay.classList.remove("show"); editingId=null; }

  async function saveEntry(){
    if(!me.canWrite) return;
    const c=fCase.value.trim(), d=fDate.value;
    if(!c){ alert("事件名を入力してください。"); fCase.focus(); return; }
    if(!d){ alert("期日（日付）を入力してください。"); fDate.focus(); return; }
    const data={
      case:c, caseNo:fCaseNo.value.trim(), date:d, time:fTime.value,
      type:fType.value.trim(), court:fCourt.value.trim(), place:fPlace.value.trim(),
      parties:fParties.value.trim(), host:fHost.value.trim(), contact:fContact.value.trim(),
      lede:fLede.value.trim(),
      points:fPoints.value.split("\n").map(s=>s.trim()).filter(Boolean),
      open:fOpen.checked, level:fLevel.value.trim(),
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
      closeModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ btnSave.disabled=false; }
  }
  async function deleteEntry(){
    if(!editingId || !me.canWrite) return;
    if(!confirm("この期日を削除します。よろしいですか？")) return;
    btnDelete.disabled=true;
    try{
      await apiDelete(editingId);
      events=events.filter(e=>e.id!==editingId);
      closeModal();
      if(onChange) onChange();
    }catch(err){ alert(saveErr(err)); }
    finally{ btnDelete.disabled=false; }
  }

  // ================= バックアップ =================
  function exportData(){
    const blob=new Blob([JSON.stringify(events,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const t=new Date();
    a.href=url;
    a.download=`裁判カレンダー_${t.getFullYear()}${String(t.getMonth()+1).padStart(2,"0")}${String(t.getDate()).padStart(2,"0")}.json`;
    a.click(); URL.revokeObjectURL(url);
  }
  async function importMerge(file){
    if(!me.canWrite){ alert("取り込みには編集権限が必要です。"); return; }
    let data;
    try{ data=JSON.parse(await file.text()); }catch(e){ alert("読み込めませんでした：" + e.message); return; }
    if(!Array.isArray(data)){ alert("形式が違います（JSON配列ではありません）。"); return; }
    if(!confirm(`${data.length}件を共有カレンダーに追加します。よろしいですか？`)) return;
    let ok=0, ng=0;
    for(const e of data){
      try{
        const created=await apiCreate({
          case:e.case, caseNo:e.caseNo, date:e.date, time:e.time, type:e.type,
          court:e.court, place:e.place, parties:e.parties, host:e.host, contact:e.contact,
          lede:e.lede, points:e.points, open:e.open, level:e.level
        });
        events.push(created); ok++;
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
    if(e.key==="Escape"&&overlay.classList.contains("show")) closeModal();
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&overlay.classList.contains("show")) saveEntry();
  });
  const fileInputEl = document.getElementById("fileInput");
  if(fileInputEl){
    fileInputEl.addEventListener("change",(e)=>{ if(e.target.files[0]) importMerge(e.target.files[0]); e.target.value=""; });
  }

  return {
    PALETTE, WD,
    startOfMonth, ymd, parseYmd, todayStr, byTime, escapeHtml, escapeAttr, cssEsc,
    get events(){ return events; },
    get posts(){ return posts; },
    get me(){ return me; },
    get loaded(){ return loaded; },
    colorFor, caseEvents, casePosts, nearestCase, eventLine,
    load, renderCaseDetail, renderStatus, openAdd,
    setOnChange(fn){ onChange = fn; },
  };
})();
