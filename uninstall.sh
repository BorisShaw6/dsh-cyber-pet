#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh-cyber-pet one-click uninstaller
#
# Reverts the four registration points and (with --purge) deletes the copied
# package directories from a DeepSeek Harness checkout.
#
# Usage:
#   ./uninstall.sh [path/to/deepseek-harness] [--purge] [--skip-deps] [--skip-build]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say()  { printf '\033[1;34m🐳\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

HARNESS=""
PURGE=0
SKIP_DEPS=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --purge)      PURGE=1 ;;
    --skip-deps)  SKIP_DEPS=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -*)           ;;
    *)            HARNESS="$arg" ;;
  esac
done

if [[ -z "$HARNESS" ]]; then
  for candidate in "./deepseek-harness" "../deepseek-harness" "."; do
    if [[ -f "$candidate/pnpm-workspace.yaml" && -d "$candidate/packages/client" ]]; then
      HARNESS="$candidate"
      break
    fi
  done
fi
[[ -n "$HARNESS" ]] || fail "harness checkout not found. Usage: ./uninstall.sh /path/to/deepseek-harness --purge"
HARNESS="$(cd "$HARNESS" && pwd)"
say "Harness checkout: $HARNESS"

# ── 1. revert the registration ───────────────────────────────────────────────
say "Reverting registration lines..."
node "$SCRIPT_DIR/scripts/patch-files.mjs" revert "$HARNESS"

# ── 2. optionally delete the copied packages ─────────────────────────────────
if [[ "$PURGE" -eq 1 ]]; then
  for pkg in "$HARNESS/packages/client/ui-pet" "$HARNESS/packages/feedback/pet-chat"; do
    if [[ -d "$pkg" ]]; then
      rm -rf "$pkg"
      ok "removed ${pkg#"$HARNESS"/}"
    fi
  done
else
  say "keeping the package directories (use --purge to delete them)"
fi

# ── 3. relink + rebuild ──────────────────────────────────────────────────────
cd "$HARNESS"
if command -v pnpm >/dev/null 2>&1; then PNPM="pnpm"; else PNPM="npx -y pnpm@11.7.0"; fi
if [[ "$SKIP_DEPS" -eq 0 ]]; then
  say "pnpm install (relinking workspace)..."
  $PNPM install
fi
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  say "pnpm run build..."
  $PNPM run build
fi

ok "Uninstall complete."
