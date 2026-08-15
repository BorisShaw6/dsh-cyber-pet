#!/usr/bin/env node
/**
 * Standalone bundle build for the dsh-cyber-pet plugin package.
 *
 * Produces exactly what a DeepSeek Harness profile consumes out-of-tree:
 *
 *   lib/index.js   — host half (the petChat Remote), plain ESM resolved
 *                    against the profile's node_modules at runtime.
 *   lib/client.js  — browser half, wrapped in the shell's
 *                    window.__ModuleLoader__.load({ id, factory }) envelope
 *                    (same shape as the in-tree clientBundle() output), with
 *                    *.module.css compiled to style-tag injection + class map.
 *   lib/types/**   — declarations for both halves.
 *
 * Sources stay in ../ui-pet/src and ../pet-chat/src (single source of truth
 * shared with the source-level install.sh flow).
 *
 * Usage: node scripts/build.mjs   (from the package root; `npm run build`)
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const PKG = manifest.name

/** Every bare specifier the shell/profile provides — never bundled. */
const EXTERNAL = [/^@deepseek-ai\//, /^react(\/|$)/, /^zod(\/|$)/]

/**
 * Compile one *.module.css into the shell's runtime-injection shape:
 * hashed class names, one dedup'd <style data-plugin-css> tag, default
 * export = the class map. Mirrors the in-tree dsh-css loader output.
 */
function cssModuleJs(cssPath) {
  const css = readFileSync(cssPath, 'utf8')
  const tagId = `${PKG}/${basename(cssPath)}`
  // Class-name prefix: must START WITH A LETTER — a digit-leading prefix
  // (".5_5_Ue_panel") is an invalid CSS selector, so the browser silently
  // drops the whole injected stylesheet and the pet renders unstyled.
  const hash = 'p' + createHash('sha256').update(tagId).digest('base64url').slice(0, 5)
  const map = {}
  const scoped = css.replace(/\.([A-Za-z_][\w-]*)/g, (whole, name) => {
    const scopedName = map[name] ??= `${hash}_${name}`
    return `.${scopedName}`
  })
  const entries = Object.entries(map)
    .map(([name, scopedName]) => `\t${JSON.stringify(name)}: ${JSON.stringify(scopedName)},`)
    .join('\n')
  return `
const css = ${JSON.stringify(scoped)};
const tagId = ${JSON.stringify(tagId)};
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = ${JSON.stringify(PKG)};
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
export default {
${entries}
};
`
}

/** Rolldown plugin serving *.module.css as the JS above. */
function dshCssModules() {
  return {
    name: 'dsh-css-modules',
    load: {
      filter: { id: /\.module\.css$/ },
      handler(id) {
        return { code: cssModuleJs(id), moduleType: 'js' }
      },
    },
  }
}

/**
 * Strip every TC39 @Remote('<name>') decorator token from the pet-chat
 * source at parse time — Node's ESM loader cannot parse decorator syntax,
 * and src/host.ts re-applies the identical markers through the exported
 * Remote factory.
 */
function stripRemoteDecorator() {
  return {
    name: 'strip-remote-decorator',
    transform: {
      filter: { id: /pet-chat[\\/]src[\\/]index\.ts$/ },
      handler(code) {
        return { code: code.replace(/@Remote\(\s*'[^']+'\s*\)\s*/g, ''), map: null }
      },
    },
  }
}

async function build() {
  const { rolldown } = await import('rolldown')

  rmSync(join(pkgRoot, 'lib'), { recursive: true, force: true })
  mkdirSync(join(pkgRoot, 'lib'), { recursive: true })

  // ── host half: pet-chat → lib/index.js (plain ESM, peers external) ──────
  const host = await rolldown({
    input: { index: resolve(pkgRoot, 'src/host.ts') },
    external: EXTERNAL,
    plugins: [stripRemoteDecorator()],
    tsconfig: join(pkgRoot, 'tsconfig.host.json'),
  })
  await host.write({
    dir: join(pkgRoot, 'lib'),
    format: 'esm',
    entryFileNames: '[name].js',
  })
  await host.close()
  console.log('✓ lib/index.js (host half)')

  // ── browser half: ui-pet/client → lib/client.js (ModuleLoader envelope) ─
  const client = await rolldown({
    input: { client: resolve(pkgRoot, '../ui-pet/src/client/index.ts') },
    external: EXTERNAL,
    plugins: [dshCssModules()],
    tsconfig: join(pkgRoot, 'tsconfig.client.json'),
  })
  const emitted = await client.generate({ format: 'cjs', entryFileNames: '[name].js' })
  await client.close()
  const cjs = emitted.output.find(chunk => chunk.fileName === 'client.js').code
  const wrapped = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PKG)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${cjs.replace(/^/gm, '\t\t')}
\t\treturn module.exports;
\t}
});
`
  writeFileSync(join(pkgRoot, 'lib/client.js'), wrapped)
  console.log('✓ lib/client.js (browser half, ModuleLoader envelope)')

  // ── declarations for the browser half ────────────────────────────────────
  const tsc = resolve(pkgRoot, 'node_modules/.bin/tsc')
  execFileSync(tsc, ['-p', 'tsconfig.client.json'], { cwd: pkgRoot, stdio: 'inherit' })
  console.log('✓ lib/types/** (declarations)')
}

build().catch((error) => {
  console.error(error)
  process.exit(1)
})
