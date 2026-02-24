// Simple test without Jest
import canvasController from './app/controllers/canvas.controller.js';

// Mock fetch
global.fetch = async (url) => {
  console.log(`Mock fetch called with: ${url}`);
  
  if (url.includes('1318') && !process.env.CANVAS_API_TOKEN) {
    throw new Error('Canvas API token not configured');
  }
  
  if (url.includes('invalid')) {
    return {
      ok: false,
      status: 500
    };
  }
  
  return {
    ok: true,
    headers: new Map([['Link', null]]),
    json: async () => [
      {
        id: 3159,
        position: 2,
        name: 'Published Module',
        unlock_at: null,
        require_sequential_progress: false,
        requirement_type: 'all',
        publish_final_grade: false,
        prerequisite_module_ids: [],
        published: true,
        items_count: 5,
        items_url: 'https://oklahomachristian.beta.instructure.com/api/v1/courses/1318/modules/3159/items'
      }
    ]
  };
};

// Test 1: Missing courseId
console.log('Test 1: Missing courseId');
try {
  const mockReq = { params: {} };
  const mockRes = {
    status: (code) => { mockRes.status = code; },
    json: (data) => { mockRes.json = data; },
    send: (data) => { mockRes.send = data; },
    setHeader: () => {}
  };
  
  await canvasController.modules(mockReq, mockRes);
  
  if (mockRes.status === 400 && mockRes.send?.message === "Course ID is required") {
    console.log('✓ Test 1 passed');
  } else {
    console.log('✗ Test 1 failed');
    console.log('  Expected status: 400, got:', mockRes.status);
    console.log('  Expected message: "Course ID is required", got:', mockRes.send?.message);
  }
} catch (error) {
  console.log('✗ Test 1 failed with error:', error.message);
}

// Test 2: Invalid courseId
console.log('\nTest 2: Invalid courseId');
try {
  const mockReq = { params: { courseId: 'invalid' } };
  const mockRes = {
    status: (code) => { mockRes.status = code; },
    json: (data) => { mockRes.json = data; },
    send: (data) => { mockRes.send = data; },
    setHeader: () => {}
  };
  
  await canvasController.modules(mockReq, mockRes);
  
  if (mockRes.status === 400 && mockRes.json?.error === 'Invalid course ID: must be a positive integer') {
    console.log('✓ Test 2 passed');
  } else {
    console.log('✗ Test 2 failed');
    console.log('  Expected status: 400, got:', mockRes.status);
    console.log('  Expected error: "Invalid course ID: must be a positive integer", got:', mockRes.json?.error);
  }
} catch (error) {
  console.log('✗ Test 2 failed with error:', error.message);
}

// Test 3: Missing Canvas API token
console.log('\nTest 3: Missing Canvas API token');
try {
  const originalToken = process.env.CANVAS_API_TOKEN;
  delete process.env.CANVAS_API_TOKEN;
  
  const mockReq = { params: { courseId: '1318' } };
  const mockRes = {
    status: (code) => { mockRes.status = code; },
    json: (data) => { mockRes.json = data; },
    send: (data) => { mockRes.send = data; },
    setHeader: () => {}
  };
  
  await canvasController.modules(mockReq, mockRes);
  
  if (mockRes.status === 500 && mockRes.json?.error === 'Canvas API token not configured') {
    console.log('✓ Test 3 passed');
  } else {
    console.log('✗ Test 3 failed');
    console.log('  Expected status: 500, got:', mockRes.status);
    console.log('  Expected error: "Canvas API token not configured", got:', mockRes.json?.error);
  }
  
  // Restore token
  process.env.CANVAS_API_TOKEN = originalToken;
} catch (error) {
  console.log('✗ Test 3 failed with error:', error.message);
}

console.log('\n✅ All tests completed!');
