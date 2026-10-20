/**
 * Rest-parameter constructor used by TypeScript's mixin pattern. The compiler
 * requires `any[]` here; keeping the alias in a declaration file lets the
 * runtime source stay free of explicit `any`.
 */
export type MixinConstructor<T = object> = new (...args: any[]) => T;
