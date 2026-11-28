#!/usr/bin/env bash
# フラッシュカードアプリのセットアップ（Mac / Linux 用）
#   使い方: ./setup.sh               … 準備して起動し、単体テストで確かめる
#           ./setup.sh --skip-tests  … 単体テストを飛ばす
# 何度実行しても大丈夫（DB のデータは消さない）。説明書: docs/setup.md

set -u
cd "$(dirname "$0")"

SKIP_TESTS=false
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=true ;;
    -h|--help) sed -n 2,5p "$0"; exit 0 ;;
    *) echo "知らないオプションです: $arg（./setup.sh --help）"; exit 1 ;;
  esac
done

APP_URL="http://localhost:3000"
PORTS=(3000 5432 3100) # アプリ / DB / テスト実行ツール（compose.yaml と合わせる）
WAIT_SECONDS=300            # 初回はビルドと画面の準備に時間がかかる

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$1"; shift; for l in "$@"; do printf '    %s\n' "$l"; done; exit 1; }

# ---- 1. 必要なソフト ----------------------------------------------------------
step "必要なソフトを確かめます"
command -v git >/dev/null || fail "git がありません" "Mac: xcode-select --install ／ Linux: sudo apt install git など"
ok "git"
command -v docker >/dev/null || fail "Docker がありません" \
  "Mac: Docker Desktop を入れてください https://www.docker.com/products/docker-desktop/" \
  "Linux: Docker Engine と Compose を入れてください https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "docker compose が使えません" "Docker を新しいものにしてください（Compose v2 が必要）"
ok "docker compose"
docker info >/dev/null 2>&1 || fail "Docker が動いていません" \
  "Mac: Docker Desktop を起動して、クジラのアイコンが落ち着くまで待ってから、もう一度実行してください" \
  "Linux: sudo systemctl start docker（sudo なしで使うなら docker グループに入る）"
ok "Docker が動いている"

# ---- 2. git の設定 ------------------------------------------------------------
step "コミットの前にテストが走るようにします"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git config core.hooksPath .githooks
  chmod +x .githooks/* 2>/dev/null
  ok "git config core.hooksPath .githooks"
else
  echo "  （git のリポジトリではないので飛ばします）"
fi

# ---- 3. ポート ----------------------------------------------------------------
step "ポートが空いているか確かめます"
if [ -n "$(docker compose ps -q 2>/dev/null)" ]; then
  ok "すでにこのアプリが動いています（ポートの確認は飛ばして、更新します）"
else
  busy=()
  for p in "${PORTS[@]}"; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then busy+=("$p"); fi
  done
  if [ ${#busy[@]} -gt 0 ]; then
    fail "使われているポートがあります: ${busy[*]}" \
      "ほかのアプリ（別の PostgreSQL など）を止めてから、もう一度実行してください。" \
      "何が使っているかは: lsof -iTCP:${busy[0]} -sTCP:LISTEN"
  fi
  ok "${PORTS[*]} は空いている"
fi

# ---- 4. 起動 ------------------------------------------------------------------
step "起動します（初回はビルドするので数分かかります）"
docker compose up -d --build || fail "起動できませんでした" "上のメッセージを確かめてください"
ok "コンテナを起動した"

printf '  画面が開けるようになるのを待っています'
for ((i = 0; i < WAIT_SECONDS; i += 3)); do
  if curl -sf -o /dev/null "$APP_URL/login"; then printf '\n'; ok "$APP_URL が開ける"; break; fi
  printf '.'
  sleep 3
done
if ! curl -sf -o /dev/null "$APP_URL/login"; then
  printf '\n'
  fail "$WAIT_SECONDS 秒待っても画面が開けません" "ログを見てください: docker compose logs app"
fi

# ---- 5. 単体テスト ------------------------------------------------------------
if [ "$SKIP_TESTS" = true ]; then
  step "単体テストは飛ばします（--skip-tests）"
else
  step "単体テストで、正しく動くか確かめます（テスト用の DB を使うので、データには触れません）"
  log="$(mktemp)"
  if docker compose exec -T -e NO_COLOR=1 app npm test >"$log" 2>&1; then
    ok "$(grep -E 'Tests +[0-9]+ passed' "$log" | tr -s ' ' | sed 's/^ //')"
    rm -f "$log"
  else
    tail -30 "$log"
    fail "単体テストが失敗しました" "全部のログ: $log"
  fi
fi

# ---- 6. 案内 ------------------------------------------------------------------
cat <<EOF

$(printf '\033[1m')セットアップが終わりました$(printf '\033[0m')

  1. $APP_URL/signup で ID とパスワード（8文字以上）を決めて登録
  2. 出てきた「復旧コード」をメモする（パスワードを忘れたときに使います）

  止める:   docker compose down（データは残ります）
  また使う: docker compose up -d（または、もう一度 ./setup.sh）
EOF
