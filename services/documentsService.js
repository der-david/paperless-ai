class DocumentsService {
  constructor({ paperlessService, paperlessApiUrl } = {}) {
    this.tagCache = new Map();
    this.correspondentCache = new Map();
    this.paperlessService = paperlessService;
    this.paperlessApiUrl = paperlessApiUrl;
  }

  setPaperlessService(paperlessService) {
    this.paperlessService = paperlessService;
  }

  async getTagNames() {
    if (this.tagCache.size === 0) {
      const tags = await this.paperlessService.getTags();
      tags.forEach(tag => {
        this.tagCache.set(tag.id, tag.name);
      });
    }
    return Object.fromEntries(this.tagCache);
  }

  async getCorrespondentNames() {
    if (this.correspondentCache.size === 0) {
      const correspondents = await this.paperlessService.listCorrespondentsNames();
      correspondents.forEach(corr => {
        this.correspondentCache.set(corr.id, corr.name);
      });
    }
    return Object.fromEntries(this.correspondentCache);
  }

  async getDocumentsWithMetadata() {
    const [documents, tagNames, correspondentNames] = await Promise.all([
      this.paperlessService.getDocuments(),
      this.getTagNames(),
      this.getCorrespondentNames()
    ]);

    // Sort documents by created date (newest first)
    documents.sort((a, b) => new Date(b.created) - new Date(a.created));

    return {
      documents,
      tagNames,
      correspondentNames,
      paperlessUrl: (this.paperlessApiUrl || process.env.PAPERLESS_API_URL || '').replace('/api', '')
    };
  }
}

module.exports = DocumentsService;
