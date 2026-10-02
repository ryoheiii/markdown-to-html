#!/usr/bin/env bash
# Ubuntu bootstrap: no Node.js, sudo, shell-profile edits or environment locks.
set -euo pipefail

help() {
  cat <<'HELP'
使い方: bash setup.sh [オプション]（Ubuntu / WSL）
  引数なし: Mermaid の検証・必要時の取得とコマンドの準備（Node.js が必要、mdh は登録しません）。
  --install-node / --remove-node: Node.js のユーザー導入 / 削除。
  --install-pandoc / --remove-pandoc: Pandoc のユーザー導入 / 削除。
  --add-path / --remove-path: ~/.local/bin/mdh の登録 / 解除。
  --help: このヘルプを表示。
対応版が利用できる場合は再導入しません。既存のシステム環境は変更しません。
PATH は ~/.local/bin だけを使用します。シェルの起動設定は自動変更しません。
HELP
}

fail() { printf 'setup: %s\n' "$*" >&2; exit 1; }
[[ $# -le 1 ]] || { help >&2; exit 2; }
action=${1:-}
case "$action" in
  --help|-h) help; exit 0 ;;
  ''|--install-node|--remove-node|--install-pandoc|--remove-pandoc|--add-path|--remove-path) ;;
  *) help >&2; exit 2 ;;
