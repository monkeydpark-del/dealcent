// ============================================================
//  딜센트 서버 (Cloudflare Worker)
//  - GET  /api/deals            공개용 딜 목록
//  - GET  /img/:id              상품 사진
//  - /api/admin/...             관리자용 (비밀번호 필요)
//  그 밖의 주소는 public 폴더의 파일(사이트 화면)을 그대로 보여줍니다.
// ============================================================

const STORES = ["coupang", "musinsa", "naver", "toss"];
const MAX_IMAGE_CHARS = 900000; // 사진(base64) 최대 길이, 약 650KB

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 데이터베이스 준비 (처음 한 번 표를 자동으로 만들어요) ----------
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS deals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        price INTEGER,
        original INTEGER,
        badge TEXT,
        note TEXT,
        emoji TEXT,
        image_id TEXT,
        expires TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        data TEXT NOT NULL
      )`
    ),
  ]);
  schemaReady = true;
}

// ---------- 관리자 확인 ----------
async function requireAdmin(request, env) {
  const pw = env.ADMIN_PASSWORD;
  if (!pw) {
    throw new HttpError(500, "관리자 비밀번호(ADMIN_PASSWORD)가 아직 설정되지 않았어요.");
  }
  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(pw)),
  ]);
  if (!crypto.subtle.timingSafeEqual(a, b)) {
    await sleep(500); // 비밀번호 무작위 대입을 느리게 만들어요
    throw new HttpError(401, "비밀번호가 맞지 않아요.");
  }
}

// ---------- 입력값 정리 ----------
function toInt(v, label) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1000000000) {
    throw new HttpError(400, `${label}은(는) 숫자로 입력해 주세요.`);
  }
  return n;
}

function textOrNull(v, max, label) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw new HttpError(400, `${label}이(가) 너무 길어요. (${max}자 이하)`);
  return s;
}

function cleanExpires(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) {
    throw new HttpError(400, "마감 시각 형식이 올바르지 않아요.");
  }
  return s;
}

function cleanDeal(body) {
  const store = String(body.store || "");
  if (!STORES.includes(store)) throw new HttpError(400, "판매처를 골라주세요.");

  const title = String(body.title || "").trim();
  if (!title) throw new HttpError(400, "제목을 입력해 주세요.");
  if (title.length > 200) throw new HttpError(400, "제목이 너무 길어요. (200자 이하)");

  const url = String(body.url || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) {
    throw new HttpError(400, "링크는 http:// 또는 https:// 로 시작해야 해요.");
  }

  return {
    store,
    title,
    url,
    price: toInt(body.price, "현재가"),
    original: toInt(body.original, "원래 가격"),
    badge: textOrNull(body.badge, 12, "스티커 글자"),
    note: textOrNull(body.note, 100, "메모"),
    emoji: textOrNull(body.emoji, 8, "이모지"),
    expires: cleanExpires(body.expires),
  };
}

async function readJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 1200000) throw new HttpError(413, "사진이 너무 커요.");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "요청 형식이 올바르지 않아요.");
  }
}

// ---------- 사진 ----------
async function saveImage(db, dataUrl) {
  const s = String(dataUrl);
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m || s.length > MAX_IMAGE_CHARS) {
    throw new HttpError(400, "사진 형식이 올바르지 않거나 너무 커요.");
  }
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO images (id, mime, data) VALUES (?, ?, ?)").bind(id, m[1], m[2]).run();
  return id;
}

async function serveImage(db, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new HttpError(404, "찾을 수 없어요.");
  const row = await db.prepare("SELECT mime, data FROM images WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "찾을 수 없어요.");
  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function nowKst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

// ---------- 요청 처리 ----------
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // API가 아닌 주소는 사이트 화면(public 폴더)으로
  if (!path.startsWith("/api/") && !path.startsWith("/img/")) {
    return env.ASSETS.fetch(request);
  }

  if (!env.DB) throw new HttpError(500, "데이터베이스(D1)가 연결되어 있지 않아요.");
  const db = env.DB;
  await ensureSchema(db);

  // 공개: 딜 목록
  if (method === "GET" && path === "/api/deals") {
    const { results } = await db
      .prepare(
        `SELECT id, store, title, url, price, original, badge, note, emoji, image_id, expires, created_at
         FROM deals ORDER BY id DESC LIMIT 300`
      )
      .all();
    const deals = results.map((r) => ({
      id: r.id,
      store: r.store,
      title: r.title,
      url: r.url,
      price: r.price,
      original: r.original,
      badge: r.badge,
      note: r.note,
      emoji: r.emoji,
      image: r.image_id ? `/img/${r.image_id}` : null,
      expires: r.expires,
      created_at: r.created_at,
    }));
    return json({ deals }, 200, { "Cache-Control": "public, max-age=15" });
  }

  // 공개: 사진
  if (method === "GET" && path.startsWith("/img/")) {
    return serveImage(db, path.slice(5));
  }

  // 관리자
  if (path.startsWith("/api/admin/")) {
    await requireAdmin(request, env);

    if (method === "POST" && path === "/api/admin/login") {
      return json({ ok: true });
    }

    if (method === "POST" && path === "/api/admin/deals") {
      const body = await readJson(request);
      const d = cleanDeal(body);
      const imageId = body.image_data ? await saveImage(db, body.image_data) : null;
      const res = await db
        .prepare(
          `INSERT INTO deals (store, title, url, price, original, badge, note, emoji, image_id, expires)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(d.store, d.title, d.url, d.price, d.original, d.badge, d.note, d.emoji, imageId, d.expires)
        .run();
      return json({ ok: true, id: res.meta.last_row_id });
    }

    const m = path.match(/^\/api\/admin\/deals\/(\d+)$/);
    if (m && method === "PUT") {
      const id = Number(m[1]);
      const old = await db.prepare("SELECT image_id FROM deals WHERE id = ?").bind(id).first();
      if (!old) throw new HttpError(404, "딜을 찾을 수 없어요.");
      const body = await readJson(request);
      const d = cleanDeal(body);

      let imageId = old.image_id;
      if (body.image_data) imageId = await saveImage(db, body.image_data);
      else if (body.remove_image) imageId = null;

      await db
        .prepare(
          `UPDATE deals SET store=?, title=?, url=?, price=?, original=?, badge=?, note=?, emoji=?, image_id=?, expires=?
           WHERE id=?`
        )
        .bind(d.store, d.title, d.url, d.price, d.original, d.badge, d.note, d.emoji, imageId, d.expires, id)
        .run();
      if (old.image_id && old.image_id !== imageId) {
        await db.prepare("DELETE FROM images WHERE id = ?").bind(old.image_id).run();
      }
      return json({ ok: true });
    }

    if (m && method === "DELETE") {
      const id = Number(m[1]);
      const old = await db.prepare("SELECT image_id FROM deals WHERE id = ?").bind(id).first();
      if (!old) throw new HttpError(404, "딜을 찾을 수 없어요.");
      const stmts = [db.prepare("DELETE FROM deals WHERE id = ?").bind(id)];
      if (old.image_id) stmts.push(db.prepare("DELETE FROM images WHERE id = ?").bind(old.image_id));
      await db.batch(stmts);
      return json({ ok: true });
    }

    // 마감된 딜 한 번에 정리
    if (method === "DELETE" && path === "/api/admin/ended") {
      const now = nowKst();
      const cnt = await db
        .prepare("SELECT COUNT(*) AS c FROM deals WHERE expires IS NOT NULL AND expires < ?")
        .bind(now)
        .first();
      await db.batch([
        db
          .prepare(
            "DELETE FROM images WHERE id IN (SELECT image_id FROM deals WHERE expires IS NOT NULL AND expires < ? AND image_id IS NOT NULL)"
          )
          .bind(now),
        db.prepare("DELETE FROM deals WHERE expires IS NOT NULL AND expires < ?").bind(now),
      ]);
      return json({ ok: true, deleted: cnt ? cnt.c : 0 });
    }
  }

  throw new HttpError(404, "찾을 수 없어요.");
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "서버에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요." }, 500);
    }
  },
};
