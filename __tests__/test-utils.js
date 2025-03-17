// test-utils.js
// Helper functions for tests

// Simple test utilities, moved here so they're not picked up as a test suite
const createMockElement = (type, attributes = {}) => {
    const element = document.createElement(type);
    Object.entries(attributes).forEach(([key, value]) => {
      element[key] = value;
    });
    return element;
  };
  
  // Export utilities
  module.exports = {
    createMockElement
  };