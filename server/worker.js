// Cloudflare Workers 백엔드 (무료 플랜: 로그인/회원가입 + 가계부 동기화 + Gemini AI 영수증 프록시)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return hex(bits);
}

async function getUser(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(token, Date.now()).first();
  return row ? { ...row, token } : null;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // 1. 회원가입
      if (path === '/api/auth/register' && req.method === 'POST') {
        const { username, password } = await req.json();
        const name = String(username || '').trim();
        if (name.length < 2 || String(password || '').length < 4) {
          return json({ error: '아이디는 2자 이상, 비밀번호는 4자 이상이어야 해요' }, 400);
        }
        const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(name).first();
        if (exists) return json({ error: '이미 사용 중인 아이디예요' }, 409);

        const id = crypto.randomUUID();
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        const pwHash = await hashPassword(password, salt);
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        const now = Date.now();

        await env.DB.batch([
          env.DB.prepare('INSERT INTO users (id, username, pw_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, pwHash, salt, now),
          env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, id, now + 30 * 86400000)
        ]);
        return json({ token, user: { id, username: name } });
      }

      // 2. 로그인
      if (path === '/api/auth/login' && req.method === 'POST') {
        const { username, password } = await req.json();
        const name = String(username || '').trim();
        const u = await env.DB.prepare('SELECT id, username, pw_hash, salt FROM users WHERE username = ?').bind(name).first();
        if (!u) return json({ error: '아이디 또는 비밀번호가 맞지 않아요' }, 401);
        const pwHash = await hashPassword(String(password || ''), u.salt);
        if (pwHash !== u.pw_hash) return json({ error: '아이디 또는 비밀번호가 맞지 않아요' }, 401);

        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
          .bind(token, u.id, Date.now() + 30 * 86400000).run();
        return json({ token, user: { id: u.id, username: u.username } });
      }

      // 3. 로그아웃
      if (path === '/api/auth/logout' && req.method === 'POST') {
        const u = await getUser(req, env);
        if (u) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(u.token).run();
        return json({ ok: true });
      }

      // 4. 내 가계부 데이터 불러오기 / 저장
      if (path === '/api/data') {
        const u = await getUser(req, env);
        if (!u) return json({ error: '로그인이 필요해요' }, 401);
        if (req.method === 'GET') {
          const row = await env.DB.prepare('SELECT payload, updated_at FROM user_data WHERE user_id = ?').bind(u.id).first();
          return json({ data: row ? JSON.parse(row.payload) : null, updatedAt: row?.updated_at || 0 });
        }
        if (req.method === 'PUT') {
          const body = await req.json();
          const now = Date.now();
          await env.DB.prepare(
            'INSERT INTO user_data (user_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at'
          ).bind(u.id, JSON.stringify(body.data), now).run();
          return json({ ok: true, updatedAt: now });
        }
      }

      // 5. AI 영수증 분석 프록시 (Gemini API 키를 서버에만 보관)
      if (path === '/api/receipt' && req.method === 'POST') {
        if (!env.GEMINI_API_KEY) return json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았어요' }, 500);
        const { imageBase64, mimeType, prompt } = await req.json();
        if (!imageBase64) return json({ error: '이미지가 없어요' }, 400);

        const models = ['gemini-2.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
        let lastErr = 'AI 분석 실패';
        for (const model of models) {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });
          if (r.ok) {
            const d = await r.json();
            let raw = (d.candidates?.[0]?.content?.parts?.[0]?.text || '[]').trim();
            raw = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();
            return json({ items: JSON.parse(raw), model });
          }
          const e = await r.json().catch(() => ({}));
          lastErr = e.error?.message || `API 오류 (${r.status})`;
          if (r.status === 400 || r.status === 401 || r.status === 403) break;
        }
        return json({ error: lastErr }, 502);
      }

      return json({ error: 'Not Found' }, 404);
    } catch (err) {
      return json({ error: err.message || 'Server Error' }, 500);
    }
  }
};
