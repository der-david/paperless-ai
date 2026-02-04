const AIServiceFactory = require('./aiServiceFactory');
const PaperlessService = require('./paperlessService');
const DocumentsService = require('./documentsService');
const ChatService = require('./chatService');
const RagService = require('./ragService');
const setupServiceInstance = require('./setupService');
const configServiceInstance = require('./configService');
const ExternalApiService = require('./externalApiService');
const RestrictionPromptService = require('./restrictionPromptService');

class ServiceContainer {
  constructor(config = {}) {
    this.config = config;
    this.instances = new Map();
    this.aiServiceFactory = null;
  }

  getConfig() {
    return this.config;
  }

  getPaperlessService() {
    if (!this.instances.has('paperlessService')) {
      const paperlessConfig = this.config.paperless || {};
      const paperlessSettings = {
        restrictToExisting: this.config.restrictToExisting,
        addAIProcessedTag: this.config.addAIProcessedTag,
        addAIProcessedTags: this.config.addAIProcessedTags,
        filterDocuments: this.config.filterDocuments,
        filterIncludeTags: this.config.filterIncludeTags,
        filterExcludeTags: this.config.filterExcludeTags
      };
      this.instances.set('paperlessService', new PaperlessService({
        apiUrl: paperlessConfig.apiUrl,
        apiToken: paperlessConfig.apiToken,
        settings: paperlessSettings
      }));
    }
    return this.instances.get('paperlessService');
  }

  getRestrictionPromptService() {
    if (!this.instances.has('restrictionPromptService')) {
      this.instances.set('restrictionPromptService', new RestrictionPromptService());
    }
    return this.instances.get('restrictionPromptService');
  }

  getExternalApiService() {
    if (!this.instances.has('externalApiService')) {
      const externalConfig = this.config.externalApiConfig || {};
      const service = new ExternalApiService({
        enabled: externalConfig.enabled,
        url: externalConfig.url,
        method: externalConfig.method,
        headers: externalConfig.headers,
        body: externalConfig.body,
        timeout: externalConfig.timeout,
        transform: externalConfig.transformationTemplate || externalConfig.transform
      });
      this.instances.set('externalApiService', service);
    }
    return this.instances.get('externalApiService');
  }

  _getAIServiceFactory() {
    if (!this.aiServiceFactory) {
      this.aiServiceFactory = new AIServiceFactory({
        paperlessService: this.getPaperlessService(),
        config: this.config,
        restrictionPromptService: this.getRestrictionPromptService()
      });
    }
    return this.aiServiceFactory;
  }

  getAIService() {
    return this._getAIServiceFactory().getService(this.config.aiProvider || 'openai');
  }

  getDocumentsService() {
    if (!this.instances.has('documentsService')) {
      const service = new DocumentsService({
        paperlessService: this.getPaperlessService(),
        paperlessApiUrl: this.config.paperless?.apiUrl
      });
      this.instances.set('documentsService', service);
    }
    return this.instances.get('documentsService');
  }

  getChatService() {
    if (!this.instances.has('chatService')) {
      const openaiConfig = this.config.openai || {};
      const customConfig = this.config.custom || {};
      const azureConfig = this.config.azure || {};
      const ollamaConfig = this.config.ollama || {};
      const service = new ChatService({
        paperlessService: this.getPaperlessService(),
        aiProvider: this.config.aiProvider,
        openaiApiKey: openaiConfig.apiKey,
        openaiModel: openaiConfig.model,
        customApiKey: customConfig.apiKey,
        customApiUrl: customConfig.apiUrl,
        customModel: customConfig.model,
        azureApiKey: azureConfig.apiKey,
        azureEndpoint: azureConfig.endpoint,
        azureDeploymentName: azureConfig.deploymentName,
        azureApiVersion: azureConfig.apiVersion,
        ollamaApiUrl: ollamaConfig.apiUrl,
        ollamaModel: ollamaConfig.model
      });
      this.instances.set('chatService', service);
    }
    return this.instances.get('chatService');
  }

  getRagService() {
    if (!this.instances.has('ragService')) {
      const service = new RagService({
        aiService: this.getAIService(),
        paperlessService: this.getPaperlessService()
      });
      this.instances.set('ragService', service);
    }
    return this.instances.get('ragService');
  }

  getSetupService() {
    if (!this.instances.has('setupService')) {
      this.instances.set('setupService', setupServiceInstance);
    }
    return this.instances.get('setupService');
  }

  getConfigService() {
    if (!this.instances.has('configService')) {
      this.instances.set('configService', configServiceInstance);
    }
    return this.instances.get('configService');
  }
}

module.exports = ServiceContainer;
