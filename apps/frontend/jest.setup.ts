import '@testing-library/jest-dom';

// jsdom doesn't include structuredClone; polyfill it for Chakra UI
global.structuredClone = global.structuredClone ?? ((val: unknown) => JSON.parse(JSON.stringify(val)));

// jsdom doesn't implement Element.scrollTo; stub it for Zag.js Select
Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});

// jsdom doesn't implement ResizeObserver; stub it for floating-ui
global.ResizeObserver = global.ResizeObserver ?? class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
