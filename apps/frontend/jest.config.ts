import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/test/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    '/node_modules/(?!(@chakra-ui|@ark-ui|@zag-js|@floating-ui|react-remove-scroll|@pandacss)/).*/',
  ],
};

export default createJestConfig(config);
