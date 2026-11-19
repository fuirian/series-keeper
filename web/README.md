# web — SeriesKeeper 프론트엔드

Next.js 16 (App Router) + TypeScript + Tailwind 4. 인증은 Supabase Auth.

## 실행

```powershell
npm install
npm run dev        # http://localhost:3000
```

Supabase 키가 없어도 화면은 뜬다. 가입·로그인을 누르면 "Supabase 설정이 필요합니다" 안내가 나온다.

## Supabase 연결 (처음 한 번)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만든다. 리전은 서울(ap-northeast-2) 추천.
2. **Project Settings → API Keys**에서 Project URL과 Publishable key를 복사한다.
3. `.env.example`을 `.env.local`로 복사하고 두 값을 채운다.
   ```powershell
   Copy-Item .env.example .env.local
   ```
4. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000`
   - Redirect URLs에 추가: `http://localhost:3000/auth/callback`
5. 개발 서버를 다시 켠다 (`.env.local`은 시작할 때만 읽힘).

> Publishable key는 브라우저에 노출돼도 되는 키다. **Secret key(service_role)는 절대 웹에 넣지 않는다.**

## 인증 흐름

| 경로 | 하는 일 |
| --- | --- |
| `/signup` | 입력값 검사 → `supabase.auth.signUp` → 확인 메일 발송 안내 |
| `/auth/callback` | 메일 링크의 `code`를 세션으로 교환 → 메인으로 |
| `/login` | `signInWithPassword` → 메인으로. 실패 메시지는 하나로 통일 (가입 여부 노출 방지) |
| 메인의 로그아웃 | `signOut` → 메인으로 |

- `src/proxy.ts` — 요청마다 세션을 확인하고 만료된 토큰을 갱신해 쿠키에 반영 (Next 16에서 middleware → proxy로 이름이 바뀜)
- `src/lib/supabase/server.ts` — 서버 컴포넌트·서버 액션용 클라이언트
- `src/app/actions/auth.ts` — 가입·로그인·로그아웃 서버 액션

## 검사

```powershell
npm run lint
npm run typecheck
npm run build
```
