// host.mjs — 렌더링된 JPEG를 GitHub Pages 리포에 올리고 발행 manifest(post.json)를 생성
//
// 사용법:
//   node host.mjs --dir ../cardnews/out --slug day-1 [--slides ../cardnews/day-1.json]
//   → 리포의 posts/day-1-<랜덤>/ 에 slide-*.jpg 업로드 → 공개 URL 목록 출력 + post.json 생성
//   --slides 주면 카드뉴스 원본에서 대체텍스트(alt)를 자동 생성해 manifest에 넣는다 (SEO)
//
// 전제(.env): GH_USER=깃허브사용자명, GH_REPO=dhenddl-assets
// 전제(1회): GitHub에 공개 리포 생성 + Settings > Pages > Deploy from branch(main, /root)
// 참고: 첫 push 때 Git Credential Manager가 브라우저 인증을 1회 요구할 수 있음 (사람 몫)
// ⚠️ 발행 전 콘텐츠가 공개 URL에 노출되므로 경로에 랜덤 문자열을 붙인다. 발행 후 정리 가능.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildAlts } from './alt.mjs';
import { loadEnv } from './env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));


const args = { dir: null, slug: 'post', slides: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dir') args.dir = argv[++i];
  else if (argv[i] === '--slug') args.slug = argv[++i];
  else if (argv[i] === '--slides') args.slides = argv[++i];
}
if (!args.dir) { console.error('사용법: node host.mjs --dir <jpg폴더> [--slug day-1]'); process.exit(1); }

const env = loadEnv(HERE);
if (!env.GH_USER || !env.GH_REPO) throw new Error('.env에 GH_USER / GH_REPO 필요');

const srcDir = resolve(HERE, args.dir);
const jpgs = readdirSync(srcDir).filter((f) => /^slide-\d+\.jpg$/.test(f)).sort();
if (!jpgs.length) throw new Error(`${srcDir}에 slide-*.jpg 없음 (render.js 먼저 실행)`);

// 로컬 클론 준비 (공개 리포라 clone은 인증 불필요, push만 인증)
const repoDir = join(HERE, 'assets-repo');
const remote = `https://github.com/${env.GH_USER}/${env.GH_REPO}.git`;
const git = (cmd) => execSync(`git ${cmd}`, { cwd: repoDir, stdio: 'pipe' }).toString().trim();
if (!existsSync(repoDir)) {
  console.log(`클론: ${remote}`);
  execSync(`git clone ${remote} "${repoDir}"`, { stdio: 'inherit' });
} else {
  git('pull --rebase');
}
// 익명 분리: 공개 리포의 커밋 작성자를 전용 계정 명의로 고정 (전역 git 설정의 실명 노출 방지)
//
// ★ 이미 noreply 로 설정돼 있으면 건드리지 않는다 (2026-08-27).
//   깃허브 noreply 는 두 형식이 있다 — `이름@users.noreply.github.com`(구형식)과
//   `숫자ID+이름@users.noreply.github.com`(ID 접두). **ID 접두라야 커밋이 계정에 확실히 붙는다.**
//   여기서 무조건 덮어쓰면 사람이 더 정확한 값을 넣어둬도 매 실행마다 구형식으로 되돌아간다.
//   ⛔ 그렇다고 ID 를 소스에 박을 수는 없다 — 이 파일은 공개 자료 1호에 들어간다.
//      박으면 남의 클론이 우리 계정 명의로 커밋한다.
//   ▶ 그래서 「비어 있거나 noreply 가 아니면 안전한 기본값을 넣고, 이미 noreply 면 존중한다」.
//     안전 속성(실명·회사 이메일이 절대 안 쓰인다)은 그대로다.
let curMail = '';
try { curMail = git('config user.email'); } catch { curMail = ''; }
if (!/@users\.noreply\.github\.com$/.test(curMail)) {
  git(`config user.name "${env.GH_USER}"`);
  git(`config user.email "${env.GH_USER}@users.noreply.github.com"`);
}

// 랜덤 경로에 복사 (발행 전 노출 방지)
const postPath = `posts/${args.slug}-${randomBytes(4).toString('hex')}`;
mkdirSync(join(repoDir, postPath), { recursive: true });
for (const f of jpgs) copyFileSync(join(srcDir, f), join(repoDir, postPath, f));

git('add -A');
git(`commit -m "assets: ${postPath} (${jpgs.length}장)"`);
git('push origin HEAD');

// raw.githubusercontent.com 사용 — Pages 빌드/Actions 비의존 + 즉시 반영, IG/Threads 발행 검증된 경로
const branch = git('rev-parse --abbrev-ref HEAD');
const base = `https://raw.githubusercontent.com/${env.GH_USER}/${env.GH_REPO}/${branch}/${postPath}`;
const urls = jpgs.map((f) => `${base}/${f}`);

// 대체텍스트(alt): --slides 주면 카드뉴스 원본에서 자동 생성 (이미지 순서와 일치해야 함)
let alts;
if (args.slides) {
  const card = JSON.parse(readFileSync(resolve(HERE, args.slides), 'utf8'));
  const built = buildAlts(card);
  if (built.length === urls.length) { alts = built; console.log(`alt 자동 생성: ${alts.length}개`); }
  else console.warn(`⚠️ alt 생략 — 슬라이드(${built.length}) ≠ 이미지(${urls.length}) 개수 불일치`);
}

// 발행 manifest 생성 (캡션은 검수 단계에서 채움)
//
// ⛔⛔ 2026-08-27 이전에는 **무조건 새 객체로 덮어썼다.**
//   준비가 끝난 회차에 이 스크립트를 다시 돌리면 `caption`·`threadsText`·`threadsReplies`·
//   `publishDate`·`isAiGenerated` 가 **전부 빈 값으로 날아갔고, 아무 검사도 그걸 안 잡았다.**
//   실제로 `post-ai-law-31.json` 은 caption 397자 + 답글 2건을 들고 있었다.
//   ★ 재호스팅은 「이미지를 다시 올리는 일」이지 「원고를 다시 쓰는 일」이 아니다.
// ▶ 그래서 기존 매니페스트가 있으면 **이미지 URL 만 갈아끼우고 나머지는 그대로 둔다.**
//   alt 는 --slides 를 준 회차에서만 다시 만든다(안 주면 기존 값을 지키는 게 맞다).
const manifestPath = join(HERE, `post-${args.slug}.json`);
let manifest;
if (existsSync(manifestPath)) {
  const prev = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const before = Array.isArray(prev.images) ? prev.images.length : 0;
  if (before && before !== urls.length) {
    console.warn(`⚠️ 이미지 장수가 달라졌다: 기존 ${before}장 → 새 ${urls.length}장. alts·캡션이 어긋날 수 있다.`);
  }
  manifest = { ...prev, images: urls };
  if (alts) manifest.alts = alts;
  const kept = Object.keys(prev).filter((k) => k !== 'images' && !(alts && k === 'alts'));
  console.log(`기존 매니페스트 갱신 — images${alts ? ' + alts' : ''} 만 바꿨다. 보존: ${kept.join(', ') || '(없음)'}`);
} else {
  manifest = { caption: '', threadsText: '', images: urls, targets: ['instagram', 'threads'] };
  if (alts) manifest.alts = alts;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`\n업로드 완료: ${jpgs.length}장 → ${postPath}`);
console.log(`manifest: ${manifestPath} (caption 채운 뒤 publish.mjs --dry-run 실행)`);
console.log(`⏳ GitHub Pages 반영까지 1~2분 대기 후 URL 확인:`);
urls.forEach((u) => console.log(`  ${u}`));
