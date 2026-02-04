const fs = require('fs').promises;
const path = require('path');
const OpenAIService = require('./openaiService');
const CustomOpenAIService = require('./customService');
const AzureOpenAIService = require('./azureService');
const OllamaService = require('./ollamaService');
const PaperlessService = require('./paperlessService');

class ConfigService {
  static DEFAULTS = {
    PAPERLESS_API_URL: 'http://localhost:8000',
    PAPERLESS_API_TOKEN: '',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: '',
    OPENAI_MODEL: 'gpt-4o-mini',
    OPENAI_GIZMO_ID: '',
    OLLAMA_API_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.2',
    SCAN_INTERVAL: '*/30 * * * *',
    AI_SYSTEM_PROMPT: '',
    FILTER_DOCUMENTS: false,
    FILTER_INCLUDE_TAGS: ['inbox'],
    FILTER_EXCLUDE_TAGS: ['no-AI'],
    AI_TOKEN_LIMIT: 128000,
    AI_RESPONSE_TOKENS: 1000,
    AI_CONTENT_SOURCE_MODE: 'content',
    AI_RAW_DOCUMENT_MODE: 'text',
    ADD_AI_PROCESSED_TAG: false,
    AI_PROCESSED_TAG_NAME: 'ai-processed',
    AI_USE_PROMPT_TAGS: false,
    AI_PROMPT_TAGS: [],
    AI_CUSTOM_FIELDS: '{"custom_fields":[]}',
    PAPERLESS_AI_VERSION: ' ',
    PROCESS_ONLY_NEW_DOCUMENTS: true,
    AI_USE_EXISTING_DATA: false,
    ENABLE_AUTOMATIC_PROCESSING: false,
    ENABLE_TAGS: true,
    ENABLE_CORRESPONDENT: true,
    ENABLE_DOCUMENT_TYPE: true,
    ENABLE_TITLE: true,
    ENABLE_DOCUMENT_DATE: true,
    ENABLE_LANGUAGE: true,
    ENABLE_CONTENT: false,
    ENABLE_CUSTOM_FIELDS: true,
    CUSTOM_API_KEY: '',
    CUSTOM_BASE_URL: '',
    CUSTOM_MODEL: '',
    AZURE_ENDPOINT: '',
    AZURE_API_KEY: '',
    AZURE_DEPLOYMENT_NAME: '',
    AZURE_API_VERSION: '',
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
    API_KEY: '',
    JWT_SECRET: ''
  };

  constructor({ envPath } = {}) {
    this.envPath = envPath || path.join(process.cwd(), 'data', '.env');
    this.configured = null;
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

  async loadConfig() {
    try {
      const envContent = await fs.readFile(this.envPath, 'utf8');
      const config = {};
      envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          config[key.trim()] = value.trim();
        }
      });
      return config;
    } catch (error) {
      console.error('Error loading config:', error.message);
      return null;
    }
  }

  buildBaseConfig(configFile) {
    const baseConfig = {};
    Object.entries(ConfigService.DEFAULTS).forEach(([key, defaultValue]) => {
      baseConfig[key] = this.coerceValueWithDefault(process.env[key], defaultValue);
    });

    baseConfig.PAPERLESS_API_URL = (baseConfig.PAPERLESS_API_URL || ConfigService.DEFAULTS.PAPERLESS_API_URL).replace(/\/api$/, '');
    baseConfig.PAPERLESS_AI_VERSION = configFile?.PAPERLESS_AI_VERSION || ConfigService.DEFAULTS.PAPERLESS_AI_VERSION;

    return this.coerceConfigValues(baseConfig);
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

  buildSetupConfigFromRequest({ body, processedPrompt, apiToken, jwtToken, processedCustomFields = [] }) {
    const config = {};

    Object.entries(ConfigService.DEFAULTS).forEach(([key, defaultValue]) => {
      const payloadKey = this.toCamelCase(key);
      if (Object.prototype.hasOwnProperty.call(body, payloadKey)) {
        config[key] = this.coerceValueWithDefault(body[payloadKey], defaultValue);
      } else {
        config[key] = defaultValue;
      }
    });

    const paperlessApiBaseUrl = (body.paperlessApiUrl || ConfigService.DEFAULTS.PAPERLESS_API_URL).replace(/\/api\/?$/, '');
    config.PAPERLESS_API_URL = `${paperlessApiBaseUrl}/api`;
    config.PAPERLESS_API_TOKEN = body.paperlessApiToken ?? ConfigService.DEFAULTS.PAPERLESS_API_TOKEN;
    config.AI_PROVIDER = body.aiProvider || ConfigService.DEFAULTS.AI_PROVIDER;
    config.SCAN_INTERVAL = body.scanInterval || ConfigService.DEFAULTS.SCAN_INTERVAL;
    if (processedPrompt !== undefined) {
      config.AI_SYSTEM_PROMPT = processedPrompt;
    }
    config.API_KEY = apiToken || config.API_KEY;
    config.JWT_SECRET = jwtToken || config.JWT_SECRET;
    config.OPENAI_GIZMO_ID = body.openaiGizmoId || ConfigService.DEFAULTS.OPENAI_GIZMO_ID;
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
          if (key === "AI_SYSTEM_PROMPT") {
            return `${key}="${value}"`;
          }
          return `${key}=${value}`;
        })
        .join('\n');

      await fs.writeFile(this.envPath, envContent);

      Object.entries(config).forEach(([key, value]) => {
        process.env[key] = value;
      });
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
