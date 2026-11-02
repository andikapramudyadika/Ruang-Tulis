// lib/content.mjs
var CATEGORIES = ["Weekly Note", "Monthly Essay", "Personal"];
function postSlug(post) {
  return post.slug || post.file.split("/").pop().replace(/\.md$/i, "");
}
function validPostPath(value) {
  return typeof value === "string" && /^posts\/[a-z0-9][a-z0-9-]*(?:\.md)?$/.test(value);
}
function validatePost(input) {
  const title = String(input.title || "").trim();
  const slug = String(input.slug || "");
  const date = String(input.date || "");
  if (!title || title.length > 180) throw new Error("Judul wajib diisi, maksimal 180 karakter.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 90) throw new Error("Alamat tulisan tidak valid.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Tanggal tulisan tidak valid.");
  if (!CATEGORIES.includes(input.category)) throw new Error("Kategori tulisan tidak valid.");
  const markdown = String(input.markdown || "").trim();
  if (!markdown || markdown.length > 3e5) throw new Error("Isi tulisan wajib diisi, maksimal 300.000 karakter.");
  const excerpt = String(input.excerpt || "").trim();
  if (excerpt.length > 400) throw new Error("Ringkasan maksimal 400 karakter.");
  if (input.file && !validPostPath(input.file)) throw new Error("Lokasi tulisan tidak valid.");
  return { title, slug, date, category: input.category, excerpt, markdown, file: input.file || `posts/${slug}.md` };
}

// publisher/worker.mjs
var SESSION_TTL = 8 * 60 * 60;
var MAX_BODY = 12 * 1024 * 1024;
var enc = new TextEncoder();
var dec = new TextDecoder();
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var fail = (status, message) => {
  throw new HttpError(status, message);
};
var random = () => base64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
function base64(bytes) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
function unbase64(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
}
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function key(secret) {
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), enc.encode(JSON.stringify(value)));
  return `${base64(iv)}.${base64(new Uint8Array(cipher))}`;
}
async function unseal(value, secret) {
  const [iv, cipher] = String(value).split(".");
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(iv) }, await key(secret), unbase64(cipher))));
}
var configured = (env) => !!(env.SESSIONS && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_SECRET?.length >= 32 && env.SITE_URL && env.GITHUB_REPOSITORY && env.ALLOWED_GITHUB_ID);
function cors(request, env) {
  const origin = request.headers.get("Origin");
  return origin === new URL(env.SITE_URL).origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600", "Vary": "Origin" } : {};
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...headers } });
}
function originCheck(request, env) {
  if (request.headers.get("Origin") !== new URL(env.SITE_URL).origin) fail(403, "Permintaan bukan berasal dari Ruang Tulis.");
}
async function boundedJSON(request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail(415, "Format permintaan harus JSON.");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY) fail(413, "Tulisan dan gambar terlalu besar.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Isi permintaan kosong.");
  let size = 0, chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      fail(413, "Tulisan dan gambar terlalu besar.");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(dec.decode(data));
  } catch {
    fail(400, "Data tulisan tidak dapat dibaca.");
  }
}
function validateImages(images) {
  if (!Array.isArray(images) || images.length > 12) fail(400, "Maksimal 12 gambar baru per penerbitan.");
  let total = 0;
  const ids = /* @__PURE__ */ new Set();
  return images.map((image) => {
    if (!/^img-[a-z0-9-]{8,64}$/.test(image.id) || ids.has(image.id)) fail(400, "Identitas gambar tidak valid.");
    ids.add(image.id);
    if (typeof image.data !== "string" || image.data.length > 28e5 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.data)) fail(400, "Gunakan gambar PNG, JPEG, atau WebP.");
    const [, mime, content] = image.data.match(/^data:(image\/[^;]+);base64,(.+)$/);
    let bytes;
    try {
      bytes = unbase64(content);
    } catch {
      fail(400, "Gambar rusak.");
    }
    total += bytes.length;
    if (bytes.length > 2 * 1024 * 1024 || total > 8 * 1024 * 1024) fail(413, "Gambar terlalu besar. Gunakan gambar yang lebih kecil.");
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = dec.decode(bytes.slice(0, 4)) === "RIFF" && dec.decode(bytes.slice(8, 12)) === "WEBP";
    if (!(mime === "image/png" && png || mime === "image/jpeg" && jpeg || mime === "image/webp" && webp)) fail(400, "Isi file tidak sesuai format gambar.");
    return { id: image.id, content, ext: mime === "image/jpeg" ? "jpg" : mime.split("/")[1] };
  });
}
function createPublisher(fetcher = fetch) {
  async function github(env, token, path, options = {}) {
    const response = await fetcher(`https://api.github.com${path}`, { ...options, headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "Ruang-Tulis-Publisher", "Content-Type": "application/json", ...options.headers } });
    if (!response.ok) {
      if (response.status === 404 && options.optional) return null;
      if (response.status === 409 || response.status === 422) fail(409, "Repository berubah saat menyimpan. Silakan coba lagi.");
      if (response.status === 401) fail(401, "Sesi GitHub berakhir. Silakan masuk kembali.");
      if (response.status === 403) fail(403, "GitHub menolak penyimpanan. Periksa izin aplikasi atau batas penggunaan.");
      fail(502, "GitHub belum dapat dihubungi. Coba lagi sebentar.");
    }
    return response.status === 204 ? null : response.json();
  }
  async function session(request, env) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, "Masuk dengan GitHub untuk menerbitkan.");
    const id = await digest(token);
    const stored = await env.SESSIONS.get(`session:${id}`);
    if (!stored) fail(401, "Sesi berakhir. Silakan masuk kembali.");
    let data;
    try {
      data = await unseal(stored, env.SESSION_SECRET);
    } catch {
      fail(401, "Sesi tidak dapat diverifikasi. Silakan masuk kembali.");
    }
    if (data.expires < Date.now() || String(data.id) !== String(env.ALLOWED_GITHUB_ID)) fail(401, "Sesi berakhir. Silakan masuk kembali.");
    return { ...data, sessionId: id };
  }
  const repoPath = (env) => `/repos/${env.GITHUB_REPOSITORY}`;
  async function snapshot(env, token) {
    const root = repoPath(env);
    const ref = await github(env, token, `${root}/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH || "main")}`);
    const head = ref.object.sha;
    const commit = await github(env, token, `${root}/git/commits/${head}`);
    const manifest = await github(env, token, `${root}/contents/posts.json?ref=${head}`);
    let posts;
    try {
      posts = JSON.parse(dec.decode(unbase64(manifest.content.replace(/\s/g, ""))));
    } catch {
      fail(502, "Daftar tulisan di repository tidak dapat dibaca.");
    }
    if (!Array.isArray(posts)) fail(502, "Daftar tulisan tidak valid.");
    return { head, tree: commit.tree.sha, posts };
  }
  async function publish(request, env, user) {
    const input = await boundedJSON(request);
    if (!/^[a-f0-9-]{36}$/.test(input.publicationId || "")) fail(400, "Identitas penerbitan tidak valid.");
    let post;
    try {
      post = validatePost(input);
    } catch (e) {
      fail(400, e.message);
    }
    const images = validateImages(input.images || []);
    const requestHash = await digest(JSON.stringify(input));
    const cacheKey = `published:${user.sessionId}:${input.publicationId}`;
    const cached = await env.SESSIONS.get(cacheKey, "json");
    if (cached) {
      if (cached.hash !== requestHash) fail(409, "Isi tulisan berubah. Mulai penerbitan baru.");
      return json(cached.result);
    }
    let markdown = post.markdown;
    const imageMap = {};
    const imageBlobs = [];
    for (const image of images) {
      const file = `images/${post.slug}-${(await digest(image.content)).slice(0, 16)}.${image.ext}`;
      imageMap[image.id] = `../${file}`;
      const marker = `ruang-image:${image.id}`;
      if (!markdown.includes(marker)) fail(400, "Ada gambar yang tidak digunakan dalam tulisan.");
      markdown = markdown.replaceAll(marker, `../${file}`);
      imageBlobs.push({ file, content: image.content });
    }
    if (/ruang-image:|data:image\//i.test(markdown)) fail(400, "Ada gambar yang belum siap disimpan.");
    const root = repoPath(env);
    let blobs = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await snapshot(env, user.token);
      const prior = state.posts.find((p) => p.publicationId === input.publicationId);
      if (prior) {
        if (prior.publicationHash !== requestHash) fail(409, "Identitas penerbitan sudah dipakai untuk isi berbeda.");
        const saved = await github(env, user.token, `${root}/contents/${prior.file}?ref=${state.head}`);
        return json({ post: prior, commit: state.head, fileSha: saved.sha, imageMap, url: `${env.SITE_URL}#artikel/${prior.slug}` });
      }
      const existing = state.posts.find((p) => p.file === post.file);
      if (input.file) {
        if (!existing) fail(409, "Tulisan ini sudah tidak tersedia di repository.");
        if (postSlug(existing) !== post.slug) fail(400, "Alamat tulisan yang sudah terbit tidak dapat diubah.");
        const current = await github(env, user.token, `${root}/contents/${post.file}?ref=${state.head}`);
        if (!input.originalSha || current.sha !== input.originalSha) fail(409, "Tulisan ini telah disunting dari perangkat lain. Buka versi terbaru sebelum menerbitkan kembali.");
      } else if (state.posts.some((p) => p.file === post.file || postSlug(p) === post.slug)) fail(409, "Alamat tulisan sudah digunakan. Ubah alamat pada Detail tulisan.");
      if (!input.file) {
        const occupied = await github(env, user.token, `${root}/contents/${post.file}?ref=${state.head}`, { optional: true });
        if (occupied) fail(409, "File dengan alamat ini sudah ada. Pilih alamat lain.");
      }
      if (!blobs) {
        blobs = [];
        for (const image of imageBlobs) {
          const blob = await github(env, user.token, `${root}/git/blobs`, { method: "POST", body: JSON.stringify({ content: image.content, encoding: "base64" }) });
          blobs.push({ path: image.file, mode: "100644", type: "blob", sha: blob.sha });
        }
      }
      const record = { ...existing || {}, title: post.title, date: post.date, category: post.category, excerpt: post.excerpt, slug: post.slug, file: post.file, publicationId: input.publicationId, publicationHash: requestHash };
      const manifest = existing ? state.posts.map((p) => p.file === post.file ? record : p) : [...state.posts, record];
      const textBlob = await github(env, user.token, `${root}/git/blobs`, { method: "POST", body: JSON.stringify({ content: markdown + "\n", encoding: "utf-8" }) });
      const tree = await github(env, user.token, `${root}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: state.tree, tree: [...blobs, { path: post.file, mode: "100644", type: "blob", sha: textBlob.sha }, { path: "posts.json", mode: "100644", type: "blob", content: JSON.stringify(manifest, null, 2) + "\n" }] }) });
      const commit = await github(env, user.token, `${root}/git/commits`, { method: "POST", body: JSON.stringify({ message: `${existing ? "Perbarui" : "Terbitkan"}: ${post.title}`, tree: tree.sha, parents: [state.head] }) });
      try {
        await github(env, user.token, `${root}/git/refs/heads/${encodeURIComponent(env.GITHUB_BRANCH || "main")}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
      } catch (e) {
        if (e.status === 409 && attempt < 2) continue;
        throw e;
      }
      const result = { post: record, commit: commit.sha, fileSha: textBlob.sha, imageMap, url: `${env.SITE_URL}#artikel/${post.slug}` };
      try {
        await env.SESSIONS.put(cacheKey, JSON.stringify({ hash: requestHash, result }), { expirationTtl: 86400 });
      } catch {
      }
      return json(result);
    }
    fail(409, "Repository sedang berubah. Draft tetap tersimpan; silakan coba lagi.");
  }
  return { async fetch(request, env) {
    const url = new URL(request.url);
    let headers = {};
    try {
      if (url.pathname === "/health") return json({ configured: configured(env) });
      if (!configured(env)) fail(503, "Layanan penerbitan belum diaktifkan. Ikuti panduan aktivasi terlebih dahulu.");
      headers = cors(request, env);
      if (request.method === "OPTIONS") {
        originCheck(request, env);
        return new Response(null, { status: 204, headers });
      }
      if (url.pathname === "/auth/start" && request.method === "GET") {
        const nonce = url.searchParams.get("nonce");
        if (!/^[a-zA-Z0-9_-]{43}$/.test(nonce || "")) fail(400, "Permintaan masuk tidak valid.");
        const state = random(), verifier = random();
        const challenge = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
        await env.SESSIONS.put(`oauth:${await digest(state)}`, await seal({ verifier, nonce }, env.SESSION_SECRET), { expirationTtl: 600 });
        const auth = new URL("https://github.com/login/oauth/authorize");
        Object.entries({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, scope: "public_repo", state, code_challenge: challenge, code_challenge_method: "S256", allow_signup: "false" }).forEach(([k, v]) => auth.searchParams.set(k, v));
        return new Response(null, { status: 302, headers: { Location: auth.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
      }
      if (url.pathname === "/auth/callback" && request.method === "GET") {
        const state = url.searchParams.get("state");
        if (!/^[A-Za-z0-9_-]{43}$/.test(state || "")) fail(400, "Sesi masuk tidak valid. Ulangi dari editor.");
        const stateKey = `oauth:${await digest(state)}`;
        const saved = await env.SESSIONS.get(stateKey);
        if (!saved) fail(400, "Sesi masuk sudah berakhir. Ulangi dari editor.");
        await env.SESSIONS.delete(stateKey);
        const flow = await unseal(saved, env.SESSION_SECRET);
        if (url.searchParams.has("error")) fail(401, "Login GitHub dibatalkan. Anda dapat menutup jendela ini.");
        const code = url.searchParams.get("code");
        if (!code || code.length > 300) fail(400, "Kode masuk tidak valid.");
        const response = await fetcher("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/auth/callback`, code_verifier: flow.verifier }) });
        if (!response.ok) fail(502, "GitHub belum dapat menyelesaikan login.");
        const token = await response.json();
        if (!token.access_token) fail(401, "Login GitHub gagal. Ulangi dari editor.");
        const user2 = await github(env, token.access_token, "/user");
        if (String(user2.id) !== String(env.ALLOWED_GITHUB_ID)) fail(403, "Editor ini hanya dapat dihubungkan oleh pemilik Ruang Tulis.");
        const repo = await github(env, token.access_token, repoPath(env));
        if (!repo.permissions?.push) fail(403, "Akun ini tidak memiliki izin menerbitkan ke repository.");
        const id = random();
        const ttl = Math.min(SESSION_TTL, Number(token.expires_in) || SESSION_TTL);
        await env.SESSIONS.put(`session:${await digest(id)}`, await seal({ token: token.access_token, id: user2.id, login: user2.login, expires: Date.now() + ttl * 1e3 }, env.SESSION_SECRET), { expirationTtl: ttl });
        const cspNonce = random();
        const payload = JSON.stringify({ type: "ruang-auth", session: id, nonce: flow.nonce }).replaceAll("<", "\\u003c");
        const siteOrigin = JSON.stringify(new URL(env.SITE_URL).origin);
        const body = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GitHub terhubung</title><p>GitHub terhubung. Kembali ke jendela editor untuk menerbitkan tulisan.</p><script nonce="${cspNonce}">if(window.opener){window.opener.postMessage(${payload},${siteOrigin});window.close();}<\/script></html>`;
        return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${cspNonce}'; base-uri 'none'; frame-ancestors 'none'` } });
      }
      originCheck(request, env);
      const user = await session(request, env);
      let result;
      if (url.pathname === "/api/session" && request.method === "GET") result = json({ login: user.login, repository: env.GITHUB_REPOSITORY });
      else if (url.pathname === "/api/logout" && request.method === "POST") {
        await env.SESSIONS.delete(`session:${user.sessionId}`);
        result = json({ ok: true });
      } else if (url.pathname === "/api/posts" && request.method === "GET") {
        const state = await snapshot(env, user.token);
        const file = url.searchParams.get("file");
        if (file) {
          const post = state.posts.find((p) => p.file === file);
          if (!post) fail(404, "Tulisan tidak ditemukan.");
          const content = await github(env, user.token, `${repoPath(env)}/contents/${post.file}?ref=${state.head}`);
          result = json({ post, markdown: dec.decode(unbase64(content.content.replace(/\s/g, ""))), fileSha: content.sha });
        } else result = json({ posts: state.posts });
      } else if (url.pathname === "/api/publish" && request.method === "POST") result = await publish(request, env, user);
      else fail(404, "Halaman tidak ditemukan.");
      for (const [k, v] of Object.entries(headers)) result.headers.set(k, v);
      return result;
    } catch (error) {
      return json({ error: error.status ? error.message : "Layanan penerbitan mengalami gangguan. Draft Anda tetap tersimpan." }, error.status || 500, headers);
    }
  } };
}
var worker_default = createPublisher();
export {
  HttpError,
  createPublisher,
  worker_default as default,
  digest,
  seal,
  unseal,
  validateImages
};
