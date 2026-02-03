const AIServiceFactory = require('./aiServiceFactory');
const PaperlessService = require('./paperlessService');
const DocumentsService = require('./documentsService');
const ChatService = require('./chatService');
const RagService = require('./ragService');
const setupServiceInstance = require('./setupService');

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
      this.instances.set('paperlessService', new PaperlessService(this.config));
    }
    return this.instances.get('paperlessService');
  }

  _getAIServiceFactory() {
    if (!this.aiServiceFactory) {
      this.aiServiceFactory = new AIServiceFactory({
        paperlessService: this.getPaperlessService(),
        config: this.config
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
      const service = new ChatService({
        paperlessService: this.getPaperlessService()
      });
      this.instances.set('chatService', service);
    }
    return this.instances.get('chatService');
  }

  getRagService() {
    if (!this.instances.has('ragService')) {
      const service = new RagService({
        aiService: this.getAIService(),
        paperlessService: this.getPaperlessService(),
        serviceConfig: this.config
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
}

module.exports = ServiceContainer;
