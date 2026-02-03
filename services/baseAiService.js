class BaseAIService {
  constructor({ paperlessService } = {}) {
    this.paperlessService = paperlessService;
  }

  setPaperlessService(paperlessService) {
    this.paperlessService = paperlessService;
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
