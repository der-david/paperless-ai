const {
  truncateValues,
  calculateTokens,
  calculateTotalPromptTokens,
  truncateToTokenLimit,
  writePromptToFile,
  parseCustomFields,
  buildResponseSchema
} = require('./serviceUtils');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const BaseAIService = require('./baseAiService');

class OpenAIService extends BaseAIService {
  constructor({
    paperlessService,
    restrictionPromptService,
    apiKey,
    model,
    systemPromptRole,
    gizmoId,
    aiSettings
  } = {}) {
    super({ paperlessService, restrictionPromptService, aiSettings });
    this.client = null;
    this.apiKey = apiKey;
    this.model = model;
    this.systemPromptRole = systemPromptRole || 'system';
    this.gizmoId = gizmoId;
    this.initialize();
  }

  initialize() {
    if (!this.client && this.apiKey) {
      this.client = new OpenAI({
        apiKey: this.apiKey
      });
    }
  }

  async analyzeDocument(content, existingTags = [], existingCorrespondentList = [], existingDocumentTypesList = [], id, customPrompt = null, externalApiData = null) {
    const cachePath = path.join('./public/images', `${id}.png`);
    try {
      const config = this.settings;
      const now = new Date();
      const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

      const envSystemPrompt = (config.systemPrompt || '').replace(/\\n/g, '\n');
      let systemPrompt = '';
      let promptTags = '';
      const baseModel = this.model || 'gpt-4o-mini';
      const gizmoId = this.gizmoId;
      const model = gizmoId ? `${baseModel}-gizmo-${gizmoId}` : baseModel;
      const modelForTokens = baseModel || model;

      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      // Handle thumbnail caching
      try {
        await fs.access(cachePath);
        console.debug('Thumbnail already cached');
      } catch (err) {
        console.log('Thumbnail not cached, fetching from Paperless');

        const thumbnailData = await this.paperlessService.getThumbnailImage(id);

        if (!thumbnailData) {
          console.warn('Thumbnail nicht gefunden');
        }

        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath, thumbnailData);
      }

      // Format existing tags
      let existingTagsList = existingTags.join(', ');

      // Get external API data if available and validate it
      let validatedExternalApiData = null;

      if (externalApiData) {
        try {
          validatedExternalApiData = await this._validateAndTruncateExternalApiData(externalApiData, 500, modelForTokens);
          console.debug('External API data validated and included');
        } catch (error) {
          console.warn('External API data validation failed:', error.message);
          validatedExternalApiData = null;
        }
      }


      const customFields = parseCustomFields(config.customFields);
      const {
        responseSchema,
        tagsList,
        restrictedDocTypesList,
        allDocTypesList,
        correspondentsList,
        customFieldsStr
      } = buildResponseSchema({
        existingTags,
        existingDocumentTypesList,
        existingCorrespondents: existingCorrespondentList,
        restrictToExistingTags: config.restrictToExisting?.tags,
        restrictToExistingDocumentTypes: config.restrictToExisting?.documentTypes,
        restrictToExistingCorrespondents: config.restrictToExisting?.correspondents,
        limitFunctions: config.limitFunctions,
        includeCustomFieldProperties: true,
        customFields,
        customFieldsDescription: 'Custom fields extracted from the document, fill only if you are sure!'
      });

      if (tagsList.length > 0) {
        console.debug(`Tag enum constraint set with ${tagsList.length} available tags`);
      }

      if (restrictedDocTypesList.length > 0) {
        console.debug(`Document type restricted enum with ${restrictedDocTypesList.length} allowed types`);
      } else if (allDocTypesList.length > 0) {
        console.debug(`Document type enum set with all ${allDocTypesList.length} available types`);
      }

      if (correspondentsList.length > 0) {
        console.debug(`Correspondent restricted enum with ${correspondentsList.length} available correspondents`);
      }

      // Get system prompt and model
      if (config.useExistingData && !config.restrictToExisting?.tags && !config.restrictToExisting?.correspondents) {
        systemPrompt += `
        Pre-existing tags: ${existingTagsList}\n\n
        Pre-existing correspondents: ${existingCorrespondentList}\n\n
        Pre-existing document types: ${existingDocumentTypesList.join(', ')}\n\n
        ` + envSystemPrompt;
        promptTags = '';
      } else {
        systemPrompt += envSystemPrompt;
        promptTags = '';
      }

      // Process placeholder replacements in system prompt
      systemPrompt = this.restrictionPromptService.processRestrictionsInPrompt(
        systemPrompt,
        existingTags,
        existingCorrespondentList,
        existingDocumentTypesList,
        config
      );

      // Include validated external API data if available
      if (validatedExternalApiData) {
        systemPrompt += `\n\nAdditional context from external API:\n${validatedExternalApiData}`;
      }

      if (config.usePromptTags) {
        promptTags = config.promptTags;
        systemPrompt += `
        Take these tags and try to match one or more to the document content.\n\n
        ` + config.specialPromptPreDefinedTags;
      }

      if (customPrompt) {
        console.debug('Replace system prompt with custom prompt via WebHook');
        systemPrompt = customPrompt;
      }

      // Replace %JSON_SCHEMA% placeholder
      // can be used if OpenAI-Middleware does not support response_format
      if (systemPrompt.includes('%JSON_SCHEMA%')) {
        systemPrompt = systemPrompt.replace(/%JSON_SCHEMA%/g, '\n```json\n' + JSON.stringify(responseSchema, null, 2) + '\n```\n');
      } else {
        systemPrompt = systemPrompt + '\n\n' + config.mustHavePrompt;
      }
      systemPrompt = systemPrompt.replace('%CUSTOMFIELDS%', customFieldsStr);

      // Calculate tokens AFTER all prompt modifications are complete
      const totalPromptTokens = await calculateTotalPromptTokens(
        systemPrompt,
        config.usePromptTags ? [promptTags] : [],
        modelForTokens
      );

      const maxTokens = Number(config.tokenLimit);
      const reservedTokens = totalPromptTokens + Number(config.responseTokens);
      const availableTokens = maxTokens - reservedTokens;

      // Validate that we have positive available tokens
      if (availableTokens <= 0) {
        console.warn(`No available tokens for content. Reserved: ${reservedTokens}, Max: ${maxTokens}`);
        throw new Error('Token limit exceeded: prompt too large for available token limit');
      }

      console.debug(`Token calculation - Prompt: ${totalPromptTokens}, Reserved: ${reservedTokens}, Available: ${availableTokens}`);
      console.debug(`Use existing data: ${config.useExistingData}, Restrictions applied based on useExistingData setting`);
      console.debug(`External API data: ${validatedExternalApiData ? 'included' : 'none'}`);

      const contentSourceMode = config.contentSourceMode || 'content';
      const includeContent = contentSourceMode === 'content' || contentSourceMode === 'both';
      const includeRaw = contentSourceMode === 'raw_document' || contentSourceMode === 'both';

      let rawDocText = '';
      let rawDocTokens = 0;
      let rawDocBase64 = '';
      let rawDocContentType = 'application/octet-stream';
      if (includeRaw) {
          const rawDoc = await this.paperlessService.getDocumentFile(id, true);
        const rawBuffer = Buffer.isBuffer(rawDoc.content)
          ? rawDoc.content
          : Buffer.from(rawDoc.content, 'binary');
        rawDocBase64 = rawBuffer.toString('base64');
        rawDocContentType = rawDoc['content-type'] || 'application/octet-stream';
        const rawMeta = `RAW_DOCUMENT_BASE64 (content-type: ${rawDocContentType}, size: ${rawDoc.size || rawBuffer.length} bytes):\n`;
        rawDocText = `${rawMeta}${rawDocBase64}`;
        rawDocTokens = await calculateTokens(
          (config.rawDocumentMode || 'text') === 'text' ? rawDocText : rawDocBase64,
          modelForTokens
        );
      }

      let availableTokensForContent = availableTokens;
      if (includeRaw) {
        if (!includeContent && rawDocTokens > availableTokens) {
          throw new Error('Token limit exceeded: raw document is too large for the configured token limit');
        }
        if (includeContent) {
          availableTokensForContent = availableTokens - rawDocTokens;
          if (availableTokensForContent <= 0) {
            throw new Error('Token limit exceeded: raw document leaves no room for content');
          }
        }
      }

      let truncatedContent = '';
      if (includeContent) {
        truncatedContent = await truncateToTokenLimit(content, availableTokensForContent, modelForTokens);
      }

      const contentToWrite = includeRaw && !includeContent ? rawDocText : truncatedContent;
      await writePromptToFile(systemPrompt, contentToWrite);

      const rawDocumentMode = config.rawDocumentMode || 'text';
      let rawPart = null;
      if (includeRaw) {
        if (rawDocumentMode === 'file') {
          rawPart = {
            type: "file",
            file: {
              filename: `document_${id}`,
              file_data: rawDocBase64
            }
          };
        } else if (rawDocumentMode === 'image') {
          rawPart = {
            type: "image_url",
            image_url: {
              url: `data:${rawDocContentType};base64,${rawDocBase64}`
            }
          };
        } else {
          rawPart = { type: "text", text: rawDocText };
        }
      }

      const userContentParts = [];
      if (includeContent) {
        userContentParts.push({ type: "text", text: truncatedContent });
      }
      if (rawPart) {
        userContentParts.push(rawPart);
      }
      const userContent = userContentParts.length === 1 && userContentParts[0].type === 'text'
        ? userContentParts[0].text
        : userContentParts;

      const apiPayload = {
        model: model,
        messages: [
          {
            role: this.systemPromptRole || 'system', /* https://platform.openai.com/docs/api-reference/chat/create#chat_create-messages-developer_message */
            content: systemPrompt
          },
          {
            role: "user",
            content: userContent
          }
        ],
        ...(model !== 'o3-mini' && { temperature: 0.3 }),
      };

      // Add JSON schema mode if using OpenAI with schema support
      if (baseModel && (baseModel.includes('gpt-5') || baseModel.includes('gpt-4') || baseModel.includes('gpt-3.5'))) {
        apiPayload.response_format = {
          type: "json_schema",
          json_schema: {
            name: "document_analysis",
            schema: responseSchema,
            strict: true
          }
        };
        console.debug('Using structured JSON schema mode for response validation');
      }

      // Retry logic: try up to 3 times if response is null or empty
      let response = null;
      let lastError = null;
      const maxRetries = 3;

      let strippedApiPayload = truncateValues(JSON.parse(JSON.stringify(apiPayload)), 1000);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.debug(`Attempt ${attempt}/${maxRetries}`);

          console.debug(JSON.stringify(strippedApiPayload, null, 2));
          response = await this.client.chat.completions.create(apiPayload);

          // Check if response has content
          if (response?.usage.completion_tokens > 0 && response?.choices?.[0]?.message?.content) {
            console.debug(`Got valid response on attempt ${attempt}/${maxRetries}`);
            break; // Success, exit retry loop
          } else {
            console.warn(`Empty response on attempt ${attempt}/${maxRetries}, retrying...`);
            lastError = new Error('Empty API response');
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            }
          }
        } catch (err) {
          console.warn(`Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
          lastError = err;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          }
        }
      }

      if (!response?.choices?.[0]?.message?.content) {
        throw lastError || new Error('Invalid API response structure after 3 retries');
      }

      console.debug(`[${timestamp}] OpenAI request sent`);
      console.debug(`[${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const usage = response.usage;
      const mappedUsage = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      };

      let parsedResponse;
      try {
        parsedResponse = this.parseAndValidateResponse(response.choices[0].message.content);
        //write to file and append to the file (txt)
        fs.appendFile('./logs/response.txt', response.choices[0].message.content, (err) => {
          if (err) throw err;
        });
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Invalid JSON response from API');
      }

      return {
        document: parsedResponse,
        metrics: mappedUsage,
        truncated: truncatedContent.length < content.length
      };
    } catch (error) {
      console.error('Failed to analyze document:', error);
      return {
        document: { tags: [], correspondent: null },
        metrics: null,
        error: error.message
      };
    }
  }

  /**
   * Validate and truncate external API data to prevent token overflow
   * @param {any} apiData - The external API data to validate
   * @param {number} maxTokens - Maximum tokens allowed for external data (default: 500)
   * @returns {string} - Validated and potentially truncated data string
   */
  async _validateAndTruncateExternalApiData(apiData, maxTokens = 500, model = 'gpt-4o-mini') {
    if (!apiData) {
      return null;
    }

    const dataString = typeof apiData === 'object'
      ? JSON.stringify(apiData, null, 2)
      : String(apiData);

    // Calculate tokens for the data
    const dataTokens = await calculateTokens(dataString, model);

    if (dataTokens > maxTokens) {
      console.warn(`External API data (${dataTokens} tokens) exceeds limit (${maxTokens}), truncating`);
      return await truncateToTokenLimit(dataString, maxTokens, model);
    }

    console.debug(`External API data validated: ${dataTokens} tokens`);
    return dataString;
  }

  async analyzePlayground(content, prompt) {
    const musthavePrompt = `
    Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document.:
        {
          "title": "xxxxx",
          "correspondent": "xxxxxxxx",
          "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
          "document_date": "YYYY-MM-DD",
          "language": "en/de/es/..."
        }`;

    try {
      const config = this.settings;
      const now = new Date();
      const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }

      // Calculate total prompt tokens including musthavePrompt
      const totalPromptTokens = await calculateTotalPromptTokens(
        prompt + musthavePrompt // Combined system prompt
      );

      // Calculate available tokens
      const maxTokens = Number(config.tokenLimit || 128000);
      const reservedTokens = totalPromptTokens + Number(config.responseTokens || 1000); // Reserve for response
      const availableTokens = maxTokens - reservedTokens;

      // Truncate content if necessary
      const model = this.model || 'gpt-4o-mini';
      const truncatedContent = await truncateToTokenLimit(content, availableTokens, model);
      // Make API request
      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: this.systemPromptRole || 'system',
            content: prompt + musthavePrompt
          },
          {
            role: "user",
            content: truncatedContent
          }
        ],
        ...(model !== 'o3-mini' && { temperature: 0.3 }),
      });

      // Handle response
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      // Log token usage
      console.debug(`[${timestamp}] OpenAI request sent`);
      console.debug(`[${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const usage = response.usage;
      const mappedUsage = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      };

      let parsedResponse;
      try {
        parsedResponse = this.parseAndValidateResponse(response.choices[0].message.content);
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Invalid JSON response from API');
      }

      return {
        document: parsedResponse,
        metrics: mappedUsage,
        truncated: truncatedContent.length < content.length
      };
    } catch (error) {
      console.error('Failed to analyze document:', error);
      return {
        document: { tags: [], correspondent: null },
        metrics: null,
        error: error.message
      };
    }
  }

  /**
   * Generate text based on a prompt
   * @param {string} prompt - The prompt to generate text from
   * @returns {Promise<string>} - The generated text
   */
  async generateText(prompt) {
    try {
      const config = this.settings;

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }

      const model = this.model || 'gpt-4o-mini';

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating text with OpenAI:', error);
      throw error;
    }
  }

  async checkStatus() {
    // send test request to OpenAI API and respond with 'ok' or 'error'
    try {
      const config = this.settings;

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }
      const model = this.model || 'gpt-4o-mini';
      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: "Test"
          }
        ],
        temperature: 0.7
      });
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }
      return { status: 'ok', model: model };
    } catch (error) {
      console.error('Error checking OpenAI status:', error);
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = OpenAIService;
