const OpenAIService = require('./openaiService');
const OllamaService = require('./ollamaService');
const CustomService = require('./customService');
const AzureService = require('./azureService');

class AIServiceFactory {
  constructor({ paperlessService, config } = {}) {
    this.paperlessService = paperlessService;
    this.config = config || {};
    this.instances = new Map();
  }

  _createService(provider) {
    switch (provider) {
      case 'ollama':
        return new OllamaService({
          paperlessService: this.paperlessService,
          defaults: {
            apiUrl: this.config.ollama?.apiUrl,
            model: this.config.ollama?.model,
            tokenLimit: this.config.tokenLimit
          }
        });
      case 'custom':
        return new CustomService({
          paperlessService: this.paperlessService,
          defaults: {
            model: this.config.custom?.model
          }
        });
      case 'azure':
        return new AzureService({
          paperlessService: this.paperlessService,
          defaults: {
            deploymentName: this.config.azure?.deploymentName
          }
        });
      case 'openai':
      default:
        return new OpenAIService({
          paperlessService: this.paperlessService,
          defaults: {
            model: this.config.openai?.model,
            systemPromptRole: this.config.openai?.systemPromptRole
          }
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
