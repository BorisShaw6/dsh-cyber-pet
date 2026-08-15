#!/usr/bin/env node
/**
 * dsh-cyber-pet registration engine. Applies (or reverts) the four wiring
 * points the cyber whale needs inside a DeepSeek Harness checkout:
 *
 *   1. tsconfig.host.json          — reference to packages/feedback/pet-chat
 *   2. tsconfig.client.json        — reference to packages/client/ui-pet
 *   3. bundle/web-app/package.json — the two workspace dependencies
 *   4. bundle/web-app/cordis.patch.yml — the pet-chat host row and the
 *      ui-pet browser roster row
 *
 * Every edit is idempotent (re-running changes nothing) and anchor-checked
 * (an unexpected harness layout fails loud instead of corrupting files).
 *
 * Usage: node scripts/patch-files.mjs <apply|revert> <harness-root>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const action = process.argv[2]
const harnessRoot = process.argv[3]

if ((action !== 'apply' && action !== 'revert') || harnessRoot === undefined) {
  console.error('usage: node scripts/patch-files.mjs <apply|revert> <harness-root>')
  process.exit(2)
}

const read = (path) => readFileSync(path, 'utf8')
const write = (path, content) => writeFileSync(path, content, 'utf8')

/** Insert `lines` after the first line matching `anchor`, unless `marker` is already present. */
function insertAfter(file, anchor, marker, lines) {
  const text = read(file)
  if (text.includes(marker)) return false
  const idx = text.indexOf(anchor)
  if (idx < 0) throw new Error(`anchor not found in ${file}: ${JSON.stringify(anchor)}`)
  const at = idx + anchor.length
  write(file, text.slice(0, at) + '\n' + lines + text.slice(at))
  return true
}

/** Remove every line containing one of the markers (plus the comment lines above them). */
function removeLines(file, markers) {
  const lines = read(file).split('\n')
  const out = []
  let removed = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (markers.some(marker => line.includes(marker))) {
      // Drop a plugin-owned comment line sitting directly above the row.
      if (out.length > 0 && out[out.length - 1].trim().startsWith('# Cyber')) out.pop()
      removed += 1
      continue
    }
    out.push(line)
  }
  if (removed > 0) write(file, out.join('\n'))
  return removed > 0
}

const hostTsconfig = join(harnessRoot, 'tsconfig.host.json')
const clientTsconfig = join(harnessRoot, 'tsconfig.client.json')
const webAppPkg = join(harnessRoot, 'packages/bundle/web-app/package.json')
const cordisPatch = join(harnessRoot, 'packages/bundle/web-app/cordis.patch.yml')

for (const file of [hostTsconfig, clientTsconfig, webAppPkg, cordisPatch]) {
  if (!existsSync(file)) {
    console.error(`✗ not a DeepSeek Harness checkout (missing ${file})`)
    process.exit(1)
  }
}

const changes = []

if (action === 'apply') {
  if (insertAfter(hostTsconfig, '"references": [',
    './packages/feedback/pet-chat',
    '    { "path": "./packages/feedback/pet-chat" },')) {
    changes.push('tsconfig.host.json: pet-chat reference')
  }
  if (insertAfter(clientTsconfig, '"references": [',
    './packages/client/ui-pet',
    '    { "path": "./packages/client/ui-pet" },')) {
    changes.push('tsconfig.client.json: ui-pet reference')
  }
  if (insertAfter(webAppPkg, '"dependencies": {',
    '@deepseek-ai/dsh-pet-chat',
    '    "@deepseek-ai/dsh-pet-chat": "workspace:^",\n    "@deepseek-ai/dsh-client-ui-pet": "workspace:^",')) {
    changes.push('web-app/package.json: workspace dependencies')
  }
  if (insertAfter(cordisPatch, 'maxNoteBytes: 8192',
    '- id: pet-chat',
    '\n    # Cyber whale online brain: one-shot pet chat over the llm seam.\n    - id: pet-chat\n      name: \'@deepseek-ai/dsh-pet-chat\'')) {
    changes.push('cordis.patch.yml: pet-chat host row')
  }
  if (insertAfter(cordisPatch, "name: '@deepseek-ai/dsh-client-ui-trajectory'",
    '- id: ui-pet',
    "\n    # Cyber pet: the floating usage whale in the shell.overlay layer.\n    - id: ui-pet\n      name: '@deepseek-ai/dsh-client-ui-pet'")) {
    changes.push('cordis.patch.yml: ui-pet browser roster row')
  }
  console.log(changes.length > 0
    ? `✓ registration applied (${changes.length} edit(s)):\n  - ${changes.join('\n  - ')}`
    : '✓ registration already in place — nothing to do')
}
else {
  if (removeLines(hostTsconfig, ['./packages/feedback/pet-chat'])) changes.push('tsconfig.host.json')
  if (removeLines(clientTsconfig, ['./packages/client/ui-pet'])) changes.push('tsconfig.client.json')
  if (removeLines(webAppPkg, ['@deepseek-ai/dsh-pet-chat', '@deepseek-ai/dsh-client-ui-pet'])) changes.push('web-app/package.json')
  if (removeLines(cordisPatch, ['- id: pet-chat', "name: '@deepseek-ai/dsh-pet-chat'", '- id: ui-pet', "name: '@deepseek-ai/dsh-client-ui-pet'"])) changes.push('cordis.patch.yml')
  console.log(changes.length > 0
    ? `✓ registration reverted in: ${changes.join(', ')}`
    : '✓ no registration lines found — nothing to revert')
}
