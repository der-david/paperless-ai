const path = require('path');
const currentDir = decodeURIComponent(process.cwd());
const envPath = path.join(currentDir, 'data', '.env');
console.log('Loading .env from:', envPath); // Debug log
require('dotenv').config({ path: envPath });

// Helper function to parse boolean-like env vars
const parseEnvBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

// Initialize update enablement flags with defaults
const enableUpdates = {
  tags: parseEnvBoolean(process.env.ENABLE_TAGS, true),
  correspondent: parseEnvBoolean(process.env.ENABLE_CORRESPONDENT, true),
  documentType: parseEnvBoolean(process.env.ENABLE_DOCUMENT_TYPE, true),
  title: parseEnvBoolean(process.env.ENABLE_TITLE, true),
  documentDate: parseEnvBoolean(process.env.ENABLE_DOCUMENT_DATE, true),
  language: parseEnvBoolean(process.env.ENABLE_LANGUAGE, true),
  content: parseEnvBoolean(process.env.ENABLE_CONTENT, false),
  customFields: parseEnvBoolean(process.env.ENABLE_CUSTOM_FIELDS, true)
};

// Initialize AI restrictions with defaults
const restrictToExisting = {
  tags: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_TAGS, false),
  correspondents: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_CORRESPONDENTS, false),
  documentTypes: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_DOCUMENT_TYPES, false)
};

console.log('Loaded restriction settings:', {
  RESTRICT_TO_EXISTING_TAGS: restrictToExisting.tags,
  RESTRICT_TO_EXISTING_CORRESPONDENTS: restrictToExisting.correspondents,
  RESTRICT_TO_EXISTING_DOCUMENT_TYPES: restrictToExisting.documentTypes
});

// Initialize external API configuration
const externalApiConfig = {
  enabled: parseEnvBoolean(process.env.EXTERNAL_API_ENABLED, false),
  url: process.env.EXTERNAL_API_URL || '',
  method: process.env.EXTERNAL_API_METHOD || 'GET',
  headers: process.env.EXTERNAL_API_HEADERS || '{}',
  body: process.env.EXTERNAL_API_BODY || '{}',
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || '5000', 10),
  transformationTemplate: process.env.EXTERNAL_API_TRANSFORM || ''
};

const ai = {
  tokenLimit: process.env.AI_TOKEN_LIMIT || 128000,
  responseTokens: process.env.AI_RESPONSE_TOKENS || 1000,
  contentMaxLength: process.env.AI_CONTENT_MAX_LENGTH ? parseInt(process.env.AI_CONTENT_MAX_LENGTH, 10) : null,
  contentSourceMode: process.env.AI_CONTENT_SOURCE_MODE || 'content',
  rawDocumentMode: process.env.AI_RAW_DOCUMENT_MODE || 'text',
  customFields: process.env.AI_CUSTOM_FIELDS || '',
  useExistingData: parseEnvBoolean(process.env.AI_USE_EXISTING_DATA, false),
  systemPrompt: process.env.AI_SYSTEM_PROMPT || '',
  usePromptTags: parseEnvBoolean(process.env.AI_USE_PROMPT_TAGS, false),
  promptTags: process.env.AI_PROMPT_TAGS || '',
  enableUpdates,
  restrictToExisting,
  specialPromptPreDefinedTags: `You are a document analysis AI. You will analyze the document.
  You take the main information to associate tags with the document.
  You will also find the correspondent of the document (Sender not receiver). Also you find a meaningful and short title for the document.
  You are given a list of tags: ${process.env.AI_PROMPT_TAGS}
  Only use the tags from the list and try to find the best fitting tags.
  You do not ask for additional information, you only use the information given in the document.

  Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document.:
  {
    "title": "xxxxx",
    "content": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/..."
  }`,
  mustHavePrompt: `  Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document.:
  IMPORTANT: The custom_fields are optional and can be left out if not needed, only try to fill out the values if you find a matching information in the document.
  Do not change the value of field_name, only fill out the values. If the field is about money only add the number without currency and always use a . for decimal places.
  When selecting a document_type, ONLY choose from the provided restricted list if available: %RESTRICTED_DOCUMENT_TYPES%
  {
    "title": "xxxxx",
    "content": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_type": "Invoice/Contract/...",
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/...",
    %CUSTOMFIELDS%
  }`
};

console.log('Loaded environment variables:', {
  PAPERLESS_API_URL: process.env.PAPERLESS_API_URL,
  PAPERLESS_API_TOKEN: '******',
  ENABLE_UPDATES: enableUpdates,
  AI_RESTRICTIONS: restrictToExisting,
  EXTERNAL_API: externalApiConfig.enabled ? 'enabled' : 'disabled'
});

module.exports = {
  PAPERLESS_AI_VERSION: '3.0.9',
  CONFIGURED: false,
  disableAutomaticProcessing: parseEnvBoolean(process.env.DISABLE_AUTOMATIC_PROCESSING, false),
  filterDocuments: parseEnvBoolean(process.env.FILTER_DOCUMENTS, false),
  addAIProcessedTag: parseEnvBoolean(process.env.ADD_AI_PROCESSED_TAG, false),
  addAIProcessedTags: process.env.AI_PROCESSED_TAG_NAME || 'ai-processed',
  // External API config
  externalApiConfig: externalApiConfig,
  paperless: {
    apiUrl: process.env.PAPERLESS_API_URL,
    apiToken: process.env.PAPERLESS_API_TOKEN
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    systemPromptRole: process.env.OPENAI_SYSTEM_PROMPT_ROLE || 'system',
    gizmoId: process.env.OPENAI_GIZMO_ID || ''
  },
  ollama: {
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2'
  },
  custom: {
    apiUrl: process.env.CUSTOM_BASE_URL || '',
    apiKey: process.env.CUSTOM_API_KEY || '',
    model: process.env.CUSTOM_MODEL || ''
  },
  azure: {
    apiKey: process.env.AZURE_API_KEY || '',
    endpoint: process.env.AZURE_ENDPOINT || '',
    deploymentName: process.env.AZURE_DEPLOYMENT_NAME || '',
    apiVersion: process.env.AZURE_API_VERSION || '2023-05-15'
  },
  aiProvider: process.env.AI_PROVIDER || 'openai',
  scanInterval: process.env.SCAN_INTERVAL || '*/30 * * * *',
  filterIncludeTags: process.env.FILTER_INCLUDE_TAGS || 'inbox',
  filterExcludeTags: process.env.FILTER_EXCLUDE_TAGS || 'no-AI',
  ai,
  // AI restrictions config
  restrictToExisting,
  // Add update enablement flags to config
  enableUpdates,
};