esac
[[ $(uname -s) == Linux ]] || fail 'Ubuntu / WSL 専用です。Windows では node setup.js を使用してください。'
[[ ${HOME:-} == /* && $HOME != / ]] || fail 'HOME にユーザーの絶対パスが必要です。'
project=$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")
local_bin="$HOME/.local/bin"
downloads="$HOME/.local/downloads"
original_path=$PATH
export PATH="$local_bin:$PATH"
temporary=''
trap 'if [[ -n $temporary ]]; then rm -rf -- "$temporary"; fi' EXIT

path_notice() {
  if [[ :$original_path: != *":$local_bin:"* ]]; then
    printf '%s\n' 'PATH に ~/.local/bin がありません。初回のみ ~/.bashrc 等に次を追加し、端末を開き直してください:' 'export PATH="$HOME/.local/bin:$PATH"'
  fi
}

# Accept future versions too; the versions below are fresh-install defaults.
at_least() {
  local actual=${1#v} minimum=$2 i
  local -a a b
  [[ $actual =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || return 1
  IFS=. read -r -a a <<< "$actual"
  IFS=. read -r -a b <<< "$minimum"
  for i in 0 1 2; do
    (( 10#${a[i]:-0} > 10#${b[i]:-0} )) && return 0
    (( 10#${a[i]:-0} < 10#${b[i]:-0} )) && return 1
  done
  return 0
}

version_of() {
  local output
  output=$("$1" --version 2>/dev/null) || return 1
  output=${output%%$'\n'*}
  if [[ $output == pandoc\ * ]]; then output=${output#pandoc }; fi
  printf '%s\n' "$output"
}

register_link() {
  local name=$1 target=$2 link="$local_bin/$1"
  if [[ -L $link && $(readlink -f -- "$link") == "$(readlink -f -- "$target")" ]]; then
    printf 'すでに登録済みです: %s\n' "$link"
    return
  fi
  [[ ! -e $link && ! -L $link ]] || fail "既存のファイル・別のリンクは上書きしません: $link"
  mkdir -p -- "$local_bin"
  ln -s -- "$target" "$link"
  printf '登録しました: %s -> %s\n' "$link" "$target"
}

install_runtime() {
  local tool=$1 minimum=$2 version=$3 arch name archive url dir installed
  if command -v "$tool" >/dev/null 2>&1; then
    installed=$(version_of "$tool") || installed=''
    if at_least "$installed" "$minimum"; then
      printf '%s %s は利用可能です（導入を省略）: %s\n' "$tool" "$installed" "$(command -v "$tool")"
      path_notice
      return
    fi
  fi
  [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && at_least "$version" "$minimum" || fail "$tool の導入版には $minimum 以降の x.y.z を指定してください。"
  [[ ! -e $local_bin/$tool && ! -L $local_bin/$tool ]] || fail "先に既存の登録を確認・解除してください: $local_bin/$tool"
  case $(uname -m) in
    x86_64) if [[ $tool == node ]]; then arch=x64; else arch=amd64; fi ;;
    aarch64|arm64) arch=arm64 ;;
    *) fail '自動導入は x86_64 / ARM64 に対応しています。' ;;
  esac
  if [[ $tool == node ]]; then
    name="node-v$version-linux-$arch"
    archive="$name.tar.xz"
    url="https://nodejs.org/dist/v$version/$archive"
  else
    name="pandoc-$version-linux-$arch"
    archive="$name.tar.gz"
    url="https://github.com/jgm/pandoc/releases/download/$version/$archive"
  fi
  dir="$downloads/$name"
  if [[ -e $dir || -L $dir ]]; then
    [[ ! -L $dir && -f $dir/.mdh-setup && $(cat "$dir/.mdh-setup") == "mdh-user-install:$tool" ]] || fail "既存の展開先は上書きしません: $dir"
    installed=$(version_of "$dir/bin/$tool") || installed=''
    at_least "$installed" "$minimum" || fail "展開済みの $tool を実行できません: $dir"
  else
    [[ ! -e $downloads/$archive && ! -L $downloads/$archive ]] || fail "既存の取得ファイルは上書きしません: $downloads/$archive"
    command -v curl >/dev/null || fail 'curl / ca-certificates を先に用意してください。'
    command -v tar >/dev/null || fail 'tar を先に用意してください。'
    if [[ $tool == node ]]; then command -v xz >/dev/null || fail 'xz-utils を先に用意してください。'; fi
    mkdir -p -- "$downloads"
    temporary=$(mktemp -d "$downloads/.mdh-install-XXXXXX")
    printf '%s %s を取得します。\n' "$tool" "$version"
    curl --fail --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 300 --output "$temporary/$archive" "$url" || fail "$tool の取得に失敗しました。ネットワーク接続と HTTPS 証明書を確認してください。"
    mkdir -- "$temporary/unpacked"
    tar -xf "$temporary/$archive" --strip-components=1 -C "$temporary/unpacked"
    installed=$(version_of "$temporary/unpacked/bin/$tool") || fail "取得した $tool を実行できません。"
    [[ ${installed#v} == "$version" ]] || fail "取得した $tool のバージョンが一致しません: $installed"
    printf 'mdh-user-install:%s\n' "$tool" > "$temporary/unpacked/.mdh-setup"
    mv -- "$temporary/unpacked" "$dir"
    mv -- "$temporary/$archive" "$downloads/$archive"
    rm -rf -- "$temporary"
    temporary=''
  fi
  register_link "$tool" "$dir/bin/$tool"
  path_notice
}

remove_runtime() {
  local tool=$1 link="$local_bin/$1" target dir name archive
  if [[ ! -e $link && ! -L $link ]]; then
    printf 'このセットアップによる %s の登録はありません。システム側は変更しません。\n' "$tool"
    return
  fi
  [[ -L $link ]] || fail "実ファイルは削除しません: $link"
  target=$(readlink -- "$link")
  dir=${target%/bin/$tool}
  name=${dir##*/}
  [[ $target == "$dir/bin/$tool" && ${dir%/*} == "$downloads" && ! -L $dir ]] || fail "このセットアップの導入先ではありません: $link"
  case "$tool:$name" in
    node:node-v*-linux-*) archive="$dir.tar.xz" ;;
    pandoc:pandoc-*-linux-*) archive="$dir.tar.gz" ;;
    *) fail "削除対象外のリンクです: $link" ;;
  esac
  [[ -f $dir/.mdh-setup && $(cat "$dir/.mdh-setup") == "mdh-user-install:$tool" ]] || fail "本スクリプトが導入したものではないため削除しません: $dir"
  rm -- "$link"
  rm -rf -- "$dir"
  rm -f -- "$archive"
  printf '削除しました: %s（リンク・実体・取得アーカイブ）\n' "$tool"
  printf '%s\n' '共有ディレクトリ、システム環境、PATH の共通設定は残します。端末を開き直してください。'
}

case "$action" in
  --install-node) install_runtime node 20.20.0 "${MDH_NODE_VERSION:-24.21.0}" ;;
  --remove-node) remove_runtime node ;;
  --install-pandoc) install_runtime pandoc 3.1.3 "${MDH_PANDOC_VERSION:-3.8.1}" ;;
  --remove-pandoc) remove_runtime pandoc ;;
  --add-path)
    entry="$project/bin/mdh"
    [[ -f $entry ]] || fail "mdh の入口がありません: $entry"
    if grep -q $'\r$' "$entry"; then sed -i 's/\r$//' "$entry"; fi
    chmod u+x -- "$entry"
    register_link mdh "$entry"
    path_notice
    ;;
  --remove-path)
    link="$local_bin/mdh"
    if [[ ! -e $link && ! -L $link ]]; then
      printf '%s\n' 'mdh はすでに未登録です。'
    else
      [[ -L $link && $(readlink -m -- "$link") == "$project/bin/mdh" ]] || fail "別のファイル・プロジェクトの登録は解除しません: $link"
      rm -- "$link"
      printf '%s\n' 'mdh の登録を解除しました。プロジェクト・キャッシュ・文書は残します。'
    fi
    ;;
  '')
    installed=$(version_of node) || installed=''
    at_least "$installed" 20.20.0 || fail '先に bash setup.sh --install-node を実行してください。'
    node "$project/setup.js"
    ;;
esac