import "@testing-library/jest-dom/vitest";

// Runs for every test file, in both environments — the suite defaults to `node`
// and files opt into a DOM with a `// @vitest-environment jsdom` docblock (see
// `vite.config.ts` for why that way round). Registering the jest-dom matchers
// is harmless without a DOM; the stubs below guard for its absence.

// jsdom implements no scrolling API, but components legitimately call these to
// keep a wizard step or a newly-revealed field in view. Stub them once here
// rather than making every component test mock them — or, worse, pushing
// components to guard calls they shouldn't have to guard.
if (typeof Element !== "undefined") {
  Element.prototype.scrollTo ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
