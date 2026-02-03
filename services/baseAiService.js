class BaseAIService {
  constructor({ paperlessService, restrictionPromptService, aiSettings } = {}) {
    this.paperlessService = paperlessService;
    this.restrictionPromptService = restrictionPromptService;
    this.settings = aiSettings || {};
  }

  setPaperlessService(paperlessService) {
    this.paperlessService = paperlessService;
  }

  setRestrictionPromptService(restrictionPromptService) {
    this.restrictionPromptService = restrictionPromptService;
  }

  initialize() {
    throw new Error('initialize() not implemented');
  }

  analyzeDocument() {
    throw new Error('analyzeDocument() not implemented');
  }

  analyzePlayground() {
    throw new Error('analyzePlayground() not implemented');
  }

  generateText() {
    throw new Error('generateText() not implemented');
  }

  checkStatus() {
    throw new Error('checkStatus() not implemented');
  }
}

module.exports = BaseAIService;
