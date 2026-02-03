import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// -------------------- auth --------------------
function assertAdminKey(headerKey?: string) {
  const key = process.env.ADMIN_REVIEW_KEY ?? 'dev-admin';
  if (!headerKey || headerKey !== key) {
    throw new UnauthorizedException('Invalid admin key');
  }
}

// -------------------- date helpers (KST) --------------------
function isYmd(s?: string) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseKstRange(from?: string, to?: string) {
  // createdAt filter: gte fromStartKST, lt (toEndKST + 1day)
  // if ISO string passed, just Date(from) and Date(to)
  let gte: Date | undefined;
  let lt: Date | undefined;

  if (from) {
    if (isYmd(from)) gte = new Date(`${from}T00:00:00+09:00`);
    else gte = new Date(from);
    if (Number.isNaN(gte.getTime())) gte = undefined;
  }

  if (to) {
    if (isYmd(to)) {
      const endStart = new Date(`${to}T00:00:00+09:00`);
      if (!Number.isNaN(endStart.getTime())) {
        // next day 00:00 KST (exclusive)
        lt = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
      }
    } else {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) lt = d;
    }
  }

  const createdAt: any = {};
  if (gte) createdAt.gte = gte;
  if (lt) createdAt.lt = lt;

  return Object.keys(createdAt).length ? createdAt : undefined;
}

function toInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('auth-check')
  authCheck(@Headers('x-admin-key') adminKey?: string) {
    assertAdminKey(adminKey);
    return { ok: true };
  }

  // -------------------- PAGES --------------------

  // 관리자 Proof 리뷰 페이지
  @Get('review')
  reviewPage() {
    const html = `
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Proof Review</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Apple SD Gothic Neo,sans-serif;margin:0;background:#f6f6f8;color:#111}
    header{position:sticky;top:0;background:#fff;border-bottom:1px solid #eee;padding:12px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .nav a{display:inline-block;padding:10px 12px;border-radius:10px;background:#111;color:#fff;font-weight:900;text-decoration:none}
    .nav a.secondary{background:#666}
    input,select{padding:10px 12px;border:1px solid #ddd;border-radius:10px}
    button{padding:10px 12px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:900;cursor:pointer}
    button.secondary{background:#666}
    main{padding:16px;max-width:1280px;margin:0 auto}
    .tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .tab{padding:10px 12px;border-radius:999px;background:#fff;border:1px solid #eee;font-weight:900;cursor:pointer}
    .tab.active{background:#111;color:#fff;border-color:#111}
    .stats{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
    .stat{background:#fff;border:1px solid #eee;border-radius:14px;padding:10px 12px;font-weight:900}
    .filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:#fff;border:1px solid #eee;border-radius:16px;padding:12px}
    .grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}
    .card{background:#fff;border:1px solid #eee;border-radius:16px;padding:12px;display:grid;grid-template-columns:360px 1fr;gap:14px}
    img{width:360px;height:360px;object-fit:cover;border-radius:14px;background:#f2f2f2}
    .meta{display:flex;flex-direction:column;gap:8px}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .pill{padding:6px 10px;border-radius:999px;background:#f1f1f1;font-weight:800}
    .pill.hold{background:#fff4d6}
    .pill.pending{background:#e8f0ff}
    .pill.pass{background:#e7ffe8}
    .pill.fail{background:#ffe7e7}
    .actions{display:flex;gap:10px;margin-top:6px;flex-wrap:wrap}
    .actions button{min-width:110px}
    .actions button.pass{background:#0a7a2f}
    .actions button.fail{background:#c62828}
    pre{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:10px;margin:0;max-height:220px;overflow:auto}
    .pager{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}
    .muted{color:#666;font-weight:700}

    /* key modal */
    #keyModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center}
    #keyModal .box{width:min(520px,92vw);background:#fff;border-radius:16px;padding:16px;border:1px solid #eee}
    #keyModal .title{font-weight:900;font-size:18px}
    #keyModal .msg{margin:8px 0 12px;color:#666;font-weight:700}
    #keyModal input{width:100%}
    #keyModal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}
  </style>
</head>
<body>

  <!-- key modal -->
  <div id="keyModal">
    <div class="box">
      <div class="title">관리자 키 입력</div>
      <div class="msg" id="keyModalMsg"></div>
      <input id="keyModalInput" placeholder="ADMIN_REVIEW_KEY" />
      <div class="actions">
        <button onclick="saveKeyFromModal()">저장</button>
      </div>
    </div>
  </div>

  <header>
    <div class="nav">
      <a href="/admin/review">Proof Review</a>
      <a class="secondary" href="/admin/points">Points</a>
    </div>

    <input id="key" placeholder="ADMIN_REVIEW_KEY" />
    <button onclick="saveKeyFromHeader()">키 저장</button>

    <span id="status" class="muted" style="margin-left:auto"></span>
  </header>

  <main>
    <div class="tabs">
      <div class="tab active" data-bucket="need" onclick="setBucket('need')">리뷰필요</div>
      <div class="tab" data-bucket="pass" onclick="setBucket('pass')">리뷰완료 · 성공</div>
      <div class="tab" data-bucket="fail" onclick="setBucket('fail')">리뷰완료 · 실패</div>
      <div class="tab" data-bucket="all" onclick="setBucket('all')">전체</div>
    </div>

    <div class="stats" id="stats"></div>

    <div class="filters">
      <label class="muted">검색</label>
      <input id="q" placeholder="proofId / sessionId / userId / menuName" style="min-width:340px"/>

      <label class="muted">From</label>
      <input id="from" type="date" />
      <label class="muted">To</label>
      <input id="to" type="date" />

      <label class="muted">정렬</label>
      <select id="order">
        <option value="asc">오래된순</option>
        <option value="desc">최신순</option>
      </select>

      <label class="muted">페이지당</label>
      <select id="take">
        <option value="10">10</option>
        <option value="20" selected>20</option>
        <option value="30">30</option>
        <option value="50">50</option>
      </select>

      <button onclick="reload()">조회</button>
      <button class="secondary" onclick="resetFilters()">필터 초기화</button>
    </div>

    <div class="grid" id="list"></div>

    <div class="pager">
      <button class="secondary" onclick="prevPage()">이전</button>
      <span class="muted" id="pageInfo"></span>
      <button class="secondary" onclick="nextPage()">다음</button>
    </div>
  </main>

<script>
  // ✅ GET param(예: ?k=...) 절대 사용하지 않음

  // ---------- key helpers ----------
  function getKey(){ return (localStorage.getItem("ADMIN_REVIEW_KEY") || "").trim(); }
  function setKey(k){ localStorage.setItem("ADMIN_REVIEW_KEY", (k||"").trim()); }
  function clearKey(){ localStorage.removeItem("ADMIN_REVIEW_KEY"); }

  function showKeyModal(msg){
    document.getElementById("keyModalMsg").textContent = msg || "";
    document.getElementById("keyModal").style.display = "flex";
    document.getElementById("keyModalInput").value = "";
    setTimeout(() => document.getElementById("keyModalInput").focus(), 30);
  }
  function hideKeyModal(){
    document.getElementById("keyModal").style.display = "none";
  }

  async function authCheck(k){
    const res = await fetch("/admin/auth-check", {
      method: "POST",
      headers: { "x-admin-key": k }
    });
    if(!res.ok) throw new Error("Invalid admin key");
    return res.json();
  }

  async function saveKeyFromModal(){
    const v = document.getElementById("keyModalInput").value.trim();
    if(!v) return alert("키를 입력해줘");
    try{
      await authCheck(v);
      setKey(v);
      document.getElementById("key").value = v;
      hideKeyModal();
      reload(true);
    }catch(e){
      clearKey();
      alert("키가 올바르지 않아");
    }
  }

  async function saveKeyFromHeader(){
    const v = document.getElementById("key").value.trim();
    if(!v) return showKeyModal("관리자 키를 입력해줘.");
    try{
      await authCheck(v);
      setKey(v);
      reload(true);
    }catch(e){
      clearKey();
      showKeyModal("키가 올바르지 않아. 다시 입력해줘.");
    }
  }

  function ensureKeyOrShow(){
    const k = getKey();
    if(!k){
      showKeyModal("관리자 키가 필요해. 입력해줘.");
      return false;
    }
    return true;
  }

  // ---------- api wrapper ----------
  async function api(path, opts={}){
    const k = getKey();
    const res = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": k,
        ...(opts.headers || {})
      }
    });

    if(res.status === 401){
      clearKey();
      showKeyModal("관리자 키가 필요해. 다시 입력해줘.");
      throw new Error("401 Unauthorized");
    }
    if(!res.ok){
      const t = await res.text();
      throw new Error(res.status + " " + t);
    }
    return res.json();
  }

  // ---------- ui state ----------
  const keyInput = document.getElementById("key");
  keyInput.value = getKey();

  let state = { bucket: "need", page: 1 };

  function setBucket(bucket){
    state.bucket = bucket;
    state.page = 1;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelector('.tab[data-bucket="'+bucket+'"]').classList.add("active");
    reload(true);
  }

  function resetFilters(){
    document.getElementById("q").value = "";
    document.getElementById("from").value = "";
    document.getElementById("to").value = "";
    document.getElementById("order").value = "asc";
    document.getElementById("take").value = "20";
    state.page = 1;
    reload(true);
  }

  function pillClass(s){
    if (s==="HOLD") return "hold";
    if (s==="PENDING") return "pending";
    if (s==="PASS") return "pass";
    if (s==="FAIL") return "fail";
    return "";
  }

  function escapeHtml(s){
    return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  function buildQuery(){
    const q = document.getElementById("q").value.trim();
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;
    const take = document.getElementById("take").value;
    const order = document.getElementById("order").value;

    const p = new URLSearchParams();
    p.set("bucket", state.bucket);
    p.set("page", String(state.page));
    p.set("take", String(take));
    p.set("order", order);
    if(q) p.set("q", q);
    if(from) p.set("from", from);
    if(to) p.set("to", to);
    return p.toString();
  }

  async function reload(withStats=false){
    if(!ensureKeyOrShow()) return;

    const statusEl = document.getElementById("status");
    statusEl.textContent = "불러오는 중...";
    try{
      if(withStats){
        const stats = await api("/admin/proof-stats?" + buildQuery());
        renderStats(stats);
      }
      const data = await api("/admin/proofs?" + buildQuery());
      statusEl.textContent = "총 " + data.total + "건";
      renderList(data.items);

      const totalPages = Math.max(1, Math.ceil(data.total / data.take));
      document.getElementById("pageInfo").textContent = "페이지 " + data.page + " / " + totalPages;
    }catch(e){
      statusEl.textContent = "에러: " + e.message;
      console.error(e);
    }
  }

  function renderStats(s){
    const el = document.getElementById("stats");
    el.innerHTML = \`
      <div class="stat">Need: \${s.need}</div>
      <div class="stat">PASS: \${s.pass}</div>
      <div class="stat">FAIL: \${s.fail}</div>
      <div class="stat">ALL: \${s.all}</div>
    \`;
  }

  async function review(proofId, result){
    if(!ensureKeyOrShow()) return;
    if(!confirm(result + " 처리할까?")) return;
    try{
      await api("/proofs/" + proofId + "/review", {
        method: "POST",
        body: JSON.stringify({ result })
      });
      await reload(true);
    }catch(e){
      alert("실패: " + e.message);
    }
  }

  function renderList(items){
    const el = document.getElementById("list");
    el.innerHTML = items.map(it => {
      const line = (it.userId ? ("userId: " + it.userId) : "") + (it.menuName ? (" / " + it.menuName) : "");
      return \`
        <div class="card">
          <div><img src="\${it.imageUrl}" /></div>
          <div class="meta">
            <div class="row">
              <span class="pill \${pillClass(it.aiResult)}">\${it.aiResult}</span>
              <span class="pill">proofId: \${it.id}</span>
              <span class="pill">sessionId: \${it.sessionId}</span>
              <span class="pill">createdAt: \${it.createdAt}</span>
              \${it.reviewedAt ? '<span class="pill">reviewedAt: '+it.reviewedAt+'</span>' : ''}
            </div>
            <div class="row">
              <span class="pill">\${escapeHtml(line || "-")}</span>
              <span class="pill">code: \${escapeHtml(it.challengeCode || "-")}</span>
            </div>
            <div class="actions">
              <button class="pass" onclick="review('\${it.id}','PASS')">PASS</button>
              <button class="fail" onclick="review('\${it.id}','FAIL')">FAIL</button>
            </div>
            <pre>\${escapeHtml(JSON.stringify(it.aiMeta || {}, null, 2))}</pre>
          </div>
        </div>
      \`;
    }).join("");
  }

  function prevPage(){ if(state.page <= 1) return; state.page -= 1; reload(false); }
  function nextPage(){ state.page += 1; reload(false); }

  // boot
  if(getKey()){
    reload(true);
  }else{
    showKeyModal("관리자 키가 필요해. 입력해줘.");
  }
</script>
</body>
</html>
    `.trim();

    return html;
  }

  // 관리자 Points 페이지
  @Get('points')
  pointsPage() {
    const html = `
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Points Admin</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Apple SD Gothic Neo,sans-serif;margin:0;background:#f6f6f8;color:#111}
    header{position:sticky;top:0;background:#fff;border-bottom:1px solid #eee;padding:12px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .nav a{display:inline-block;padding:10px 12px;border-radius:10px;background:#111;color:#fff;font-weight:900;text-decoration:none}
    .nav a.secondary{background:#666}
    input,select{padding:10px 12px;border:1px solid #ddd;border-radius:10px}
    button{padding:10px 12px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:900;cursor:pointer}
    button.secondary{background:#666}
    main{padding:16px;max-width:1280px;margin:0 auto}
    .box{background:#fff;border:1px solid #eee;border-radius:16px;padding:12px}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .muted{color:#666;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid #eee;padding:10px;text-align:left;vertical-align:top}
    th{background:#fafafa}
    .pager{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}
    .pill{padding:6px 10px;border-radius:999px;background:#f1f1f1;font-weight:800}

    /* key modal */
    #keyModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center}
    #keyModal .box{width:min(520px,92vw);background:#fff;border-radius:16px;padding:16px;border:1px solid #eee}
    #keyModal .title{font-weight:900;font-size:18px}
    #keyModal .msg{margin:8px 0 12px;color:#666;font-weight:700}
    #keyModal input{width:100%}
    #keyModal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}
  </style>
</head>
<body>

  <!-- key modal -->
  <div id="keyModal">
    <div class="box">
      <div class="title">관리자 키 입력</div>
      <div class="msg" id="keyModalMsg"></div>
      <input id="keyModalInput" placeholder="ADMIN_REVIEW_KEY" />
      <div class="actions">
        <button onclick="saveKeyFromModal()">저장</button>
      </div>
    </div>
  </div>

<header>
  <div class="nav">
    <a class="secondary" href="/admin/review">Proof Review</a>
    <a href="/admin/points">Points</a>
  </div>

  <input id="key" placeholder="ADMIN_REVIEW_KEY" />
  <button onclick="saveKeyFromHeader()">키 저장</button>
  <span id="status" class="muted" style="margin-left:auto"></span>
</header>

<main>
  <div class="box">
    <div class="row">
      <strong>유저 검색</strong>
      <input id="userQ" placeholder="userId 검색" style="min-width:320px"/>
      <button onclick="searchUsers()">검색</button>
    </div>
    <div id="users" class="muted" style="margin-top:10px"></div>
  </div>

  <div style="height:12px"></div>

  <div class="box">
    <div class="row">
      <strong>포인트 조정</strong>
      <input id="userId" placeholder="userId" style="min-width:320px"/>
      <input id="delta" type="number" placeholder="+100 / -50" />
      <input id="note" placeholder="사유(메모)" style="min-width:260px"/>
      <button onclick="adjust()">적용</button>
    </div>
    <div class="muted" style="margin-top:10px">
      ※ delta는 + / - 모두 가능. 음수면 차감.
    </div>
  </div>

  <div style="height:12px"></div>

  <div class="box">
    <div class="row">
      <strong>포인트 내역</strong>
      <input id="ledgerUserId" placeholder="userId(선택)" style="min-width:320px"/>
      <label class="muted">From</label><input id="from" type="date"/>
      <label class="muted">To</label><input id="to" type="date"/>
      <label class="muted">페이지당</label>
      <select id="take">
        <option value="10">10</option>
        <option value="20" selected>20</option>
        <option value="50">50</option>
      </select>
      <button onclick="loadLedger(true)">조회</button>
    </div>

    <div style="height:10px"></div>

    <table>
      <thead>
        <tr>
          <th>시간</th>
          <th>userId</th>
          <th>points</th>
          <th>balanceAfter</th>
          <th>source</th>
          <th>note</th>
        </tr>
      </thead>
      <tbody id="ledger"></tbody>
    </table>

    <div class="pager">
      <button class="secondary" onclick="prevPage()">이전</button>
      <span class="muted" id="pageInfo"></span>
      <button class="secondary" onclick="nextPage()">다음</button>
    </div>
  </div>
</main>

<script>
  // ✅ GET param(예: ?k=...) 절대 사용하지 않음

  // ---------- key helpers ----------
  function getKey(){ return (localStorage.getItem("ADMIN_REVIEW_KEY") || "").trim(); }
  function setKey(k){ localStorage.setItem("ADMIN_REVIEW_KEY", (k||"").trim()); }
  function clearKey(){ localStorage.removeItem("ADMIN_REVIEW_KEY"); }

  function showKeyModal(msg){
    document.getElementById("keyModalMsg").textContent = msg || "";
    document.getElementById("keyModal").style.display = "flex";
    document.getElementById("keyModalInput").value = "";
    setTimeout(() => document.getElementById("keyModalInput").focus(), 30);
  }
  function hideKeyModal(){ document.getElementById("keyModal").style.display = "none"; }

  async function authCheck(k){
    const res = await fetch("/admin/auth-check", {
      method: "POST",
      headers: { "x-admin-key": k }
    });
    if(!res.ok) throw new Error("Invalid admin key");
    return res.json();
  }

  async function saveKeyFromModal(){
    const v = document.getElementById("keyModalInput").value.trim();
    if(!v) return alert("키를 입력해줘");
    try{
      await authCheck(v);
      setKey(v);
      document.getElementById("key").value = v;
      hideKeyModal();
      loadLedger(true);
    }catch(e){
      clearKey();
      alert("키가 올바르지 않아");
    }
  }

  async function saveKeyFromHeader(){
    const v = document.getElementById("key").value.trim();
    if(!v) return showKeyModal("관리자 키를 입력해줘.");
    try{
      await authCheck(v);
      setKey(v);
      loadLedger(true);
    }catch(e){
      clearKey();
      showKeyModal("키가 올바르지 않아. 다시 입력해줘.");
    }
  }

  function ensureKeyOrShow(){
    const k = getKey();
    if(!k){
      showKeyModal("관리자 키가 필요해. 입력해줘.");
      return false;
    }
    return true;
  }

  // ---------- api wrapper ----------
  async function api(path, opts={}){
    const k = getKey();
    const res = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": k,
        ...(opts.headers || {})
      }
    });

    if(res.status === 401){
      clearKey();
      showKeyModal("관리자 키가 필요해. 다시 입력해줘.");
      throw new Error("401 Unauthorized");
    }
    if(!res.ok){
      const t = await res.text();
      throw new Error(res.status + " " + t);
    }
    return res.json();
  }

  // ---------- page state ----------
  const keyInput = document.getElementById("key");
  keyInput.value = getKey();

  let page = 1;
  let lastTotal = 0;

  function escapeHtml(s){
    return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  async function searchUsers(){
    if(!ensureKeyOrShow()) return;

    const q = document.getElementById("userQ").value.trim();
    const status = document.getElementById("status");
    status.textContent = "유저 검색중...";
    try{
      const data = await api("/admin/users?q=" + encodeURIComponent(q));
      status.textContent = "유저 " + data.items.length + "명";

      const el = document.getElementById("users");
      el.innerHTML = data.items.map(u => {
        return '<div style="margin:6px 0">' +
          '<span class="pill">id: ' + escapeHtml(u.id) + '</span> ' +
          '<span class="pill">balance: ' + escapeHtml(u.pointBalance) + '</span> ' +
          '<button style="margin-left:6px" onclick="fillUser(\\''+u.id+'\\')">선택</button>' +
        '</div>';
      }).join("");
    }catch(e){
      status.textContent = "에러: " + e.message;
    }
  }

  function fillUser(id){
    document.getElementById("userId").value = id;
    document.getElementById("ledgerUserId").value = id;
    page = 1;
    loadLedger(true);
  }

  async function adjust(){
    if(!ensureKeyOrShow()) return;

    const userId = document.getElementById("userId").value.trim();
    const delta = Number(document.getElementById("delta").value);
    const note = document.getElementById("note").value.trim();
    if(!userId) return alert("userId 필요");
    if(!Number.isFinite(delta) || delta === 0) return alert("delta는 0이 아니어야 함");

    const status = document.getElementById("status");
    status.textContent = "적용중...";

    try{
      const data = await api("/admin/points/adjust", {
        method: "POST",
        body: JSON.stringify({ userId, delta, note })
      });
      status.textContent = "완료: balance=" + data.balanceAfter;
      page = 1;
      loadLedger(true);
      alert("완료: balanceAfter=" + data.balanceAfter);
    }catch(e){
      status.textContent = "에러: " + e.message;
      alert("실패: " + e.message);
    }
  }

  function buildLedgerQuery(){
    const userId = document.getElementById("ledgerUserId").value.trim();
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;
    const take = document.getElementById("take").value;

    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("take", String(take));
    if(userId) p.set("userId", userId);
    if(from) p.set("from", from);
    if(to) p.set("to", to);
    return p.toString();
  }

  async function loadLedger(withReset){
    if(!ensureKeyOrShow()) return;

    if(withReset) page = 1;
    const status = document.getElementById("status");
    status.textContent = "내역 로딩중...";
    try{
      const data = await api("/admin/points/ledger?" + buildLedgerQuery());
      lastTotal = data.total;
      status.textContent = "총 " + data.total + "건";

      const tbody = document.getElementById("ledger");
      tbody.innerHTML = data.items.map(x => {
        return '<tr>' +
          '<td>' + escapeHtml(x.createdAt) + '</td>' +
          '<td>' + escapeHtml(x.userId) + '</td>' +
          '<td>' + escapeHtml(x.points) + '</td>' +
          '<td>' + escapeHtml(x.balanceAfter) + '</td>' +
          '<td>' + escapeHtml(x.source || "-") + '</td>' +
          '<td>' + escapeHtml(x.note || "-") + '</td>' +
        '</tr>';
      }).join("");

      const totalPages = Math.max(1, Math.ceil(data.total / data.take));
      document.getElementById("pageInfo").textContent = "페이지 " + data.page + " / " + totalPages;
    }catch(e){
      status.textContent = "에러: " + e.message;
    }
  }

  function prevPage(){ if(page <= 1) return; page -= 1; loadLedger(false); }
  function nextPage(){
    const take = Number(document.getElementById("take").value);
    const totalPages = Math.max(1, Math.ceil(lastTotal / take));
    if(page >= totalPages) return;
    page += 1;
    loadLedger(false);
  }

  // boot
  if(getKey()){
    loadLedger(true);
  }else{
    showKeyModal("관리자 키가 필요해. 입력해줘.");
  }
</script>
</body>
</html>
    `.trim();

    return html;
  }

  // -------------------- PROOF APIs --------------------

  // 통계 (탭 상단 표시)
  @Get('proof-stats')
  async proofStats(
    @Headers('x-admin-key') adminKey?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertAdminKey(adminKey);

    const createdAt = parseKstRange(from, to);

    // 검색 조건(q): proof.id/sessionId/userId/menuName
    const search = (q ?? '').trim();
    const whereBase: any = {};
    if (createdAt) whereBase.createdAt = createdAt;

    if (search) {
      whereBase.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { sessionId: { contains: search, mode: 'insensitive' } },
        { session: { userId: { contains: search, mode: 'insensitive' } } },
        {
          session: {
            menu: { name: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [need, pass, fail, all] = await Promise.all([
      this.prisma.proof.count({
        where: { ...whereBase, aiResult: { in: ['HOLD', 'PENDING'] as any } },
      }),
      this.prisma.proof.count({
        where: { ...whereBase, aiResult: 'PASS' as any },
      }),
      this.prisma.proof.count({
        where: { ...whereBase, aiResult: 'FAIL' as any },
      }),
      this.prisma.proof.count({ where: whereBase }),
    ]);

    return { ok: true, need, pass, fail, all };
  }

  // 목록 (탭/페이징/필터/검색)
  @Get('proofs')
  async proofs(
    @Headers('x-admin-key') adminKey?: string,
    @Query('bucket') bucket?: string, // need|pass|fail|all
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('take') take?: string,
    @Query('order') order?: string, // asc|desc
  ) {
    assertAdminKey(adminKey);

    const p = clamp(toInt(page, 1), 1, 1000000);
    const t = clamp(toInt(take, 20), 1, 100);
    const skip = (p - 1) * t;

    const createdAt = parseKstRange(from, to);
    const search = (q ?? '').trim();

    const where: any = {};
    if (createdAt) where.createdAt = createdAt;

    // bucket
    const b = (bucket ?? 'need').toLowerCase();
    if (b === 'need') where.aiResult = { in: ['HOLD', 'PENDING'] as any };
    else if (b === 'pass') where.aiResult = 'PASS' as any;
    else if (b === 'fail') where.aiResult = 'FAIL' as any;
    // all => no aiResult filter

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { sessionId: { contains: search, mode: 'insensitive' } },
        { session: { userId: { contains: search, mode: 'insensitive' } } },
        {
          session: {
            menu: { name: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    const sort: any = order === 'desc' ? 'desc' : 'asc';

    const [total, items] = await Promise.all([
      this.prisma.proof.count({ where }),
      this.prisma.proof.findMany({
        where,
        orderBy: { createdAt: sort },
        skip,
        take: t,
        include: {
          session: {
            select: {
              userId: true,
              challengeCode: true,
              menu: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      ok: true,
      page: p,
      take: t,
      total,
      items: items.map((x: any) => ({
        id: x.id,
        sessionId: x.sessionId,
        aiResult: x.aiResult,
        createdAt: x.createdAt,
        reviewedAt: x.reviewedAt,
        imageUrl: x.imageUrl,
        aiMeta: x.aiMeta,
        userId: x.session?.userId ?? null,
        menuName: x.session?.menu?.name ?? null,
        challengeCode: x.session?.challengeCode ?? null,
      })),
    };
  }

  // 기존 호환: /admin/review-queue -> need bucket으로 매핑
  @Get('review-queue')
  async reviewQueue(
    @Headers('x-admin-key') adminKey?: string,
    @Query('take') take?: string,
  ) {
    assertAdminKey(adminKey);
    const t = clamp(toInt(take, 30), 1, 100);

    const proofs = await this.prisma.proof.findMany({
      where: { aiResult: { in: ['HOLD', 'PENDING'] as any } },
      orderBy: { createdAt: 'asc' },
      take: t,
      include: {
        session: {
          select: {
            userId: true,
            challengeCode: true,
            menu: { select: { name: true } },
          },
        },
      },
    });

    return {
      ok: true,
      items: proofs.map((p: any) => ({
        id: p.id,
        sessionId: p.sessionId,
        aiResult: p.aiResult,
        createdAt: p.createdAt,
        reviewedAt: p.reviewedAt,
        imageUrl: p.imageUrl,
        menuName: p.session?.menu?.name ?? null,
        challengeCode: p.session?.challengeCode ?? null,
        userId: p.session?.userId ?? null,
        aiMeta: p.aiMeta,
      })),
    };
  }

  // -------------------- USERS / POINTS APIs --------------------

  @Get('users')
  async users(
    @Headers('x-admin-key') adminKey?: string,
    @Query('q') q?: string,
  ) {
    assertAdminKey(adminKey);

    const search = (q ?? '').trim();
    if (!search) return { ok: true, items: [] };

    // ✅ User 모델에 존재하는 필드만 사용 (현재 확인된 것: id, pointBalance)
    const where: any = {
      OR: [{ id: { contains: search, mode: 'insensitive' } }],
    };

    const items = await this.prisma.user.findMany({
      where,
      take: 20,
      select: {
        id: true,
        pointBalance: true,
      },
    });

    return { ok: true, items };
  }

  @Post('points/adjust')
  async adjustPoints(
    @Headers('x-admin-key') adminKey?: string,
    @Body() body?: { userId: string; delta: number; note?: string },
  ) {
    assertAdminKey(adminKey);

    const userId = (body?.userId ?? '').trim();
    const delta = Number(body?.delta);
    const note = (body?.note ?? '').trim();

    if (!userId) throw new BadRequestException('userId required');
    if (!Number.isFinite(delta) || delta === 0)
      throw new BadRequestException('delta must be non-zero');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, pointBalance: true },
      });
      if (!user) throw new BadRequestException('user not found');

      const next = (user.pointBalance ?? 0) + delta;
      if (next < 0)
        throw new BadRequestException('resulting balance would be negative');

      const updated = await tx.user.update({
        where: { id: userId },
        data: { pointBalance: next },
        select: { pointBalance: true },
      });

      // PointLedger 모델/필드명이 다르면 여기만 맞춰주면 됨
      await tx.pointLedger.create({
        data: {
          userId,
          kind: delta > 0 ? ('EARN' as any) : ('SPEND' as any),
          source: 'ADMIN' as any,
          sourceId: null,
          points: delta,
          balanceAfter: updated.pointBalance,
          note: note || `admin adjust ${delta}`,
          dedupeKey: `ADMIN_ADJUST:${userId}:${Date.now()}`,
        },
      });

      return { ok: true, balanceAfter: updated.pointBalance };
    });
  }

  @Get('points/ledger')
  async pointsLedger(
    @Headers('x-admin-key') adminKey?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('take') take?: string,
  ) {
    assertAdminKey(adminKey);

    const p = clamp(toInt(page, 1), 1, 1000000);
    const t = clamp(toInt(take, 20), 1, 100);
    const skip = (p - 1) * t;

    const createdAt = parseKstRange(from, to);

    const where: any = {};
    if (createdAt) where.createdAt = createdAt;
    if (userId) where.userId = userId;

    const [total, items] = await Promise.all([
      this.prisma.pointLedger.count({ where }),
      this.prisma.pointLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: t,
        select: {
          createdAt: true,
          userId: true,
          points: true,
          balanceAfter: true,
          source: true as any,
          note: true,
        },
      }),
    ]);

    return {
      ok: true,
      page: p,
      take: t,
      total,
      items,
    };
  }
}
