# 따요 처치 출석 PWA (PoC)

QR 스캔으로 성도 출석을 체크하는 **설치 없는 웹앱(PWA)**. 인터넷이 끊겨도 스캔·저장되고, 연결되면 서버로 보냅니다.

- **스캔**: `html5-qrcode`(로컬 벤더링, `vendor/`)로 카메라에서 QR 인식
- **저장**: 브라우저 `IndexedDB`에 저장 (오프라인 OK, 앱 껐다 켜도 유지)
- **오프라인**: 서비스 워커(`sw.js`)가 앱을 캐시 → 인터넷 없이도 열림
- **동기화**: 온라인이 되면 Apps Script 엔드포인트로 전송 (미설정 시 폰에만 저장)

## 1) localhost 에서 실행 (1차 PoC)

```bash
cd /Users/teddy/smilehoho/tayo-church/attendance-pwa
python3 -m http.server 8000
```

브라우저에서 **http://localhost:8000** 열기.
> 카메라·서비스워커는 보안 컨텍스트가 필요하지만 **localhost 는 예외로 허용**되어 그대로 동작합니다.

### 사용
1. **스캔 시작** 버튼 → 카메라 권한 허용 → 팔찌 QR을 비춤 → "출석 완료 ✓"
2. 팔찌가 없으면 **번호로 체크** 칸에 성도 번호 입력
3. **오늘 출석 / 미동기화** 카운트와 **최근 스캔** 목록 확인

### 오프라인 테스트
- 크롬 개발자도구 > Network 탭에서 **Offline** 체크 → 새로고침해도 열리고 스캔·저장됨
- 다시 온라인으로 바꾸면(엔드포인트 설정 시) 자동 전송

### 설치(홈 화면에 추가)
- 데스크톱 크롬: 주소창 우측 설치 아이콘
- 안드로이드 크롬: 메뉴 > 앱 설치 / 홈 화면에 추가
- 아이폰 사파리: 공유 > 홈 화면에 추가

### QR 만들어 테스트
아무 QR 생성기에서 `MEMBER-0142` 또는 `0142` 같은 문자열로 QR을 만들어 화면·종이에 띄우고 스캔하세요. 앱이 끝의 숫자만 뽑아 성도 번호로 씁니다.

## 1-2) 폰에서 HTTPS로 테스트 (카메라)

폰의 카메라는 `https://` 또는 `localhost` 에서만 켜집니다. 같은 Wi-Fi에서 자체 서명 HTTPS로 여세요.

```bash
# 인증서는 dev-server/ 에 이미 생성돼 있습니다. 서버만 실행:
node dev-server/serve-https.js
```

폰 브라우저에서 **https://192.168.45.182:8443** 접속 → 인증서 경고가 뜨면:
- 안드로이드 크롬: **고급 > 192.168.45.182(안전하지 않음)으로 이동**
- 아이폰 사파리: **세부사항 보기 > 이 웹사이트 방문**

이후 카메라 허용 → 스캔하면 시트로 전송됩니다.
> ⚠️ 자체 서명 인증서에서는 **오프라인 캐싱(서비스워커/설치)** 이 막힐 수 있습니다(카메라·서버 전송은 됨). 오프라인까지 폰에서 검증하려면 `mkcert` 로 신뢰된 인증서를 만들거나 실제 HTTPS 호스팅을 쓰세요. IP가 바뀌면 `dev-server/san.cnf` 의 IP를 고쳐 인증서를 재생성하세요.

## 2) Google Sheets + Apps Script 연결 ✅ (연결됨)
`apps-script/Code.gs` 를 웹앱으로 배포하고 그 URL을 `config.js` 의 `ENDPOINT` 에 넣었습니다. 스캔이 시트에 쌓이며, 중복(같은 날·같은 번호·같은 기기)은 서버가 자동으로 걸러 오프라인 재전송에도 안전합니다. (엔드포인트 응답에 `Access-Control-Allow-Origin: *` 가 있어 브라우저에서 바로 전송됩니다.)

### 공유 토큰 보호 설정 (공개 배포 시 필수)
공개(public)로 호스팅하면 백엔드 URL이 노출되므로, 아무나 시트에 쓰지 못하게 **공유 토큰**을 씁니다.
1. `config.js` 의 `TOKEN` 값을 확인합니다(이미 랜덤 값이 들어 있음).
2. Apps Script 편집기 → **프로젝트 설정(톱니 아이콘) → 스크립트 속성 → 속성 추가**
   - 이름: `SHARED_TOKEN`, 값: **`config.js` 의 `TOKEN` 과 똑같은 값**
3. **배포 → 배포 관리 → 편집(연필) → 버전 '새 버전' → 배포** 로 **재배포**합니다.
   - `SHARED_TOKEN` 속성이 있으면, 토큰이 다른 요청은 서버가 `unauthorized` 로 거부합니다.
   - 속성을 설정하지 않으면 검증을 건너뛰어 기존처럼 동작합니다.
> ⚠️ 토큰은 클라이언트(`config.js`)에도 담기므로 **완전 비밀은 아닙니다.** 자동 스캔봇 차단용이며, 완벽 차단이 필요하면 저장소를 비공개로 두고 유료 플랜의 Pages 를 쓰세요.

## 3) GitHub Pages 로 공개 배포 (폰에서 카메라+오프라인 모두 동작)
이 폴더(`attendance-pwa/`)를 **저장소 루트로** 올려 GitHub Pages 프로젝트 사이트로 게시합니다.
- 앱 주소: `https://<아이디>.github.io/<저장소이름>/` (예: `https://smilehoho.github.io/tayo-church/`)
- GitHub Pages 는 신뢰된 HTTPS 라, 자체 서명 인증서에서 막히던 **폰 서비스워커(오프라인) 등록까지 정상 동작**합니다.

배포 순서(요약):
1. 이 폴더에서 `git init` → 커밋.
2. GitHub 에 **public** 저장소 생성 후 push. (`gh repo create <아이디>/<저장소이름> --public --source . --push`)
3. 저장소 **Settings → Pages → Build and deployment → Deploy from a branch** → 브랜치 `main`, 폴더 `/ (root)` → **Save**.
4. 같은 화면에서 **Enforce HTTPS** 켜기.
5. 폰으로 앱 주소 접속 → 카메라 허용 후 스캔 / 비행기모드로 오프라인 동작 확인.

주의:
- 정적 파일을 고치면 `sw.js` 의 `CACHE` 버전(`tayo-att-vN`)을 **올려야** 기존 방문자가 새 파일을 받습니다.
- GitHub Pages 는 정적 파일에 약 10분 브라우저 캐시를 붙여, 갱신 직후 최대 10분간 옛 버전이 보일 수 있습니다.
- `.nojekyll`(이 폴더에 포함) 이 있어야 `vendor/` 등이 누락 없이 그대로 게시됩니다.

## 파일 구성
```
attendance-pwa/            ← 이 폴더가 GitHub Pages 저장소 루트
├─ index.html         화면(UI)
├─ app.js             스캔·저장·동기화 로직
├─ sw.js              서비스 워커(오프라인 캐시)
├─ manifest.webmanifest  PWA 매니페스트
├─ icon.svg           앱 아이콘
├─ config.js          설정(ENDPOINT · TOKEN)
├─ .nojekyll          GitHub Pages Jekyll 가공 건너뛰기
├─ vendor/            html5-qrcode 라이브러리(로컬)
└─ apps-script/Code.gs  시트 백엔드(공유 토큰 검증 포함)
```
