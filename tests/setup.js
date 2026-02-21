// Test setup file
import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_USER = process.env.TEST_DB_USER || 'root';
process.env.DB_PW = process.env.TEST_DB_PW || '';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'test_db';
process.env.CANVAS_API_TOKEN = 'test-token';
process.env.CANVAS_DOMAIN = 'https://test-canvas.example.com';

// Global test timeout
global.setTimeout = setTimeout;

// Mock console methods to reduce noise in tests
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock fetch globally if needed
global.fetch = jest.fn();

// Clean up after all tests
afterAll(() => {
  // Restore console methods
  global.console = originalConsole;
});
