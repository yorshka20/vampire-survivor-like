import { PoolMemoryLeakTest } from './PoolMemoryLeakTest';

/**
 * Example usage of the Pool Memory Leak Test
 * Run this to verify that object pool memory leak fixes are working correctly
 */
export function runPoolTests(): void {
  console.log('🚀 Starting Object Pool Memory Leak Tests...\n');

  const test = new PoolMemoryLeakTest();
  const success = test.runAllTests();

  if (success) {
    console.log('\n✅ All tests completed successfully!');
    console.log('🎯 Object pool memory leak fixes are working correctly.');
  } else {
    console.log('\n❌ Some tests failed!');
    console.log('🔧 Please review the object pool implementation.');
  }
}

// Uncomment the line below to run tests when this file is executed
// runPoolTests();
