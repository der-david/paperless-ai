const OpenAIService = require('./openaiService');
const OllamaService = require('./ollamaService');
const CustomService = require('./customService');
const AzureService = require('./azureService');

class AIServiceFactory {
  constructor({ paperlessService, restrictionPromptService, config } = {}) {
    this.paperlessService = paperlessService;
    this.restrictionPromptService = restrictionPromptService;
    this.config = config || {};
    this.instances = new Map();
  }

  _createService(provider) {
    const aiSettings = this.config.ai || {};

    switch (provider) {
      case 'ollama':
        return new OllamaService({
          paperlessService: this.paperlessService,
          restrictionPromptService: this.restrictionPromptService,
          apiUrl: this.config.ollama?.apiUrl,
          model: this.config.ollama?.model,
          aiSettings
        });
      case 'custom':
        return new CustomService({
          paperlessService: this.paperlessService,
          restrictionPromptService: this.restrictionPromptService,
          apiUrl: this.config.custom?.apiUrl,
          apiKey: this.config.custom?.apiKey,
          model: this.config.custom?.model,
          aiSettings
        });
      case 'azure':
        return new AzureService({
          paperlessService: this.paperlessService,
          restrictionPromptService: this.restrictionPromptService,
          apiKey: this.config.azure?.apiKey,
          endpoint: this.config.azure?.endpoint,
          deploymentName: this.config.azure?.deploymentName,
          apiVersion: this.config.azure?.apiVersion,
          aiSettings
        });
      case 'openai':
      default:
        return new OpenAIService({
          paperlessService: this.paperlessService,
          restrictionPromptService: this.restrictionPromptService,
          apiKey: this.config.openai?.apiKey,
          model: this.config.openai?.model,
          systemPromptRole: this.config.openai?.systemPromptRole,
          gizmoId: this.config.openai?.gizmoId,
          aiSettings
        });
    }
  }

  getService(provider = 'openai') {
    if (!this.instances.has(provider)) {
      this.instances.set(provider, this._createService(provider));
    }
    return this.instances.get(provider);
  }
}

module.exports = AIServiceFactory;
