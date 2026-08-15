/**
 * Bundle host entry — decorator-free re-export of the pet-chat service.
 *
 * The source carries a TC39 `@Remote('ask')` decorator; Node's ESM loader
 * does not parse decorator syntax, and neither rolldown nor the harness host
 * transpiles plugin modules at load time. A TC39 method decorator is just
 * `decorator(method, context)` evaluated at class-definition time whose
 * addInitializer marks the prototype, so apply it here through the exported
 * `Remote` factory with an equivalent synthetic context. The marker table is
 * idempotent (same exportName + invocation), so this stays safe if the same
 * module ever loads twice.
 */
import { Remote } from '@deepseek-ai/dsh-typert-protocol'
import PetChatService from '../../pet-chat/src/index.ts'

Remote('ask')(PetChatService.prototype.ask, {
  kind: 'method',
  name: 'ask',
  static: false,
  private: false,
  access: { get: () => PetChatService.prototype.ask },
  metadata: {},
  addInitializer(initializer) {
    // The real decorator runs the initializer per instance, where
    // Object.getPrototypeOf(this) === PetChatService.prototype; reproduce
    // that with a bare instance so the marker lands on the right prototype.
    initializer.call(Object.create(PetChatService.prototype))
  },
} as ClassMethodDecoratorContext)

export * from '../../pet-chat/src/index.ts'
export { default } from '../../pet-chat/src/index.ts'
