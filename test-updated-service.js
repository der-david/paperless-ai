/**
 * Test script to verify the updated restriction prompt service functionality
 */
const RestrictionPromptService = require('./services/restrictionPromptService');

// Mock data for testing
const existingTags = [
  { name: 'invoice' },
  { name: 'receipt' },
  { name: 'contract' },
  { name: 'urgent' }
];

const existingCorrespondents = ['John Doe', 'ACME Corp', 'Tax Office'];

const existingDocumentTypes = ['Invoice', 'Receipt', 'Contract', 'Memo'];

const config = {
  useExistingData: 'yes',
  restrictToExistingTags: 'yes',
  restrictToExistingCorrespondents: 'yes',
  restrictToExistingDocumentTypes: 'yes'
};

console.info('=== Updated Restriction Prompt Service Test ===\n');

// Test 1: Prompt with placeholders
console.info('Test 1: Prompt with placeholders');
const promptWithPlaceholders = `You are a document analysis AI.
Available tags: %RESTRICTED_TAGS%
Available correspondents: %RESTRICTED_CORRESPONDENTS%
Available document types: %RESTRICTED_DOCUMENT_TYPES%
Please analyze the document accordingly.`;

const result1 = RestrictionPromptService.processRestrictionsInPrompt(
  promptWithPlaceholders,
  existingTags,
  existingCorrespondents,
  existingDocumentTypes,
  config
);

console.info('Original prompt:');
console.info(promptWithPlaceholders);
console.info('\nProcessed prompt:');
console.info(result1);
console.info('\nType of result:', typeof result1);

console.info('\n' + '='.repeat(50) + '\n');

// Test 2: Prompt without placeholders
console.info('Test 2: Prompt without placeholders');
const promptWithoutPlaceholders = `You are a document analysis AI. Please analyze the document.`;

const result2 = RestrictionPromptService.processRestrictionsInPrompt(
  promptWithoutPlaceholders,
  existingTags,
  existingCorrespondents,
  existingDocumentTypes,
  config
);

console.info('Original prompt:');
console.info(promptWithoutPlaceholders);
console.info('\nProcessed prompt:');
console.info(result2);
console.info('\nType of result:', typeof result2);

console.info('\n' + '='.repeat(50) + '\n');

// Test 3: Empty data with placeholders
console.info('Test 3: Empty data with placeholders');
const result3 = RestrictionPromptService.processRestrictionsInPrompt(
  promptWithPlaceholders,
  [],
  [],
  [],
  config
);

console.info('Original prompt:');
console.info(promptWithPlaceholders);
console.info('\nProcessed prompt (with empty data):');
console.info(result3);
console.info('\nType of result:', typeof result3);

console.info('\n=== Test Complete ===');
