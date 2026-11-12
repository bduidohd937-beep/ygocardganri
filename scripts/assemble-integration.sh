#!/usr/bin/env bash
set -euo pipefail

# GitHub Actions has already checked out the approved, pinned snapshots into .integration_sources.
# Builds four real browser applications under one YGO STUDIO GitHub Pages origin.
source_root=".integration_sources"
test -f dist/index.html
test -f "$source_root/artlab/index.html"
test -f "$source_root/designlab/index.html"
test -f "$source_root/cardmaker/package.json"
test -f "$source_root/arena/index.html"

echo "[통합] CARD MAKER 빌드 및 단위 테스트"
npm ci --prefix "$source_root/cardmaker" --no-audit --no-fund
npm test --prefix "$source_root/cardmaker"
npm run build --prefix "$source_root/cardmaker"

echo "[통합] DESIGN LAB 단위 테스트"
npm test --prefix "$source_root/designlab"

mkdir -p dist/modules/artlab dist/modules/designlab dist/modules/cardmaker dist/modules/arena
cp "$source_root/artlab/index.html" "$source_root/artlab/app.js" "$source_root/artlab/asset-engine.js" "$source_root/artlab/styles.css" dist/modules/artlab/
cp -R "$source_root/artlab/assets" dist/modules/artlab/
cp "$source_root/designlab/index.html" dist/modules/designlab/
cp -R "$source_root/designlab/src" dist/modules/designlab/
cp -R "$source_root/cardmaker/dist/." dist/modules/cardmaker/
cp "$source_root/arena/index.html" dist/modules/arena/

for path in dist/modules/{artlab,designlab,cardmaker,arena}/index.html; do
  test -s "$path" || { echo "::error::통합 모듈 진입점 누락: $path"; exit 1; }
done
test -s dist/modules/artlab/asset-engine.js
test -s dist/modules/designlab/src/main.js
test -d dist/modules/cardmaker/assets
test -s dist/modules/arena/index.html
echo "[통합] 모듈 네 종류 파일 생성 확인 (런타임 브라우저 E2E는 별도)"
