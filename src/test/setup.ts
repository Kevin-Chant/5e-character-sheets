import "@testing-library/jest-dom/vitest";

// jsdom implements no scrolling API, but components legitimately call these to
// keep a wizard step or a newly-revealed field in view. Stub them once here
// rather than making every component test mock them — or, worse, pushing
// components to guard calls they shouldn't have to guard.
if (typeof Element !== "undefined") {
  Element.prototype.scrollTo ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
