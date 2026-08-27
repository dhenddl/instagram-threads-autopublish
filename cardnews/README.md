# 카드뉴스 렌더링 파이프라인

`slides.json`(내용) → 1080×1350 PNG(인스타 4:5 피드) 자동 생성. 위키의 "brief 파일 패턴" 구현체 — 내용 파일만 바꾸면 디자인이 유지된 채 재생성된다.

## 사용법

```bash
# 최초 1회
npm run setup          # playwright + chromium 설치

# 렌더링
npm run render                    # slides.json 사용
node render.js day-1.json        # 다른 회차 파일 지정
```

출력: `out/<meta.outDir>/slide-01.png ~ slide-NN.png`

## 새 회차 만들기

1. `slides.json`을 `day-N.json`으로 복사
2. `meta.episode`, `meta.terminalTitle`, `meta.outDir`, 슬라이드 내용 수정
3. `node render.js day-N.json`

## 슬라이드 타입

| type | 용도 | 필드 |
|---|---|---|
| `cover` | 표지 | badge, title, sub, next |
| `content` | 본문 | kicker, heading, body, next |
| `goal` | 수치 카드 | kicker, stats[{label, now, target}], body, next |
| `cta` | 마지막 장 | heading, body, followLabel (핸들은 meta.handle) |
| `curve` | **리텐션 곡선 비교** (2026-08-05 신설) | kicker, heading, charts[{label, value, points, note, tone}], note, next |
| `table` | **실측 비교표** (2026-08-05 신설) | kicker, heading, rows[{cells:[3개], tone}], note, next |

`curve`의 `points`는 `[[시간%, 시청자%], ...]`, `tone`은 `good`(초록)·`bad`(빨강)·생략(파랑).
`table`의 첫 행은 자동으로 헤더 스타일이고, `tone`은 `hi`(초록 배경)·`lo`(빨강 배경).
두 타입은 **슬라이드에 `alt`를 직접 넣어라** — kicker+heading만으로는 무슨 데이터인지 전달되지 않고,
그림을 못 보는 사람에게는 alt가 유일한 내용이다(`alt.mjs`가 `alt`를 우선 사용).

`\n` = 줄바꿈. next를 비우면 넘김 문장 생략.

## 발행 전 체크 (위키 원칙)

- [ ] meta.handle을 실제 계정으로 교체
- [ ] 문구를 소리 내어 읽고 본인 말투로 다듬기 (2~3회)
- [ ] 훅 1초 기준: 표지 첫 줄이 즉시 읽히는가
- [ ] 폰트 품질을 올리려면 Pretendard 설치 권장 (미설치 시 Malgun Gothic 폴백)

## 디자인 토큰

`render.js`의 `css` 상단 `:root` 변수에서 색 변경: `--bg`(배경) `--accent`(포인트 그린) `--text` `--dim`.

## 릴스 영상 만들기 (make-reels.mjs)

카드뉴스 이미지(4:5)를 9:16 세로 릴스 영상(무음 MP4)으로 합성 + 구글 드라이브 자동 업로드.

```bash
# 영상만 생성
node make-reels.mjs --dir out/day-0 --out out/day-0/day-0-reels.mp4

# 생성 + 구글 드라이브 업로드까지 한 방 (권장)
node make-reels.mjs --dir out/day-0 --out out/day-0/day-0-reels.mp4 --drive gdrive:dhenddl-reels/
```

- 옵션: `--hold 4`(장당 초) `--xfade 0.5`(크로스페이드 초) `--bg 0x0D1117`(레터박스 배경)
- `--drive`: rclone 원격 경로. 새 터미널에선 `rclone`이 PATH에 있음. 없으면 `--rclone <rclone.exe 경로>` 추가
- **오디오는 무음** — 인스타 앱에서 업로드할 때 트렌드 음악을 얹는다 (릴스 API가 트렌드 음악 미지원 + Creator 계정이라 릴스는 앱 수동 업로드가 정답)
- 의존성: `ffmpeg-static`(npm, 자동 설치됨), `rclone`(별도 설치 — 드라이브 업로드 시)

### 발행 흐름 (반자동)

```
render.js (slides.json → JPG)
  → make-reels.mjs --drive gdrive:dhenddl-reels/  (9:16 MP4 → 드라이브, 캡션 .txt 자동 생성)
  → 폰 드라이브 앱에서 파일 열기 → 인스타 릴스 업로드 → 트렌드 음악 + 캡션(.txt 복붙) → 발행
```

## 릴스 캡션 자동 생성 (reel-caption.mjs)

**2026-07-23 도입** — 그동안 릴스는 폰 수동 업로드라 캡션·해시태그 입력까지 사람 손이었고, 실제로 계속 빈 채로 발행되고 있었음(진단 → [[성과 진단 로그]]). `make-reels.mjs`/`make-termcast.mjs`가 영상 생성 후 **자동으로 `pipeline/publish/post-<슬러그>.json`의 caption을 찾아 영상 옆에 `<이름>-caption.txt`로 저장**한다. 폰 업로드 시 이 파일을 열어 복붙하면 끝.

- 슬러그는 기본으로 출력 폴더명에서 추론(`out/day-2/...` → `day-2` → `post-day-2.json`). 다르면 `--slug <이름>` 또는 매니페스트 경로를 직접 `--manifest <path>`로 지정.
- `--drive` 사용 시 **영상과 캡션.txt가 같이 드라이브에 올라감**(원격 업로드 대비, 2026-07-23~) — 폰 드라이브 앱에서 두 파일 다 확인 가능.

### ★ 드라이브 파일명 = `<발행일>-<슬러그>-reels.mp4` (2026-08-05 도입, 필수)

