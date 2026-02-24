// Unit tests for canvas controller
import { jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn();

// Simple test runner
function runTest(name, testFn) {
  console.log(`Running test: ${name}`);
  try {
    testFn();
    console.log(`✓ ${name} passed`);
  } catch (error) {
    console.error(`✗ ${name} failed: ${error.message}`);
    throw error; // Re-throw instead of process.exit
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Import controller dynamically
let canvasController;
describe('Canvas Controller Unit Tests', () => {
  beforeAll(async () => {
    canvasController = (await import('../../../app/controllers/canvas.controller.js')).default;
  });

  test('should return 400 when courseId is missing', async () => {
    const mockReq = { params: {} };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
    
    await canvasController.modules(mockReq, mockRes);
    
    assert(mockRes.status.mock.calls.length > 0, 'Expected status to be called');
    assert(mockRes.status.mock.calls[0][0] === 400, 'Expected status 400');
    assert(mockRes.send.mock.calls.length > 0, 'Expected send to be called');
    assert(mockRes.send.mock.calls[0][0].message === "Course ID is required", 'Expected error message');
  });

  test('should return 400 when courseId is invalid (non-numeric)', async () => {
    const mockReq = { params: { courseId: 'invalid' } };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
    
    await canvasController.modules(mockReq, mockRes);
    
    assert(mockRes.status.mock.calls.length > 0, 'Expected status to be called');
    assert(mockRes.status.mock.calls[0][0] === 400, 'Expected status 400');
    assert(mockRes.json.mock.calls.length > 0, 'Expected json to be called');
    assert(mockRes.json.mock.calls[0][0].error === 'Invalid course ID: must be a positive integer', 'Expected error message');
  });

  test('should return 500 when Canvas API token is missing', async () => {
    const originalToken = process.env.CANVAS_API_TOKEN;
    delete process.env.CANVAS_API_TOKEN;
    
    const mockReq = { params: { courseId: '1318' } };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
    
    await canvasController.modules(mockReq, mockRes);
    
    assert(mockRes.status.mock.calls.length > 0, 'Expected status to be called');
    assert(mockRes.status.mock.calls[0][0] === 500, 'Expected status 500');
    assert(mockRes.json.mock.calls.length > 0, 'Expected json to be called');
    assert(mockRes.json.mock.calls[0][0].error === 'Canvas API token not configured', 'Expected error message');
    
    // Restore token
    process.env.CANVAS_API_TOKEN = originalToken;
  });
});
