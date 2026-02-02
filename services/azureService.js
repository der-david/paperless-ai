const {
  calculateTokens,
  calculateTotalPromptTokens,
  truncateToTokenLimit,
  writePromptToFile
} = require('./serviceUtils');
const OpenAI = require('openai');
const AzureOpenAI = require('openai').AzureOpenAI;
const config = require('../config/config');
const paperlessService = require('./paperlessService');
const fs = require('fs').promises;
const path = require('path');
const RestrictionPromptService = require('./restrictionPromptService');

function extractSchemaData(parsedResponse) {
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

class AzureOpenAIService {
  constructor() {
    this.client = null;
  }

  initialize() {
    if (!this.client && config.aiProvider === 'azure') {
      this.client = new AzureOpenAI({
        apiKey: config.azure.apiKey,
        endpoint: config.azure.endpoint,
        deploymentName: config.azure.deploymentName,
        apiVersion: config.azure.apiVersion
      });
    }
  }

  async analyzeDocument(content, existingTags = [], existingCorrespondentList = [], existingDocumentTypesList = [], id, customPrompt = null, options = {}) {
    const cachePath = path.join('./public/images', `${id}.png`);
    try {
      this.initialize();
      const now = new Date();
      const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

      if (!this.client) {
        throw new Error('AzureOpenAI client not initialized');
      }

      // Handle thumbnail caching
      try {
        await fs.access(cachePath);
        console.log('[DEBUG] Thumbnail already cached');
      } catch (err) {
        console.log('Thumbnail not cached, fetching from Paperless');

        const thumbnailData = await paperlessService.getThumbnailImage(id);

        if (!thumbnailData) {
          console.warn('Thumbnail nicht gefunden');
        }

        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath, thumbnailData);
      }

      // Format existing tags
      let existingTagsList = existingTags.join(', ');

      // Get external API data if available and validate it
      let externalApiData = options.externalApiData || null;
      let validatedExternalApiData = null;

      if (externalApiData) {
        try {
          validatedExternalApiData = await this._validateAndTruncateExternalApiData(externalApiData);
          console.log('[DEBUG] External API data validated and included');
        } catch (error) {
          console.warn('[WARNING] External API data validation failed:', error.message);
          validatedExternalApiData = null;
        }
      }

      let systemPrompt = '';
      let promptTags = '';
      const model = process.env.AZURE_DEPLOYMENT_NAME;

      // Parse CUSTOM_FIELDS from environment variable
      let customFieldsObj;
      try {
        customFieldsObj = JSON.parse(process.env.CUSTOM_FIELDS);
      } catch (error) {
        console.error('Failed to parse CUSTOM_FIELDS:', error);
        customFieldsObj = { custom_fields: [] };
      }

      // Generate custom fields template for the prompt
      const customFieldsTemplate = {};

      customFieldsObj.custom_fields.forEach((field, index) => {
        customFieldsTemplate[index] = {
          field_name: field.value,
          value: "Fill in the value based on your analysis"
        };
      });

      // Convert template to string for replacement and wrap in custom_fields
      const customFieldsStr = '"custom_fields": ' + JSON.stringify(customFieldsTemplate, null, 2)
        .split('\n')
        .map(line => '    ' + line)  // Add proper indentation
        .join('\n');

      // Get system prompt and model
      if (config.useExistingData === 'yes' && config.restrictToExistingTags === 'no' && config.restrictToExistingCorrespondents === 'no') {
        systemPrompt += `
        Pre-existing tags: ${existingTagsList}\n\n
        Pre-existing correspondents: ${existingCorrespondentList}\n\n
        Pre-existing document types: ${existingDocumentTypesList.join(', ')}\n\n
        ` + process.env.SYSTEM_PROMPT + '\n\n' + config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
        promptTags = '';
      } else {
        config.mustHavePrompt = config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
        systemPrompt += process.env.SYSTEM_PROMPT + '\n\n' + config.mustHavePrompt;
        promptTags = '';
      }

      // Process placeholder replacements in system prompt
      systemPrompt = RestrictionPromptService.processRestrictionsInPrompt(
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

      if (process.env.USE_PROMPT_TAGS === 'yes') {
        promptTags = process.env.PROMPT_TAGS;
        systemPrompt = `
        Take these tags and try to match one or more to the document content.\n\n
        ` + config.specialPromptPreDefinedTags;
      }

      if (customPrompt) {
        console.log('[DEBUG] Replace system prompt with custom prompt via WebHook');
        systemPrompt = customPrompt + '\n\n' + config.mustHavePrompt;
      }

      // Calculate tokens AFTER all prompt modifications are complete
      const totalPromptTokens = await calculateTotalPromptTokens(
        systemPrompt,
        process.env.USE_PROMPT_TAGS === 'yes' ? [promptTags] : [],
        model
      );

      const maxTokens = Number(config.tokenLimit);
      const reservedTokens = totalPromptTokens + Number(config.responseTokens);
      const availableTokens = maxTokens - reservedTokens;

      // Validate that we have positive available tokens
      if (availableTokens <= 0) {
        console.warn(`[WARNING] No available tokens for content. Reserved: ${reservedTokens}, Max: ${maxTokens}`);
        throw new Error('Token limit exceeded: prompt too large for available token limit');
      }

      console.log(`[DEBUG] Token calculation - Prompt: ${totalPromptTokens}, Reserved: ${reservedTokens}, Available: ${availableTokens}`);
      console.log(`[DEBUG] Use existing data: ${config.useExistingData}, Restrictions applied based on useExistingData setting`);
      console.log(`[DEBUG] External API data: ${validatedExternalApiData ? 'included' : 'none'}`);

      const contentSourceMode = config.contentSourceMode || 'content';
      const includeContent = contentSourceMode === 'content' || contentSourceMode === 'both';
      const includeRaw = contentSourceMode === 'raw_document' || contentSourceMode === 'both';

      let rawDocText = '';
      let rawDocTokens = 0;
      let rawDocBase64 = '';
      let rawDocContentType = 'application/octet-stream';
      if (includeRaw) {
        const rawDoc = await paperlessService.getDocumentFile(id, true);
        const rawBuffer = Buffer.isBuffer(rawDoc.content)
          ? rawDoc.content
          : Buffer.from(rawDoc.content, 'binary');
        rawDocBase64 = rawBuffer.toString('base64');
        rawDocContentType = rawDoc['content-type'] || 'application/octet-stream';
        const rawMeta = `RAW_DOCUMENT_BASE64 (content-type: ${rawDocContentType}, size: ${rawDoc.size || rawBuffer.length} bytes):\n`;
        rawDocText = `${rawMeta}${rawDocBase64}`;
        rawDocTokens = await calculateTokens(
          (config.rawDocumentMode || 'text') === 'text' ? rawDocText : rawDocBase64,
          model
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
        truncatedContent = await truncateToTokenLimit(content, availableTokensForContent, model);
      }

      await writePromptToFile(systemPrompt, truncatedContent);

      // Build response schema with enum constraints for tags and document types
      // First, build the base enum list for document types (all available types plus null)
      const allDocTypesList = Array.isArray(existingDocumentTypesList) 
        ? existingDocumentTypesList.map(t => typeof t === 'string' ? t : t.name).filter(Boolean)
        : [];
      
      const responseSchema = {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A meaningful and short title for the document"
          },
          correspondent: {
            type: ["string", "null"],
            description: "The sender/correspondent of the document"
          },
          tags: {
            type: "array",
            items: {
              type: "string"
            },
            description: "Array of tags to assign to the document"
          },
          document_type: {
            type: ["string", "null"],
            description: "The document type classification - can be null if no type matches"
          },
          document_date: {
            type: "string",
            description: "The document date in YYYY-MM-DD format"
          },
          content: {
            type: "string",
            description: "Optimized document content (optional)"
          },
          language: {
            type: "string",
            description: "The language of the document (en/de/es/etc)"
          },
          custom_fields: {
            type: "object",
            description: "Custom fields extracted from the document"
          }
        },
        required: ["title", "tags", "document_type", "document_date", "correspondent", "language"]
      };

      // Add enum constraints if restrictions are enabled
      if (config.restrictToExistingTags === 'yes' && Array.isArray(existingTags) && existingTags.length > 0) {
        const tagsList = existingTags.map(t => typeof t === 'string' ? t : t.name).filter(Boolean);
        responseSchema.properties.tags = {
          type: "array",
          items: {
            type: "string",
            enum: tagsList
          },
          description: "Array of tags from the available pool"
        };
        console.log(`[DEBUG] Tag enum constraint set with ${tagsList.length} available tags`);
      }

      // If restrictions enabled, further constrain to only allowed types
      if (config.restrictToExistingDocumentTypes === 'yes' && Array.isArray(existingDocumentTypesList) && existingDocumentTypesList.length > 0) {
        const restrictedDocTypesList = existingDocumentTypesList.map(t => typeof t === 'string' ? t : t.name).filter(Boolean);
        responseSchema.properties.document_type = {
          type: ["string", "null"],
          enum: [...restrictedDocTypesList, null],
          description: "Document type from the restricted pool only, or null if no match"
        };
        console.log(`[DEBUG] Document type restricted enum with ${restrictedDocTypesList.length} allowed types`);
      } else if (allDocTypesList.length > 0) {
        console.log(`[DEBUG] Document type enum set with all ${allDocTypesList.length} available types`);
      }

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
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userContent
          }
        ],
        temperature: 0.3,
      };

      // Add JSON schema mode for Azure OpenAI
      if (responseSchema) {
        apiPayload.response_format = {
          type: "json_schema",
          json_schema: {
            name: "document_analysis",
            schema: responseSchema,
            strict: true
          }
        };
        console.log('[DEBUG] Using structured JSON schema mode for response validation');
      }

      // Retry logic: try up to 3 times if response is null or empty
      let response = null;
      let lastError = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await this.client.chat.completions.create(apiPayload);
          
          // Check if response has content
          if (response?.usage.completion_tokens > 0 && response?.choices?.[0]?.message?.content) {
            console.log(`[DEBUG] Got valid response on attempt ${attempt}/${maxRetries}`);
            break; // Success, exit retry loop
          } else {
            console.warn(`[DEBUG] Empty response on attempt ${attempt}/${maxRetries}, retrying...`);
            lastError = new Error('Empty API response');
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            }
          }
        } catch (err) {
          console.warn(`[DEBUG] Error on attempt ${attempt}/${maxRetries}: ${err.message}`);
          lastError = err;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          }
        }
      }

      if (!response?.choices?.[0]?.message?.content) {
        throw lastError || new Error('Invalid API response structure after 3 retries');
      }

      console.log(`[DEBUG] [${timestamp}] AzureOpenAI request sent`);
      console.log(`[DEBUG] [${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const usage = response.usage;
      const mappedUsage = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      };

      let jsonContent = response.choices[0].message.content;
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(jsonContent);
        parsedResponse = extractSchemaData(parsedResponse);
        //write to file and append to the file (txt)
        fs.appendFile('./logs/response.txt', jsonContent, (err) => {
          if (err) throw err;
        });
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Invalid JSON response from API');
      }

      if (!parsedResponse || !Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
        throw new Error('Invalid response structure: missing tags array or correspondent string');
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
  async _validateAndTruncateExternalApiData(apiData, maxTokens = 500) {
    if (!apiData) {
      return null;
    }

    const dataString = typeof apiData === 'object'
      ? JSON.stringify(apiData, null, 2)
      : String(apiData);

    // Calculate tokens for the data
    const dataTokens = await calculateTokens(dataString, process.env.AZURE_DEPLOYMENT_NAME);

    if (dataTokens > maxTokens) {
      console.warn(`[WARNING] External API data (${dataTokens} tokens) exceeds limit (${maxTokens}), truncating`);
      return await truncateToTokenLimit(dataString, maxTokens, process.env.AZURE_DEPLOYMENT_NAME);
    }

    console.log(`[DEBUG] External API data validated: ${dataTokens} tokens`);
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
      this.initialize();
      const now = new Date();
      const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

      if (!this.client) {
        throw new Error('AzureOpenAI client not initialized - missing API key');
      }

      // Calculate total prompt tokens including musthavePrompt
      const totalPromptTokens = await calculateTotalPromptTokens(
        prompt + musthavePrompt // Combined system prompt
      );

      // Calculate available tokens
      const maxTokens = Number(config.tokenLimit);
      const reservedTokens = totalPromptTokens + Number(config.responseTokens);
      const availableTokens = maxTokens - reservedTokens;

      // Truncate content if necessary
      const truncatedContent = await truncateToTokenLimit(content, availableTokens);

      // Make API request
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_DEPLOYMENT_NAME,
        messages: [
          {
            role: "system",
            content: prompt + musthavePrompt
          },
          {
            role: "user",
            content: truncatedContent
          }
        ],
        temperature: 0.3,
      });

      // Handle response
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      // Log token usage
      console.log(`[DEBUG] [${timestamp}] AzureOpenAI request sent`);
      console.log(`[DEBUG] [${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const usage = response.usage;
      const mappedUsage = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      };

      let jsonContent = response.choices[0].message.content;
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(jsonContent);
        parsedResponse = extractSchemaData(parsedResponse);
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Invalid JSON response from API');
      }

      // Validate response structure
      if (!parsedResponse || !Array.isArray(parsedResponse.tags)) {
        throw new Error('Invalid response structure: missing tags array');
      }
      // document_type can be null or a string from the enum, both are valid
      if (parsedResponse.document_type !== null && typeof parsedResponse.document_type !== 'string') {
        throw new Error('Invalid response structure: document_type must be string or null');
      }
      // correspondent can be null or string, both are valid
      if (parsedResponse.correspondent !== null && typeof parsedResponse.correspondent !== 'string') {
        throw new Error('Invalid response structure: correspondent must be string or null');
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
      this.initialize();

      if (!this.client) {
        throw new Error('AzureOpenAI client not initialized - missing API key');
      }

      const model = process.env.AZURE_DEPLOYMENT_NAME;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating text with AzureOpenAI:', error);
      throw error;
    }
  }

  async checkStatus() {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('AzureOpenAI client not initialized - missing API key');
      }

      const model = process.env.AZURE_DEPLOYMENT_NAME;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: "Test"
          }
        ],
        temperature: 0.7,
        max_tokens: 10
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return { status: 'ok', model: model };
    } catch (error) {
      console.error('Error checking AzureOpenAI status:', error);
      return { status: 'error', error: error.message };
    }
  }

  async checkStatus() {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('Azure OpenAI client not initialized - missing API key');
      }

      const model = process.env.AZURE_DEPLOYMENT_NAME;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: 'Ping'
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      if (!response?.choices?.[0]?.message?.content) {
        return { status: 'error' };
      }

      return { status: 'ok', model: model };
    } catch (error) {
      console.error('Error generating text with Azure OpenAI:', error);
      return { status: 'error' };
    }
  }
}

module.exports = new AzureOpenAIService();
