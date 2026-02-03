import { Controller, Get, Headers, Query, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function assertAdminKey(headerKey?: string, queryKey?: string) {
  const key = process.env.ADMIN_REVIEW_KEY ?? "dev-admin";
  const provided = headerKey || queryKey;
  if (!provided || provided !== key) throw new UnauthorizedException("Invalid admin key");
}

@Controller("admin")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ 간단 관리자 화면 (k=ADMIN_REVIEW_KEY 로 보호)
  @Get("review")
  reviewPage(@Query("k") k?: string, @Headers("x-admin-key") h?: string) {
    assertAdminKey(h, k);

    // key는 URL에 실을 수도 있으니, 페이지 내부에서는 localStorage에 저장해서 fetch 헤더로 보냄
    // (k= 로 접근해도 되고, 페이지에서 입력해도 됨)
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
    header{position:sticky;top:0;background:#fff;border-bottom:1px solid #eee;padding:14px 16px;display:flex;gap:10px;align-items:center}
    input{padding:10px 12px;border:1px solid #ddd;border-radius:10px;min-width:280px}
    button{padding:10px 12px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:800;cursor:pointer}
    button.secondary{background:#666}
    main{padding:16px;max-width:1200px;margin:0 auto}
    .grid{display:grid;grid-template-columns:1fr;gap:12px}
    .card{background:#fff;border:1px solid #eee;border-radius:16px;padding:12px;display:grid;grid-template-columns:340px 1fr;gap:14px}
    img{width:340px;height:340px;object-fit:cover;border-radius:14px;background:#f2f2f2}
    .meta{display:flex;flex-direction:column;gap:8px}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .pill{padding:6px 10px;border-radius:999px;background:#f1f1f1;font-weight:700}
    .pill.hold{background:#fff4d6}
    .pill.pending{background:#e8f0ff}
    .pill.pass{background:#e7ffe8}
    .pill.fail{background:#ffe7e7}
    .actions{display:flex;gap:10px;margin-top:6px}
    .actions button{min-width:110px}
    .actions button.pass{background:#0a7a2f}
    .actions button.fail{background:#c62828}
    pre{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:10px;margin:0}
  </style>
</head>
<body>
  <header>
    <strong>Proof Review</strong>
    <input id="key" placeholder="ADMIN_REVIEW_KEY" />
    <button onclick="saveKey()">키 저장</button>
    <button class="secondary" onclick="loadQueue()">새로고침</button>
    <span id="status" style="margin-left:auto;color:#666;font-weight:700"></span>
  </header>

  <main>
    <div class="grid" id="list"></div>
  </main>

<script>
  const qs = new URLSearchParams(location.search);
  const urlKey = qs.get("k");
  if (urlKey) localStorage.setItem("ADMIN_REVIEW_KEY", urlKey);

  const keyInput = document.getElementById("key");
  keyInput.value = localStorage.getItem("ADMIN_REVIEW_KEY") || "";

  function saveKey(){
    localStorage.setItem("ADMIN_REVIEW_KEY", keyInput.value.trim());
    loadQueue();
  }

  function pillClass(s){
    if (s==="HOLD") return "hold";
    if (s==="PENDING") return "pending";
    if (s==="PASS") return "pass";
    if (s==="FAIL") return "fail";
    return "";
  }

  async function api(path, opts={}){
    const k = localStorage.getItem("ADMIN_REVIEW_KEY") || "";
    const res = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": k,
        ...(opts.headers||{})
      }
    });
    if(!res.ok){
      const t = await res.text();
      throw new Error(res.status + " " + t);
    }
    return res.json();
  }

  function escapeHtml(s){
    return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  async function loadQueue(){
    const statusEl = document.getElementById("status");
    statusEl.textContent = "불러오는 중...";
    try{
      const data = await api("/admin/review-queue?take=30");
      statusEl.textContent = "총 " + data.items.length + "건";
      render(data.items);
    }catch(e){
      statusEl.textContent = "에러: " + e.message;
      console.error(e);
    }
  }

  async function review(proofId, result){
    if(!confirm(result + " 처리할까?")) return;
    try{
      await api("/proofs/" + proofId + "/review", {
        method: "POST",
        body: JSON.stringify({ result })
      });
      await loadQueue();
    }catch(e){
      alert("실패: " + e.message);
    }
  }

  function render(items){
    const el = document.getElementById("list");
    el.innerHTML = items.map(it => {
      const meta = it.aiMeta || {};
      const err = meta.openaiError ? ("\\nopenaiError: " + meta.openaiError) : "";
      return \`
        <div class="card">
          <div>
            <img src="\${it.imageUrl}" />
          </div>
          <div class="meta">
            <div class="row">
              <span class="pill \${pillClass(it.aiResult)}">\${it.aiResult}</span>
              <span class="pill">proofId: \${it.id}</span>
              <span class="pill">sessionId: \${it.sessionId}</span>
              <span class="pill">createdAt: \${it.createdAt}</span>
            </div>
            <div class="row">
              <span class="pill">menu: \${escapeHtml(it.menuName || "-")}</span>
              <span class="pill">challengeCode: \${escapeHtml(it.challengeCode || "-")}</span>
            </div>
            <div class="actions">
              <button class="pass" onclick="review('\${it.id}','PASS')">PASS</button>
              <button class="fail" onclick="review('\${it.id}','FAIL')">FAIL</button>
            </div>
            <pre>\${escapeHtml(JSON.stringify(meta, null, 2))}</pre>
          </div>
        </div>
      \`;
    }).join("");
  }

  loadQueue();
</script>
</body>
</html>
    `.trim();

    return html;
  }

  // ✅ 검토 큐: HOLD/PENDING만 가져오기 (헤더 x-admin-key 필요)
  @Get("review-queue")
  async reviewQueue(
    @Headers("x-admin-key") adminKey?: string,
    @Query("take") take?: string
  ) {
    assertAdminKey(adminKey, undefined);

    const n = Math.max(1, Math.min(100, Number(take ?? 30)));

    const proofs = await this.prisma.proof.findMany({
      where: { aiResult: { in: ["HOLD", "PENDING"] as any } },
      orderBy: { createdAt: "asc" },
      take: n,
      include: {
        session: {
          include: {
            menu: { select: { name: true } },
          },
        },
      },
    });

    return {
      ok: true,
      items: proofs.map((p) => ({
        id: p.id,
        sessionId: p.sessionId,
        aiResult: p.aiResult,
        createdAt: p.createdAt,
        imageUrl: p.imageUrl, // proof 이미지 (워터마크 포함)
        menuName: (p as any).session?.menu?.name ?? null,
        challengeCode: (p as any).session?.challengeCode ?? null,
        aiMeta: p.aiMeta,
      })),
    };
  }
}
