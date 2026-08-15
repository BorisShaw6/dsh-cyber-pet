#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh-cyber-pet one-click installer
#
# Copies the two plugin packages into a DeepSeek Harness checkout, wires the
# four registration points, then installs and builds. Idempotent: re-running
# is safe.
#
# Usage:
#   ./install.sh [path/to/deepseek-harness] [options]
#
# Options:
#   --quick        clone a pinned DeepSeek Harness checkout when no path is given
#   --force        overwrite existing plugin package directories
#   --skip-deps    skip `pnpm install`
#   --skip-build   skip `pnpm run build`
#   -h, --help     show this help
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say()  { printf '\033[1;34m🐳\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

# ── parse arguments ──────────────────────────────────────────────────────────
HARNESS=""
QUICK=0
FORCE=0
SKIP_DEPS=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --quick)      QUICK=1 ;;
    --force)      FORCE=1 ;;
    --skip-deps)  SKIP_DEPS=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)    usage ;;
    -*)           fail "unknown option: $arg (see --help)" ;;
    *)            HARNESS="$arg" ;;
  esac
done

# ── locate the harness checkout ──────────────────────────────────────────────
if [[ -z "$HARNESS" ]]; then
  for candidate in "./deepseek-harness" "../deepseek-harness" "."; do
    if [[ -f "$candidate/pnpm-workspace.yaml" && -d "$candidate/packages/client" ]]; then
      HARNESS="$candidate"
      break
    fi
  done
fi
if [[ -z "$HARNESS" && "$QUICK" -eq 1 ]]; then
  # Quick install: fetch a pinned harness checkout (this plugin is source-level —
  # `npx @deepseek-ai/dsh web` ships prebuilt artifacts with nothing to patch).
  HARNESS_VERSION="0.1.0-rc.5"
  HARNESS="$SCRIPT_DIR/deepseek-harness"
  if [[ -d "$HARNESS" ]]; then
    say "$HARNESS already present — reusing the existing clone"
  else
    command -v git >/dev/null 2>&1 || fail "git not found (needed by --quick to clone the harness)"
    say "Quick install: cloning deepseek-harness @ $HARNESS_VERSION (pinned tag)..."
    git clone --depth 1 --branch "v$HARNESS_VERSION" \
      https://github.com/deepseek-ai/deepseek-harness.git "$HARNESS" \
      || git clone --depth 1 --branch "$HARNESS_VERSION" \
      https://github.com/deepseek-ai/deepseek-harness.git "$HARNESS" \
      || fail "could not clone deepseek-harness @ $HARNESS_VERSION"
    ok "cloned deepseek-harness @ $HARNESS_VERSION"
  fi
fi
[[ -n "$HARNESS" ]] || fail "harness checkout not found. Usage: ./install.sh /path/to/deepseek-harness  (or ./install.sh --quick to clone one)"
[[ -f "$HARNESS/pnpm-workspace.yaml" && -d "$HARNESS/packages/client" ]] \
  || fail "$HARNESS does not look like a DeepSeek Harness checkout"
HARNESS="$(cd "$HARNESS" && pwd)"
say "Harness checkout: $HARNESS"

command -v node >/dev/null 2>&1 || fail "Node.js not found (need ≥ 22.19)"
if command -v pnpm >/dev/null 2>&1; then
  PNPM="pnpm"
else
  say "pnpm not found — falling back to: npx -y pnpm@11.7.0 (tip: corepack enable)"
  PNPM="npx -y pnpm@11.7.0"
fi

# ── 1. copy the two packages ─────────────────────────────────────────────────
copy_pkg() {
  local src="$1" dest="$2" name="$3"
  if [[ -d "$dest" ]]; then
    if [[ "$FORCE" -eq 1 ]]; then
      say "$name already present — replacing (--force)"
      rm -rf "$dest"
    else
      ok "$name already present — keeping it (use --force to replace)"
      return 0
    fi
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$src" "$dest"
  rm -rf "$dest/lib" "$dest/node_modules"
  ok "copied $name → ${dest#"$HARNESS"/}"
}
copy_pkg "$SCRIPT_DIR/ui-pet"   "$HARNESS/packages/client/ui-pet"     "ui-pet (browser whale)"
copy_pkg "$SCRIPT_DIR/pet-chat" "$HARNESS/packages/feedback/pet-chat" "pet-chat (host chat brain)"

# ── 2. wire the four registration points ─────────────────────────────────────
say "Registering the plugin in the harness build..."
node "$SCRIPT_DIR/scripts/patch-files.mjs" apply "$HARNESS"

# ── 3. install + build ───────────────────────────────────────────────────────
cd "$HARNESS"
if [[ "$SKIP_DEPS" -eq 0 ]]; then
  say "pnpm install (workspace linking)..."
  $PNPM install
else
  say "skipping pnpm install (--skip-deps)"
fi
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  say "pnpm run build — this takes a few minutes on first run..."
  $PNPM run build
else
  say "skipping build (--skip-build) — remember to run: pnpm run build"
fi

# ── done ─────────────────────────────────────────────────────────────────────
echo
ok "Installation complete!"
echo
echo "  Start the whale:"
echo "    cd $HARNESS"
echo "    pnpm dsh web"
echo
echo "  Then open http://127.0.0.1:3080 — the yellow whale appears bottom-right."
echo "  Uninstall anytime with: ./uninstall.sh $HARNESS"
