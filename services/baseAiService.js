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

  parseAndValidateResponse(input, { requireTags = true } = {}) {
    const parsed = typeof input === 'string' ? this._parseJsonFromText(input) : input;
    const normalized = this._extractSchemaData(parsed);

    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
      throw new Error('Invalid response structure: not an object');
    }

    if (requireTags) {
      if (!Array.isArray(normalized.tags)) {
        if (typeof normalized.tags === 'string') {
          normalized.tags = normalized.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
        } else {
          normalized.tags = [];
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(normalized, 'document_type')) {
      if (normalized.document_type !== null && typeof normalized.document_type !== 'string') {
        normalized.document_type = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(normalized, 'correspondent')) {
      if (normalized.correspondent !== null && typeof normalized.correspondent !== 'string') {
        normalized.correspondent = null;
      }
    }

    return normalized;
  }

  _parseJsonFromText(text) {
    if (typeof text !== 'string') {
      throw new Error('Invalid JSON response from API');
    }

    const cleaned = this._extractJsonString(text);
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      const sanitized = cleaned
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

      try {
        return JSON.parse(sanitized);
      } catch (finalError) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Invalid JSON response from API');
      }
    }
  }

  _extractJsonString(text) {
    const trimmed = text.trim();

    const jsonTagMatch = trimmed.match(/<json>([\s\S]*?)<\/json>/i);
    if (jsonTagMatch && jsonTagMatch[1]) {
      return jsonTagMatch[1].trim();
    }

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1).trim();
    }

    return trimmed;
  }

  _extractSchemaData(parsedResponse) {
    if (
      parsedResponse &&
      typeof parsedResponse === 'object' &&
      parsedResponse.properties &&
      typeof parsedResponse.properties === 'object'
    ) {
      const props = parsedResponse.properties;
      const looksLikeData =
        Array.isArray(props.tags) ||
        typeof props.title === 'string' ||
        typeof props.correspondent === 'string' ||
        typeof props.document_type === 'string' ||
        typeof props.document_date === 'string' ||
        typeof props.language === 'string' ||
        typeof props.content === 'string' ||
        typeof props.custom_fields === 'object';
      if (looksLikeData) {
        return props;
      }
    }
    return parsedResponse;
  }
}

module.exports = BaseAIService;
