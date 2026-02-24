#!/usr/bin/env node

// Simple test runner script
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

console.log('🧪 Running Tests for Tools Backend\n');

// Check if test directory exists
const testDir = path.join(process.cwd(), 'tests');
if (!existsSync(testDir)) {
  console.error('❌ Tests directory not found');
  process.exit(1);
}

// Test commands to run
const testCommands = [
  {
    name: 'Unit Tests',
    command: 'jest tests/unit --verbose',
    description: 'Run unit tests for controllers and models'
  },
  {
    name: 'Integration Tests',
    command: 'jest tests/integration --verbose',
    description: 'Run integration tests for API endpoints'
  },
  {
    name: 'All Tests',
    command: 'jest tests --verbose --coverage',
    description: 'Run all tests with coverage report'
  },
  {
    name: 'Canvas Tests Only',
    command: 'jest tests --testNamePattern="canvas" --verbose',
    description: 'Run only Canvas-related tests'
  },
  {
    name: 'Catalog Tests Only',
    command: 'jest tests --testNamePattern="catalog" --verbose',
    description: 'Run only Catalog-related tests'
  },
  {
    name: 'Semester Tests Only',
    command: 'jest tests --testNamePattern="semester" --verbose',
    description: 'Run only Semester-related tests'
  }
];

// Get command line arguments
const args = process.argv.slice(2);
const testType = args[0] || 'help';

// Help command
if (testType === 'help' || !testCommands.find(cmd => cmd.name.toLowerCase().includes(testType.toLowerCase()))) {
  console.log('📋 Available test commands:\n');
  testCommands.forEach((cmd, index) => {
    console.log(`${index + 1}. ${cmd.name}`);
    console.log(`   Command: npm run test ${cmd.command.replace('jest ', '')}`);
    console.log(`   Description: ${cmd.description}\n`);
  });
  console.log('💡 Usage: node test-runner.js [test-type]');
  console.log('   Or: npm run test [test-type]');
  process.exit(0);
}

// Run the specified test
const selectedTest = testCommands.find(cmd => 
  cmd.name.toLowerCase().includes(testType.toLowerCase()) ||
  cmd.name.toLowerCase().replace(' ', '-') === testType.toLowerCase()
);

if (selectedTest) {
  console.log(`🚀 Running: ${selectedTest.name}`);
  console.log(`📝 Description: ${selectedTest.description}\n`);
  
  try {
    execSync(`npm run test ${selectedTest.command.replace('jest ', '')}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
  } catch (error) {
    console.error(`❌ Tests failed with exit code: ${error.status}`);
    process.exit(error.status);
  }
} else {
  console.error(`❌ Unknown test type: ${testType}`);
  console.log('Run "node test-runner.js help" for available options');
  process.exit(1);
}
