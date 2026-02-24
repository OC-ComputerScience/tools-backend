# Tests for Tools Backend

This directory contains tests for the Tools Backend application.

## Test Structure

```
tests/
├── unit/                 # Unit tests for individual functions
│   └── controllers/
│       └── canvas.controller.test.js
├── integration/           # Integration tests for API endpoints
│   └── api/
│       ├── canvas.test.js
│       ├── catalog.test.js
│       └── semester.test.js
├── setup.js             # Test setup file
└── README.md            # This file
```

## Running Tests

### Quick Start

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode (re-runs tests on file changes)
npm run test:watch
```

### Specific Test Suites

```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only Canvas-related tests
npm run test:canvas

# Run only Catalog-related tests
npm run test:catalog

# Run only Semester-related tests
npm run test:semester
```

### Using the Test Runner

```bash
# Show available test commands
node test-runner.js help

# Run all tests with coverage
node test-runner.js all

# Run only Canvas tests
node test-runner.js canvas
```

## Test Coverage

The tests cover:

- **Canvas API endpoints**: Module listing, module items retrieval
- **Catalog API**: CRUD operations for catalogs
- **Semester API**: CRUD operations for semesters
- **Error handling**: Invalid inputs, API failures, database errors
- **Authentication**: Missing API tokens, invalid parameters

## Environment Setup

Tests use environment variables from your `.env` file or defaults:

- `DB_HOST`: Database host (default: localhost)
- `DB_USER`: Database user (default: root)
- `DB_PW`: Database password
- `DB_NAME`: Database name (default: test_db)
- `CANVAS_API_TOKEN`: Canvas API token (required for Canvas tests)
- `CANVAS_DOMAIN`: Canvas domain (default: https://oklahomachristian.beta.instructure.com)

## Mocking

Tests use mocks to:

- **Canvas API**: Mock fetch responses to test error handling
- **Database**: Uses test database or in-memory SQLite
- **Console**: Reduces noise in test output

## Writing New Tests

1. **Unit Tests**: Test individual functions in isolation
   ```javascript
   // tests/unit/controllers/example.test.js
   import controller from '../../../app/controllers/example.controller.js';
   
   describe('Controller Function', () => {
     it('should handle input correctly', async () => {
       const mockReq = { params: { id: '123' } };
       const mockRes = { status: jest.fn(), json: jest.fn() };
       
       await controller.function(mockReq, mockRes);
       
       expect(mockRes.status).toHaveBeenCalledWith(200);
     });
   });
   ```

2. **Integration Tests**: Test full API endpoints
   ```javascript
   // tests/integration/api/example.test.js
   import request from 'supertest';
   import { app } from '../../../server.js';
   
   describe('GET /api/example', () => {
     it('should return data', async () => {
       const response = await request(app)
         .get('/api/example')
         .expect(200);
         
       expect(response.body).toBeDefined();
     });
   });
   ```

## CI/CD Integration

Tests are configured to run in GitHub Actions workflows. The workflow will:

1. Set up test environment
2. Install dependencies
3. Run all tests with coverage
4. Fail the build if any tests fail
5. Upload coverage reports (if configured)

## Troubleshooting

### Tests Fail with "Cannot find module"

Ensure you're running from the project root:
```bash
# From project root
npm test

# Not from inside tests/
cd ../ && npm test
```

### Database Connection Errors

Check your test database configuration in `.env` or ensure the test database exists.

### Canvas API Tests Fail

Ensure `CANVAS_API_TOKEN` is set in your environment variables for tests to run properly.
