/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-pet`.
 * @module @deepseek-ai/dsh-client-ui-pet/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-pet'

/** Cordis companion plugin name. */
export const name = 'client-ui-pet-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a single shell.overlay entry whose disposal is proven
 * by the HMR-safety spec — the plugin's tracker lives inside the plugin fiber
 * closure, persists only to the browser's localStorage, and emits no cordis
 * events or cross-plugin mutable state.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
