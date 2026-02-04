const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const OpenAIService = require('./openaiService');
const CustomOpenAIService = require('./customService');
const AzureOpenAIService = require('./azureService');
const OllamaService = require('./ollamaService');
const PaperlessService = require('./paperlessService');

class ConfigService {
  static DEFAULTS = {
    PAPERLESS_AI_VERSION: '3.0.9',
    API_KEY: '',
    JWT_SECRET: '',
    PAPERLESS_API_URL: 'http://localhost:8000',
    PAPERLESS_API_TOKEN: '',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: '',
    OPENAI_MODEL: 'gpt-4o-mini',
    OPENAI_GIZMO_ID: '',
    OPENAI_SYSTEM_PROMPT_ROLE: 'system',
    OLLAMA_API_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.2',
    CUSTOM_API_KEY: '',
    CUSTOM_BASE_URL: '',
    CUSTOM_MODEL: '',
    AZURE_ENDPOINT: '',
    AZURE_API_KEY: '',
    AZURE_DEPLOYMENT_NAME: '',
    AZURE_API_VERSION: '',
    AI_TOKEN_LIMIT: 128000,
    AI_RESPONSE_TOKENS: 1000,
    AI_CONTENT_MAX_LENGTH: null,
    AI_CONTENT_SOURCE_MODE: 'content',
    AI_RAW_DOCUMENT_MODE: 'text',
    AI_USE_PROMPT_TAGS: false,
    AI_PROMPT_TAGS: [],
    PROCESSING_ENABLE_JOB: false,
    PROCESSING_ENABLE_WEBHOOK: true,
    PROCESS_ONLY_NEW_DOCUMENTS: true,
    PROCESSING_JOB_INTERVAL: '*/30 * * * *',
    FILTER_DOCUMENTS: true,
    FILTER_INCLUDE_TAGS: ['inbox'],
    FILTER_EXCLUDE_TAGS: ['no-AI'],
    AI_USE_EXISTING_DATA: false,
    ENABLE_TAGS: true,
    ENABLE_CORRESPONDENT: true,
    ENABLE_DOCUMENT_TYPE: true,
    ENABLE_TITLE: true,
    ENABLE_DOCUMENT_DATE: true,
    ENABLE_LANGUAGE: true,
    ENABLE_CONTENT: false,
    ENABLE_CUSTOM_FIELDS: true,
    AI_SYSTEM_PROMPT: `You are a document analysis AI. You will analyze the document.
You take the main information to associate tags with the document.
You will also find the correspondent of the document (Sender not receiver). Also you find a meaningful and short title for the document.
You are given a list of tags: %PROMPT_TAGS%
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
    AI_MUST_HAVE_PROMPT: `Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document.:
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
}`,
    AI_CUSTOM_FIELDS: '{"custom_fields":[]}',
    RESTRICT_TO_EXISTING_TAGS: false,
    RESTRICT_TO_EXISTING_CORRESPONDENTS: false,
    RESTRICT_TO_EXISTING_DOCUMENT_TYPES: false,
    EXTERNAL_API_ENABLED: false,
    EXTERNAL_API_URL: '',
    EXTERNAL_API_METHOD: 'GET',
    EXTERNAL_API_HEADERS: '{}',
    EXTERNAL_API_BODY: '{}',
    EXTERNAL_API_TIMEOUT: 5000,
    EXTERNAL_API_TRANSFORM: '',
    POST_PROCESSING_ADD_TAGS: false,
    POST_PROCESSING_TAGS_TO_ADD: ['ai-processed'],
    POST_PROCESSING_REMOVE_TAGS: false,
    POST_PROCESSING_TAGS_TO_REMOVE: []
  };

  constructor({ envPath } = {}) {
    this.envPath = envPath || path.join(process.cwd(), 'data', '.env');
    this.configured = null;
    this.runtimeConfig = null;
    this.flatConfig = null;
  }

  parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }

  toEnvBoolean(value) {
    return value ? 'true' : 'false';
  }

  normalizeArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').filter(Boolean).map(item => item.trim());
    return [];
  }

  toCamelCase(value) {
    return value.toLowerCase().replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  }

  toSnakeCase(value) {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
      .toUpperCase();
  }

  coerceValueToDefaultType(value, defaultValue) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (defaultValue === null) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }

    if (Array.isArray(defaultValue)) {
      return this.normalizeArray(value);
    }

    switch (typeof defaultValue) {
      case 'boolean':
        return this.parseBoolean(value, defaultValue);
      case 'number': {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? undefined : parsed;
      }
      case 'string':
        return String(value);
      default:
        return value;
    }
  }

  coerceValueWithDefault(value, defaultValue) {
    const resolved = (value === undefined || value === null || value === '') ? defaultValue : value;
    return this.coerceValueToDefaultType(resolved, defaultValue);
  }

  coerceConfigValues(config) {
    Object.entries(ConfigService.DEFAULTS).forEach(([key, defaultValue]) => {
      if (Object.prototype.hasOwnProperty.call(config, key) || key in config) {
        config[key] = this.coerceValueWithDefault(config[key], defaultValue);
      }
    });
    return config;
  }

  isValidOverride(key, value, defaultValue) {
    const typedValue = this.coerceValueToDefaultType(value, defaultValue);
    if (typedValue === undefined) {
      return undefined;
    }

    if (key === 'AI_PROVIDER') {
      const allowed = new Set(['openai', 'ollama', 'custom', 'azure']);
      return allowed.has(String(typedValue)) ? typedValue : undefined;
    }
    if (key === 'AI_CONTENT_SOURCE_MODE') {
      const allowed = new Set(['content', 'raw_document', 'both']);
      return allowed.has(String(typedValue)) ? typedValue : undefined;
    }
    if (key === 'AI_RAW_DOCUMENT_MODE') {
      const allowed = new Set(['text', 'file', 'image']);
      return allowed.has(String(typedValue)) ? typedValue : undefined;
    }

    return typedValue;
  }

  toEnvValue(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'boolean') return this.toEnvBoolean(value);
    if (Array.isArray(value)) return value.join(',');
    return String(value);
  }

  readEnvFileSync() {
    try {
      const envContent = fsSync.readFileSync(this.envPath, 'utf8');
      return dotenv.parse(envContent);
    } catch (error) {
      return {};
    }
  }

  applyOverrides(target, source) {
    Object.entries(ConfigService.DEFAULTS).forEach(([key, defaultValue]) => {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        return;
      }
      const validated = this.isValidOverride(key, source[key], defaultValue);
      if (validated !== undefined) {
        target[key] = validated;
      }
    });
  }

  getMergedConfigSync({ applyToEnv = true } = {}) {
    const mergedConfig = { ...ConfigService.DEFAULTS };

    const fileConfig = this.readEnvFileSync();
    this.applyOverrides(mergedConfig, fileConfig);
    this.applyOverrides(mergedConfig, process.env);

    if (applyToEnv) {
      const envMap = {};
      Object.entries(mergedConfig).forEach(([key, value]) => {
        envMap[key] = this.toEnvValue(value);
      });
      dotenv.populate(process.env, envMap, { override: true });
    }

    this.flatConfig = mergedConfig;
    return mergedConfig;
  }

  async loadConfig() {
    try {
      const envContent = await fs.readFile(this.envPath, 'utf8');
      return dotenv.parse(envContent);
    } catch (error) {
      console.error('Error loading config:', error.message);
      return null;
    }
  }

  buildBaseConfig() {
    const baseConfig = this.getMergedConfigSync();
    if (baseConfig.PAPERLESS_API_URL) {
      baseConfig.PAPERLESS_API_URL = baseConfig.PAPERLESS_API_URL.replace(/\/api\/?$/, '');
    }
    return this.coerceConfigValues({ ...baseConfig });
  }

  mergeSavedConfig(baseConfig, savedConfig) {
    if (!savedConfig) {
      return baseConfig;
    }

    if (savedConfig.PAPERLESS_API_URL) {
      savedConfig.PAPERLESS_API_URL = savedConfig.PAPERLESS_API_URL.replace(/\/api\/?$/, '');
    }

    return this.coerceConfigValues({ ...baseConfig, ...savedConfig });
  }

  buildRuntimeConfig(flatConfig = null) {
    const config = flatConfig || this.getMergedConfigSync();

    const enableUpdates = {
      tags: config.ENABLE_TAGS,
      correspondent: config.ENABLE_CORRESPONDENT,
      documentType: config.ENABLE_DOCUMENT_TYPE,
      title: config.ENABLE_TITLE,
      documentDate: config.ENABLE_DOCUMENT_DATE,
      language: config.ENABLE_LANGUAGE,
      content: config.ENABLE_CONTENT,
      customFields: config.ENABLE_CUSTOM_FIELDS
    };

    const restrictToExisting = {
      tags: config.RESTRICT_TO_EXISTING_TAGS,
      correspondents: config.RESTRICT_TO_EXISTING_CORRESPONDENTS,
      documentTypes: config.RESTRICT_TO_EXISTING_DOCUMENT_TYPES
    };

    const externalApi = {
      enabled: config.EXTERNAL_API_ENABLED,
      url: config.EXTERNAL_API_URL,
      method: config.EXTERNAL_API_METHOD,
      headers: config.EXTERNAL_API_HEADERS,
      body: config.EXTERNAL_API_BODY,
      timeout: config.EXTERNAL_API_TIMEOUT,
      transformationTemplate: config.EXTERNAL_API_TRANSFORM
    };

    const ai = {
      tokenLimit: config.AI_TOKEN_LIMIT,
      responseTokens: config.AI_RESPONSE_TOKENS,
      contentMaxLength: config.AI_CONTENT_MAX_LENGTH,
      contentSourceMode: config.AI_CONTENT_SOURCE_MODE,
      rawDocumentMode: config.AI_RAW_DOCUMENT_MODE,
      customFields: config.AI_CUSTOM_FIELDS,
      useExistingData: config.AI_USE_EXISTING_DATA,
      systemPrompt: config.AI_SYSTEM_PROMPT,
      systemPromptRole: config.OPENAI_SYSTEM_PROMPT_ROLE,
      mustHavePrompt: config.AI_MUST_HAVE_PROMPT,
      usePromptTags: config.AI_USE_PROMPT_TAGS,
      promptTags: config.AI_PROMPT_TAGS
    };

    return {
      version: config.PAPERLESS_AI_VERSION,
      configured: config.CONFIGURED,
      processing: {
        enableJob: config.PROCESSING_ENABLE_JOB,
        enableWebhook: config.PROCESSING_ENABLE_WEBHOOK,
        jobInterval: config.PROCESSING_JOB_INTERVAL,
        filter: {
          enabled: config.FILTER_DOCUMENTS,
          includeTags: config.FILTER_INCLUDE_TAGS,
          excludeTags: config.FILTER_EXCLUDE_TAGS
        }
      },
      postProcessing: {
        addTags: config.POST_PROCESSING_ADD_TAGS,
        tagsToAdd: config.POST_PROCESSING_TAGS_TO_ADD,
        removeTags: config.POST_PROCESSING_REMOVE_TAGS,
        tagsToRemove: config.POST_PROCESSING_TAGS_TO_REMOVE
      },
      externalApi,
      paperless: {
        apiUrl: config.PAPERLESS_API_URL,
        apiToken: config.PAPERLESS_API_TOKEN
      },
      openai: {
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
        systemPromptRole: config.OPENAI_SYSTEM_PROMPT_ROLE,
        gizmoId: config.OPENAI_GIZMO_ID
      },
      ollama: {
        apiUrl: config.OLLAMA_API_URL,
        model: config.OLLAMA_MODEL
      },
      custom: {
        apiUrl: config.CUSTOM_BASE_URL,
        apiKey: config.CUSTOM_API_KEY,
        model: config.CUSTOM_MODEL
      },
      azure: {
        apiKey: config.AZURE_API_KEY,
        endpoint: config.AZURE_ENDPOINT,
        deploymentName: config.AZURE_DEPLOYMENT_NAME,
        apiVersion: config.AZURE_API_VERSION
      },
      aiProvider: config.AI_PROVIDER,
      ai,
      restrictToExisting,
      enableUpdates
    };
  }

  getRuntimeConfig({ refresh = false } = {}) {
    if (!this.runtimeConfig || refresh) {
      const flatConfig = this.getMergedConfigSync();
      this.runtimeConfig = this.buildRuntimeConfig(flatConfig);
    }
    return this.runtimeConfig;
  }

  buildSetupConfigFromRequest({ body, processedPrompt, apiToken, jwtToken, processedCustomFields = [] }) {
    const config = { ...this.getMergedConfigSync({ applyToEnv: false }) };
    const payloadMap = {};
    Object.entries(body || {}).forEach(([key, value]) => {
      payloadMap[this.toSnakeCase(key)] = value;
    });
    this.applyOverrides(config, payloadMap);

    const paperlessApiBaseUrl = (body.paperlessApiUrl || config.PAPERLESS_API_URL || ConfigService.DEFAULTS.PAPERLESS_API_URL)
      .replace(/\/api\/?$/, '');
    config.PAPERLESS_API_URL = `${paperlessApiBaseUrl}/api`;
    if (Object.prototype.hasOwnProperty.call(body, 'paperlessApiToken')) {
      config.PAPERLESS_API_TOKEN = body.paperlessApiToken ?? config.PAPERLESS_API_TOKEN;
    }
    if (processedPrompt !== undefined) {
      config.AI_SYSTEM_PROMPT = processedPrompt;
    }
    config.API_KEY = apiToken || config.API_KEY;
    config.JWT_SECRET = jwtToken || config.JWT_SECRET;
    config.PAPERLESS_AI_INITIAL_SETUP = true;

    if (processedCustomFields.length > 0 || body.aiCustomFields) {
      config.AI_CUSTOM_FIELDS = JSON.stringify({ custom_fields: processedCustomFields });
    }

    return config;
  }

  buildSettingsUpdateFromRequest({ body, currentConfig, processedPrompt, processedCustomFields = [] }) {
    const updatedConfig = {};

    Object.entries(ConfigService.DEFAULTS).forEach(([key, defaultValue]) => {
      const payloadKey = this.toCamelCase(key);
      if (!Object.prototype.hasOwnProperty.call(body, payloadKey)) {
        return;
      }
      const typedValue = this.coerceValueToDefaultType(body[payloadKey], defaultValue);
      if (typedValue !== undefined) {
        updatedConfig[key] = typedValue;
      }
    });

    if (body.paperlessApiUrl) {
      updatedConfig.PAPERLESS_API_URL = body.paperlessApiUrl + '/api';
    }

    if (body.aiSystemPrompt) {
      updatedConfig.AI_SYSTEM_PROMPT = processedPrompt.replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
    }

    if (body.aiContentSourceMode) {
      updatedConfig.AI_CONTENT_SOURCE_MODE = body.aiContentSourceMode;
    }

    if (body.aiRawDocumentMode) {
      updatedConfig.AI_RAW_DOCUMENT_MODE = body.aiRawDocumentMode;
    }

    if (processedCustomFields.length > 0 || body.aiCustomFields) {
      updatedConfig.AI_CUSTOM_FIELDS = JSON.stringify({
        custom_fields: processedCustomFields
      });
    }

    if (body.restrictToExistingTags !== undefined) {
      updatedConfig.RESTRICT_TO_EXISTING_TAGS = this.parseBoolean(body.restrictToExistingTags, ConfigService.DEFAULTS.RESTRICT_TO_EXISTING_TAGS);
    }
    if (body.restrictToExistingCorrespondents !== undefined) {
      updatedConfig.RESTRICT_TO_EXISTING_CORRESPONDENTS = this.parseBoolean(body.restrictToExistingCorrespondents, ConfigService.DEFAULTS.RESTRICT_TO_EXISTING_CORRESPONDENTS);
    }
    if (body.restrictToExistingDocumentTypes !== undefined) {
      updatedConfig.RESTRICT_TO_EXISTING_DOCUMENT_TYPES = this.parseBoolean(body.restrictToExistingDocumentTypes, ConfigService.DEFAULTS.RESTRICT_TO_EXISTING_DOCUMENT_TYPES);
    }

    if (body.externalApiEnabled !== undefined) {
      updatedConfig.EXTERNAL_API_ENABLED = this.parseBoolean(body.externalApiEnabled, ConfigService.DEFAULTS.EXTERNAL_API_ENABLED);
    }
    if (body.externalApiUrl !== undefined) updatedConfig.EXTERNAL_API_URL = body.externalApiUrl || '';
    if (body.externalApiMethod !== undefined) updatedConfig.EXTERNAL_API_METHOD = body.externalApiMethod || ConfigService.DEFAULTS.EXTERNAL_API_METHOD;
    if (body.externalApiHeaders !== undefined) updatedConfig.EXTERNAL_API_HEADERS = body.externalApiHeaders || ConfigService.DEFAULTS.EXTERNAL_API_HEADERS;
    if (body.externalApiBody !== undefined) updatedConfig.EXTERNAL_API_BODY = body.externalApiBody || ConfigService.DEFAULTS.EXTERNAL_API_BODY;
    if (body.externalApiTimeout !== undefined) {
      const timeoutValue = this.coerceValueToDefaultType(body.externalApiTimeout, ConfigService.DEFAULTS.EXTERNAL_API_TIMEOUT);
      if (timeoutValue !== undefined) {
        updatedConfig.EXTERNAL_API_TIMEOUT = timeoutValue;
      }
    }
    if (body.externalApiTransform !== undefined) updatedConfig.EXTERNAL_API_TRANSFORM = body.externalApiTransform || ConfigService.DEFAULTS.EXTERNAL_API_TRANSFORM;

    let apiToken = process.env.API_KEY;
    if (!apiToken) {
      apiToken = require('crypto').randomBytes(64).toString('hex');
      updatedConfig.API_KEY = apiToken;
    }

    return {
      updatedConfig,
      mergedConfig: {
        ...currentConfig,
        ...updatedConfig
      }
    };
  }

  parseCustomFieldsInput(customFields) {
    if (!customFields) {
      return [];
    }

    try {
      const parsedFields = typeof customFields === 'string'
        ? JSON.parse(customFields)
        : customFields;

      const rawFields = Array.isArray(parsedFields?.custom_fields) ? parsedFields.custom_fields : [];
      return rawFields
        .map((field) => {
          const fieldName = field?.name || field?.value;
          const dataType = field?.data_type || field?.type;
          if (!fieldName || !dataType || dataType === 'documentlink') return null;

          const extraData = field.extra_data && typeof field.extra_data === 'object'
            ? { ...field.extra_data }
            : {};

          if (field.currency && !extraData.default_currency) {
            extraData.default_currency = field.currency;
          }

          return {
            name: fieldName,
            data_type: dataType,
            enabled: field.enabled !== undefined ? Boolean(field.enabled) : true,
            description: field.description || '',
            extra_data: extraData
          };
        })
        .filter(Boolean);
    } catch (error) {
      console.error('Error processing custom fields:', error);
      return [];
    }
  }

  async validateAiProviderConfig(config) {
    const aiProvider = config.AI_PROVIDER;

    if (aiProvider === 'openai') {
      return OpenAIService.validateConfig(
        config.OPENAI_API_KEY,
        config.OPENAI_MODEL
      );
    }
    if (aiProvider === 'ollama') {
      return OllamaService.validateConfig(
        config.OLLAMA_API_URL,
        config.OLLAMA_MODEL
      );
    }
    if (aiProvider === 'custom') {
      return CustomOpenAIService.validateConfig(
        config.CUSTOM_BASE_URL,
        config.CUSTOM_API_KEY,
        config.CUSTOM_MODEL
      );
    }
    if (aiProvider === 'azure') {
      return AzureOpenAIService.validateConfig(
        config.AZURE_API_KEY,
        config.AZURE_ENDPOINT,
        config.AZURE_DEPLOYMENT_NAME,
        config.AZURE_API_VERSION
      );
    }

    return false;
  }

  async validateConfig(config) {
    const paperlessService = new PaperlessService({
      apiUrl: config.PAPERLESS_API_URL,
      apiToken: config.PAPERLESS_API_TOKEN
    });
    const paperlessValid = await paperlessService.validateConfig();

    if (!paperlessValid) {
      throw new Error('Invalid Paperless configuration');
    }

    const isConfigured = this.parseBoolean(config.CONFIGURED, false);
    if (!isConfigured) {
      const aiValid = await this.validateAiProviderConfig(config);
      if (!aiValid) {
        throw new Error('Invalid AI provider configuration');
      }
    }

    return true;
  }

  async saveConfig(config) {
    try {
      await this.validateConfig(config);

      const dataDir = path.dirname(this.envPath);
      await fs.mkdir(dataDir, { recursive: true });

      const envContent = Object.entries(config)
        .map(([key, value]) => {
          if (key === "AI_SYSTEM_PROMPT" || key === "AI_MUST_HAVE_PROMPT") {
            return `${key}="${value}"`;
          }
          return `${key}=${value}`;
        })
        .join('\n');

      await fs.writeFile(this.envPath, envContent);

      const envMap = {};
      Object.entries(config).forEach(([key, value]) => {
        envMap[key] = this.toEnvValue(value);
      });
      dotenv.populate(process.env, envMap, { override: true });
      this.runtimeConfig = null;
      this.flatConfig = null;
    } catch (error) {
      console.error('Error saving config:', error.message);
      throw error;
    }
  }

  async isConfigured() {
    if (this.configured !== null) {
      return this.configured;
    }

    const maxAttempts = 60;
    const delayBetweenAttempts = 5000;
    let attempts = 0;

    try {
      await fs.access(this.envPath, fs.constants.F_OK);
      const config = await this.loadConfig();
      if (!config || !config.PAPERLESS_API_URL) {
        this.configured = false;
        return false;
      }
    } catch (error) {
      console.error('Error checking initial configuration:', error.message);
      this.configured = false;
      return false;
    }

    const attemptConfiguration = async () => {
      try {
        const dataDir = path.dirname(this.envPath);
        try {
          await fs.access(dataDir, fs.constants.F_OK);
        } catch (err) {
          await fs.mkdir(dataDir, { recursive: true });
        }

        const config = await this.loadConfig();
        if (!config) {
          throw new Error('Failed to load configuration');
        }

        await this.validateConfig(config);
        this.configured = true;
        return true;
      } catch (error) {
        console.error('Configuration attempt failed:', error.message);
        throw error;
      }
    };

    while (attempts < maxAttempts) {
      try {
        const result = await attemptConfiguration();
        return result;
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          console.error('Max configuration attempts reached. Final error:', error.message);
          this.configured = false;
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }

    this.configured = false;
    return false;
  }
}

module.exports = new ConfigService();
