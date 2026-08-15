# @deepseek-ai/dsh-client-ui-pet

English | [中文](README.zh.md)

Cyber pet surface plugin, browser half: a DeepSeek-style whale floats in the frame-wide `shell.overlay` layer (order 100, additive `pet` cell). One `CyberPetTracker` built in the slot inject closure folds the sessions list store (conversation-box count, current selection) and the current session's conversation snapshot (user-message interactions, assistant token usage, latest prompt size as live context occupancy) into a single immutable `PetStats` snapshot; the registrant-private `hooks` compartment publishes it as the bound `usePetStats` selector hook, and the inject face carries only the mutation verbs. Lifetime counters and every preference persist to `localStorage` under `dsh.cyber-pet.v3` with monotonic per-session high-water marks, so a shrinking history window or a page reload never lowers the recorded spend. A rolling two-minute sample window derives the live burn rate.

The whale defaults to the yellow body with seven preset colors plus a free picker, ships pixel-art and skeuomorphic skins, and grows through four stages (幼鲸 → 少年鲸 → 成年鲸 → 金冠鲸, the last wearing a crown) on lifetime tokens. Behavior modes 活跃 / 静候 / 睡眠 switch through the settings panel or a right-click quick menu; in active mode the whale roams autonomously — swim speed follows the live burn rate × the user's speed ratio inside the user's roam-area percentage — and the rest reminder naps it for three minutes after the configured consecutive-turn grid. The panel is a glass card with three tabs: Overview (user-composed card grid — visibility / size / order — plus the quota bar and a PNG report-card export), Chat (local rule brain, browser-direct OpenAI-compatible endpoint, or the host-side `petChat` Remote), and Settings. The under-whale badge shows the user's metric (quota / context / turns) and cycles on click; a pointer-down outside the pet closes the panel. Bubbles report turn costs, milestone grid lines (every 10k tokens), yesterday's digest on first load, rest reminders, and feedings (drag the token snack onto the whale). Soft WebAudio cues accompany turns, milestones, and feedings when sounds are on.

The `/client` exports are the plugin body (`apply`/`inject`) and the shared contract types (`PetActions`, `PetKey`, and the tracker's settings/stats types).

## Install into DeepSeek Harness

The plugin ships as TWO packages that join the harness workspace: this client surface (`packages/client/ui-pet`) and its optional host-side chat brain (`packages/feedback/pet-chat`). Installation means copying both into a DeepSeek Harness checkout and adding four small registration lines. Tested against harness `0.1.0-rc.5` (developer preview — APIs move fast, pin the same release).

### Prerequisites

- Node.js ≥ 22.19 (24+ recommended)
- Git ≥ 2.26
- pnpm via Corepack: `corepack enable` (the harness pins `pnpm@11.7.0`)

### Step 1 — clone DeepSeek Harness

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
```

### Step 2 — copy the two plugin packages

From this repository, copy:

| Source (this repo) | Destination (harness checkout) |
|---|---|
| `ui-pet/` | `packages/client/ui-pet/` |
| `pet-chat/` | `packages/feedback/pet-chat/` |

```sh
# from the harness checkout root, assuming this repo is cloned beside it
cp -r ../dsh-cyber-pet/ui-pet   packages/client/ui-pet
cp -r ../dsh-cyber-pet/pet-chat packages/feedback/pet-chat
```

### Step 3 — register the packages (4 edits)

1. `tsconfig.host.json` — inside `references`, add:

   ```json
   { "path": "./packages/feedback/pet-chat" },
   ```

2. `tsconfig.client.json` — inside `references`, add:

   ```json
   { "path": "./packages/client/ui-pet" },
   ```

3. `packages/bundle/web-app/package.json` — inside `dependencies`, add:

   ```json
   "@deepseek-ai/dsh-pet-chat": "workspace:^",
   "@deepseek-ai/dsh-client-ui-pet": "workspace:^",
   ```

4. `packages/bundle/web-app/cordis.patch.yml` — add the host service row (next to `message-feedback`, in the host-plane block):

   ```yaml
   - id: pet-chat
     name: '@deepseek-ai/dsh-pet-chat'
   ```

   and the browser roster row (in the same file's browser roster `insert` block, beside the other `dsh-client-ui-*` rows):

   ```yaml
   # Cyber pet: the floating usage whale in the shell.overlay layer.
   - id: ui-pet
     name: '@deepseek-ai/dsh-client-ui-pet'
   ```

### Step 4 — install, build, run

```sh
pnpm install
pnpm run build   # host lib + client bundles + web frontend (takes a few minutes)
pnpm dsh web
```

Open `http://127.0.0.1:3080`. The yellow whale appears in the bottom-right corner. If you had the page open already, hard-refresh (`Cmd/Ctrl+Shift+R`).

Optional — the 宿主宝贝 (harness) chat backend calls the model through the host llm seam, which needs a configured provider key, e.g.:

```sh
export DEEPSEEK_API_KEY=sk-...
pnpm dsh web
```

### Uninstall

Reverse the four edits in Step 3, delete the two package directories, then `pnpm install && pnpm run build`.

## Usage guide

- **Move it**: drag the whale anywhere; the position persists. Right-click switches behavior modes 活跃 / 静候 / 睡眠.
- **Open the panel**: click the whale. Tabs: 概览 (quota bar, user-composed stat cards, PNG report export), 聊天 (本地宝贝 / 在线宝贝 / 宿主宝贝), 设置 (everything).
- **Under-whale badge**: click it to cycle the displayed metric 额度 → 上下文 → 轮次.
- **Chat backends**: 本地宝贝 answers from live stats with zero requests; 在线宝贝 calls any OpenAI-compatible endpoint you configure (base URL / key / model); 宿主宝贝 routes through the host `petChat` service using harness credentials.
- **Feed it**: while the panel is open, drag the 🪙 snack onto the whale.
- **Language**: the panel's 语言 switch changes the whole app locale (中文 / English).
- **Everything persists** in `localStorage` under `dsh.cyber-pet.v3` (counters, colors, modes, layout, chat settings).

### Troubleshooting

| Symptom | Fix |
|---|---|
| No whale on the page | You skipped `pnpm run build` or the browser cached an old bundle — rebuild, then hard-refresh. Check the browser console for `dsh-client-ui-pet` errors. |
| Boot fails: `failed to apply loader entry pet-chat` | The host row in `cordis.patch.yml` is missing/misnamed, or the package wasn't copied to `packages/feedback/pet-chat`. |
| 宿主宝贝 replies `pet-chat-unavailable` | Same as above — the host service isn't mounted; 本地宝贝 / 在线宝贝 still work. |
| Typert build errors about boundary types | Keep the wire types on the `./types` subpath of `pet-chat` (already shipped that way — don't inline them into `index.ts`). |

## Model Experience

None, as the pet surface folds public session snapshots into browser-local usage stats and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Browser-local lifetime counters** — lifetime tokens/interactions accumulate in `localStorage` per browser profile; sessions deleted on the host keep their recorded high-water contribution, and another device starts from zero.
- **Current-session fold only** — per-session counters track the session currently open; a session never opened in this browser contributes nothing until it is visited.
- **Online chat keys stay in the browser** — the browser-direct online backend stores the API key in `localStorage` and sends it only to the configured endpoint; the harness backend (`petChat` Remote) keeps credentials host-side but needs the deployment to mount the `pet-chat` row.
