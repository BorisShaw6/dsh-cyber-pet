# @borisshaw6/dsh-cyber-pet

A cyber whale pet for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a floating, feedable, color-customizable whale that lives inside the Web UI and reports your token usage, quota, context occupancy, interactions, and conversation counts — with three chat backends, growth levels, moods, milestone celebrations, and a one-click PNG report card.

This is the **dsh-plugin bundle** build of [dsh-cyber-pet](https://github.com/BorisShaw6/dsh-cyber-pet): one package carrying both halves — the host-side `petChat` Remote (the whale's online brain over the llm seam, credentials stay on the host) and the browser surface (the whale, the glass dashboard panel, report card).

## Install (one line)

Requires DeepSeek Harness ≥ `0.1.0-rc.6` and pnpm on PATH (one-time: `npm install -g pnpm`).

```sh
npx @deepseek-ai/dsh plugin --profile web add @borisshaw6/dsh-cyber-pet
```

Then (re)start the web profile — the host discovers the browser half at startup, so a page reload alone is not enough:

```sh
npx @deepseek-ai/dsh web
```

Open http://127.0.0.1:3080 — the yellow whale appears in the bottom-right corner. Verify the layer with:

```sh
npx @deepseek-ai/dsh --profile web --dump-config | grep -A2 pet-chat
```

Optional — the 宿主宝贝 (Harness Pet) chat backend issues one standalone provider request through the host llm seam and needs a configured provider credential, e.g. `DEEPSEEK_API_KEY`. 本地宝贝 (Local Pet) and 在线宝贝 (Online Pet) work without it.

## Update / uninstall

```sh
npx @deepseek-ai/dsh plugin --profile web update @borisshaw6/dsh-cyber-pet
npx @deepseek-ai/dsh plugin --profile web remove @borisshaw6/dsh-cyber-pet
```

Restart the web profile after either. Whale counters and preferences persist in browser `localStorage` (`dsh.cyber-pet.v3`) and survive plugin updates.

## Compatibility

- Tested against harness `0.1.0-rc.6` (developer preview — APIs move fast; peer ranges pin that release).
- Source-level install into a harness checkout (with the full manual procedure, usage guide, and troubleshooting) lives in the [repository README](https://github.com/BorisShaw6/dsh-cyber-pet).

## Building from source (maintainers)

The bundle builds standalone — no harness checkout needed. Sources stay in `../ui-pet/src` and `../pet-chat/src`, shared with the source-level install flow:

```sh
npm install
npm run build     # → lib/index.js (host half) + lib/client.js (browser half) + lib/types/
npm pack          # → borisshaw6-dsh-cyber-pet-<version>.tgz, locally installable for testing
npm publish --access public
```

Bump `version` in package.json before each publish; users then update with `dsh plugin --profile web update @borisshaw6/dsh-cyber-pet`.

## License

MIT — same as DeepSeek Harness.