**배경**: `originality-reels.mp4`처럼 날짜 없는 이름이 16개 쌓여 폰에서 "오늘 올릴 게 뭔지"를 파일명만 보고 못 골라내는 상태가 됐다(사용자 지적).

**⚠️ 업로드 시각을 쓰면 안 된다** — 드라이브가 이미 보여주는 시각은 *만든 날*이고 우리가 알아야 하는 건 *계정에 나가는 날*이다. 실측 10건 중 **6건이 서로 달랐다**(tip-8은 3일, day-2는 2일 차이). 그래서 발행일을 매니페스트에 적고 그 값을 파일명에 박는다.

```json
// pipeline/publish/post-<슬러그>.json 첫 줄
{ "publishDate": "2026-08-05", "caption": "...", ... }
```

- 매니페스트에 `publishDate`가 있으면 **자동 적용**(별도 옵션 불필요). 예외적으로 `--pubdate YYYY-MM-DD`로 덮어쓸 수 있다.
- **발행일을 못 찾으면 업로드를 중단한다**(경고 아니라 하드 실패) — 경고로 두면 무시되고 날짜 없는 파일이 다시 쌓인다. 영상·캡션은 로컬에 남으니 `publishDate`만 채워 다시 돌리면 된다.
- `publishDate`는 `publish.mjs`가 읽지 않는 필드라 **발행 동작에 영향이 없다**(참조 필드만 읽고 미지의 키는 무시).
- 업로드는 `rclone copy`가 아니라 **`copyto`** — 이름을 바꿔 올리려면 대상 파일명을 지정해야 한다.

### ★★★ 훅 프레임 (`--hook-text`, 2026-08-06 신설) — 결론을 0초에 둔다

```bash
node make-termcast.mjs --lines lines/x.txt --cmd "node check-insights.mjs" --title "x.sh" \
  --hook-badge "릴스 6건 · 전부 API 실측" \
  --hook-text "도달 2 vs 178" \
  --hook-sub "완주율은 53% vs 51%.\n거의 같은데 89배 차이예요." \
  --hook-ms 1600 --loop --drive gdrive:dhenddl-reels/
```

**왜 만들었나** — `reels_skip_rate` 실측 8건이 **전부 69~84%가 첫 3초에 이탈**이었고, 타임라인을 계산해보니 원인이 우리 구조였다:

| | 종전 | 훅 적용 후 |
|---|---|---|
| 0.0s | 명령어 타이핑 시작 | **결론(큰 글씨)** |
| 1.4s | **CTA "팔로우하세요"** ← 가치 전달 전 | 타이핑(빠르게) |
| 3.0s | 데이터 4~5줄. **여기서 70~84% 이탈** | 데이터 2줄 (결론은 이미 봤음) |
| 6.3s | 결론 등장 | — |
| 7.0s | — | 마지막 줄 + **CTA(결론 이후)** |

**originality 릴스 평균 시청이 2.64초**였고 결론은 6.29초에 나왔다 → **평균 시청자는 결론을 본 적이 없었다**(도달률 42%).

- ⚠️ **훅 프레임을 그냥 앞에 덧붙이면 안 된다** — 페이오프가 더 늦어진다. **`--hook-text`가 결론이어야 하고**, 터미널은 셋업이 아니라 **증거**로 뒤에 온다.
- `--hook-text`를 주면 **타이핑 속도가 30 → 60자/초, 엔터 대기 350 → 220ms로 자동 단축**된다(타이핑이 더는 훅이 아니라 전환 구간이므로).
- **CTA는 마지막 줄이 나온 뒤에만** 뜬다(종전엔 1.4초 고정).
- `\n`으로 줄바꿈. 큰 글씨는 112px이라 **한 줄에 한글 8자 정도**가 상한 — 넘치면 자동 줄바꿈되며 어색해진다. 숫자 대비형("도달 2 vs 178")이 잘 맞는다.
- **루프와 함께 쓰면 이음새가 완전히 사라진다** — 훅 오버레이가 커서를 덮어서 첫 프레임과 마지막 프레임이 **MD5까지 동일**해진다(훅 없이 `--loop`만 쓰면 커서 깜빡임 위상이 달라 미세하게 어긋난다).

### 루프 릴스 (`make-termcast.mjs --loop`, 2026-08-05 신설)

마지막 구간에서 화면을 **첫 프레임 상태(빈 프롬프트 + 커서)로 되돌려** 영상이 이어붙는 지점을 없앤다. 재생이 반복될 때 끊김이 안 보인다.

- **기본값 off.** 켜면 포맷이 바뀌어 기존 릴스와의 실측 비교가 깨진다 — 실험으로 다룰 것.
- 관찰 지표는 **조회/도달 비율**(기준선 1.08~1.43배) → `wiki/topics/완주율 (Completion Rate).md`
- ⚠️ **릴스 대본 원칙 — 우리 도구가 실제로 출력하는 것만 화면에 띄운다.** 예를 들어 완주율은 API가 주지 않는 값(앱 인사이트에서 사람이 역산)이라, 터미널이 완주율을 뱉는 화면을 만들면 코드가 측정한 것처럼 보이는 거짓이 된다.
- 매니페스트가 아직 없으면(캡션을 영상보다 나중에 쓰는 경우) 에러 없이 안내만 출력하고 넘어감 — 나중에 단독 실행으로 채우면 됨:
  ```bash
  node reel-caption.mjs --slug day-2 --out out/day-2/day-2-reels-caption.txt
  ```
- 캡션은 캐러셀과 동일한 텍스트(해시태그 포함)를 그대로 재사용 — 릴스 전용으로 다듬고 싶으면 매니페스트 caption 자체를 손보거나, `.txt` 파일을 업로드 전에 직접 수정.
