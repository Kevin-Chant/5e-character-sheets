/**
 * Stub for a context's default value: calling it means a hook was used outside
 * its provider (a wiring bug in src/index.tsx's provider stack), so warn loudly
 * instead of failing silently. `result` is returned so async signatures can
 * resolve (e.g. `missingProvider("save", Promise.resolve())`).
 */
export function missingProvider<R = void>(name: string, result?: R) {
  return (..._args: unknown[]): R => {
    console.warn(`${name} was called outside its provider`);
    return result as R;
  };
}
