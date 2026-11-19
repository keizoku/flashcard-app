#!/bin/sh
# e2e コンテナの入口。Linux 用の node_modules を用意してから、渡されたコマンドを実行する。
# （node_modules は volume に入れておき、package-lock.json が変わったときだけ入れ直す）
set -e
stamp=node_modules/.package-lock-hash
hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat "$stamp" 2>/dev/null)" != "$hash" ]; then
  echo "e2e: パッケージを入れています（初回・package-lock.json が変わったときだけ）..."
  # （npm ci は npm の版の違いで lock の検査に落ちることがあるので、install を使い、lock は書き換えない）
  npm install --no-save --no-audit --no-fund
  echo "$hash" > "$stamp"
fi
exec "$@"
