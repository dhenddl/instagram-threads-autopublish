// host-mixed.mjs — 이미지+영상이 섞인 파일 목록을 GitHub 리포에 올리고 URL 목록을 출력
// (host.mjs의 slide-*.jpg 전용 로직을 일반화한 버전 — 움직이는 캐러셀처럼 표지 PNG + 영상 mp4가 섞인 경우용)
//
// 사용법:
//   node host-mixed.mjs --slug moving-01 --files a.png,b.mp4,c.mp4,...
//
// 전제(.env): GH_USER / GH_REPO (host.mjs와 동일)

import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { loadEnv } from './env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));


const args = { slug: 'post', files: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--slug') args.slug = argv[++i];
  else if (argv[i] === '--files') args.files = argv[++i];
}
if (!args.files) { console.error('사용법: node host-mixed.mjs --slug <슬러그> --files <경로1,경로2,...>'); process.exit(1); }

const env = loadEnv(HERE);
if (!env.GH_USER || !env.GH_REPO) throw new Error('.env에 GH_USER / GH_REPO 필요');

const files = args.files.split(',').map((f) => resolve(HERE, f.trim()));
for (const f of files) if (!existsSync(f)) throw new Error(`파일 없음: ${f}`);

const repoDir = join(HERE, 'assets-repo');
const remote = `https://github.com/${env.GH_USER}/${env.GH_REPO}.git`;
const git = (cmd) => execSync(`git ${cmd}`, { cwd: repoDir, stdio: 'pipe' }).toString().trim();
if (!existsSync(repoDir)) {
  console.log(`클론: ${remote}`);
  execSync(`git clone ${remote} "${repoDir}"`, { stdio: 'inherit' });
} else {
  git('pull --rebase');
}
git(`config user.name "${env.GH_USER}"`);
git(`config user.email "${env.GH_USER}@users.noreply.github.com"`);

const postPath = `posts/${args.slug}-${randomBytes(4).toString('hex')}`;
mkdirSync(join(repoDir, postPath), { recursive: true });
const names = [];
for (const f of files) {
  const name = basename(f);
  copyFileSync(f, join(repoDir, postPath, name));
  names.push(name);
}

git('add -A');
git(`commit -m "assets: ${postPath} (${names.length}개, 이미지+영상)"`);
git('push origin HEAD');

const branch = git('rev-parse --abbrev-ref HEAD');
const base = `https://raw.githubusercontent.com/${env.GH_USER}/${env.GH_REPO}/${branch}/${postPath}`;
const urls = names.map((n) => `${base}/${n}`);

console.log(`\n업로드 완료: ${names.length}개 → ${postPath}`);
console.log(`⏳ 반영까지 1~2분 대기 후 URL 확인:`);
urls.forEach((u) => console.log(`  ${u}`));
console.log(`\n--- manifest images 배열용 ---`);
console.log(JSON.stringify(urls, null, 2));
