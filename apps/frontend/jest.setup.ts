import '@testing-library/jest-dom';
import React from 'react';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  })),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

jest.mock('next/link', () => {
  function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) {
    return React.createElement('a', { href, ...rest }, children);
  }
  MockLink.displayName = 'MockLink';
  return MockLink;
});

jest.mock('next/font/google', () => ({
  PT_Sans: () => ({ style: { fontFamily: 'PT Sans' } }),
}));

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
