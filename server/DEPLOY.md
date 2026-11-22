# 무료 백엔드 서버 배포 가이드 (Cloudflare Workers + D1)

사용자가 API 키를 입력하지 않아도 AI 영수증 분석이 되고,
회원가입·로그인으로 기기 간 가계부 동기화까지 되는 **완전 무료 플랜** 서버입니다.

## 1. Cloudflare 로그인 및 DB 생성
```bash
cd server
npx wrangler login
npx wrangler d1 create spend-money-db
```
출력된 `database_id` 값을 `server/wrangler.toml`의 `YOUR_D1_DATABASE_ID` 자리에 붙여넣습니다.

## 2. DB 테이블 생성
```bash
npx wrangler d1 execute spend-money-db --remote --file=schema.sql
```

## 3. 내 Gemini API 키를 서버 비밀키로 숨기기
(코드에는 절대 올라가지 않고 Cloudflare 서버 내부에만 저장됩니다)
```bash
npx wrangler secret put GEMINI_API_KEY
```
프롬프트가 뜨면 발급받은 Gemini API 키(`AIza...`)를 붙여넣고 엔터를 누릅니다.

## 4. 배포
```bash
npx wrangler deploy
```
배포가 끝나면 `https://how-spend-money-api.<본인계정>.workers.dev` 주소가 나옵니다.

## 5. 가계부 앱에 연결
- `app.js` 맨 위 `DEFAULT_SERVER_URL`에 위 주소를 적어두거나,
- 앱의 **⚙️ 설정 → 계정 · 서버 동기화**에 주소를 입력하면 바로 로그인 & 무키 AI 영수증 인식이 동작합니다!
