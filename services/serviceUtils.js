const tiktoken = require('tiktoken');
const fs = require('fs').promises;
const path = require('path');

function truncateValues(obj, maxLen) {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    return obj.length > maxLen ? obj.slice(0, maxLen) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => truncateValues(item, maxLen));
  }

  if (typeof obj === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = truncateValues(value, maxLen);
    }
    return out;
  }

  return obj; // numbers, booleans, functions, etc.
}

// Map non-OpenAI models to compatible OpenAI encodings or use estimation
function getCompatibleModel(model) {
    const openaiModels = [
        // GPT-4o family
        'gpt-4o', 'chatgpt-4o-latest', 'gpt-4o-mini', 'gpt-4o-audio-preview',
        'gpt-4o-audio-preview-2024-12-17', 'gpt-4o-audio-preview-2024-10-01',
        'gpt-4o-mini-audio-preview', 'gpt-4o-mini-audio-preview-2024-12-17',

        // GPT-4.1 family
        'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',

        // GPT-3.5 family
        'gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-3.5-turbo-instruct',

        // GPT-4 family
        'gpt-4', 'gpt-4-32k', 'gpt-4-1106-preview', 'gpt-4-0125-preview',
        'gpt-4-turbo-2024-04-09', 'gpt-4-turbo', 'gpt-4-turbo-preview',

        // GPT-4.5 family
        'gpt-4.5-preview-2025-02-27', 'gpt-4.5-preview', 'gpt-4.5',

        // O-series models
        'o1', 'o1-2024-12-17', 'o1-preview', 'o1-mini', 'o3-mini', 'o3', 'o4-mini',

        // Legacy models that tiktoken might support
        'text-davinci-003', 'text-davinci-002'
    ];

    // If it's a known OpenAI model, return as-is
    if (openaiModels.some(openaiModel => model.includes(openaiModel))) {
        return model;
    }

    // For all other models (Llama, Claude, etc.), return null to use estimation
    return null;
}

// Estimate tokens for non-OpenAI models using character-based approximation
function estimateTokensForNonOpenAI(text) {
    // Rough approximation: 1 token ≈ 4 characters for most models
    // This is conservative and works reasonably well for Llama models
    return Math.ceil(text.length / 4);
}

// Calculate tokens for a given text
async function calculateTokens(text, model = process.env.OPENAI_MODEL || "gpt-4o-mini") {
    try {
        const compatibleModel = getCompatibleModel(model);

        if (!compatibleModel) {
            // Non-OpenAI model - use character-based estimation
            console.debug(`Using character-based token estimation for model: ${model}`);
            return estimateTokensForNonOpenAI(text);
        }

        // OpenAI model - use tiktoken
        const tokenizer = tiktoken.encoding_for_model(compatibleModel);
        const tokens = tokenizer.encode(text);
        const tokenCount = tokens.length;
        tokenizer.free();

        return tokenCount;

    } catch (error) {
        console.warn(`Tiktoken failed for model ${model}, falling back to character estimation:`, error.message);
        return estimateTokensForNonOpenAI(text);
    }
}

// Calculate total tokens for a system prompt and additional prompts
async function calculateTotalPromptTokens(systemPrompt, additionalPrompts = [], model = process.env.OPENAI_MODEL || "gpt-4o-mini") {
    let totalTokens = 0;

    // Count tokens for system prompt
    totalTokens += await calculateTokens(systemPrompt, model);

    // Count tokens for additional prompts
    for (const prompt of additionalPrompts) {
        if (prompt) { // Only count if prompt exists
            totalTokens += await calculateTokens(prompt, model);
        }
    }

    // Add tokens for message formatting (approximately 4 tokens per message)
    const messageCount = 1 + additionalPrompts.filter(p => p).length; // Count system + valid additional prompts
    totalTokens += messageCount * 4;

    return totalTokens;
}

// Truncate text to fit within token limit
async function truncateToTokenLimit(text, maxTokens, model = process.env.OPENAI_MODEL || "gpt-4o-mini") {
    try {
        const compatibleModel = getCompatibleModel(model);

        if (!compatibleModel) {
            // Non-OpenAI model - use character-based estimation
            console.debug(`Using character-based truncation for model: ${model}`);

            const estimatedTokens = estimateTokensForNonOpenAI(text);

            if (estimatedTokens <= maxTokens) {
                return text;
            }

            // Truncate based on character estimation (conservative approach)
            const maxChars = maxTokens * 4; // 4 chars per token approximation
            const truncatedText = text.substring(0, maxChars);

            // Try to break at a word boundary if possible
            const lastSpaceIndex = truncatedText.lastIndexOf(' ');
            if (lastSpaceIndex > maxChars * 0.8) { // Only if we don't lose too much text
                return truncatedText.substring(0, lastSpaceIndex);
            }

            return truncatedText;
        }

        // OpenAI model - use tiktoken
        const tokenizer = tiktoken.encoding_for_model(compatibleModel);
        const tokens = tokenizer.encode(text);

        if (tokens.length <= maxTokens) {
            tokenizer.free();
            return text;
        }

        const truncatedTokens = tokens.slice(0, maxTokens);
        const truncatedText = tokenizer.decode(truncatedTokens);
        tokenizer.free();

        // No need for TextDecoder here, tiktoken.decode() returns a string
        return truncatedText;

    } catch (error) {
        console.warn(`Token truncation failed for model ${model}, falling back to character estimation:`, error.message);

        // Fallback to character-based estimation
        const estimatedTokens = estimateTokensForNonOpenAI(text);

        if (estimatedTokens <= maxTokens) {
            return text;
        }

        const maxChars = maxTokens * 4;
        const truncatedText = text.substring(0, maxChars);

        // Try to break at a word boundary if possible
        const lastSpaceIndex = truncatedText.lastIndexOf(' ');
        if (lastSpaceIndex > maxChars * 0.8) {
            return truncatedText.substring(0, lastSpaceIndex);
        }

        return truncatedText;
    }
}

// Write prompt and content to a file with size management
async function writePromptToFile(systemPrompt, truncatedContent, filePath = './logs/prompt.txt', maxSize = 10 * 1024 * 1024) {
    try {
        // Ensure the logs directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        // Check file size and manage it
        try {
            const stats = await fs.stat(filePath);
            if (stats.size > maxSize) {
                await fs.unlink(filePath); // Delete the file if it exceeds max size
                console.debug(`Cleared log file ${filePath} due to size limit`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Error checking file size:', error);
            }
        }

        // Write the content with timestamp
        const timestamp = new Date().toISOString();
        const content = `\n=== ${timestamp} ===\nSYSTEM PROMPT:\n${systemPrompt}\n\nUSER CONTENT:\n${truncatedContent}\n\n`;

        await fs.appendFile(filePath, content);
    } catch (error) {
        console.error('Error writing to file:', error);
    }
}

function parseCustomFields(rawValue) {
    if (!rawValue) {
        return [];
    }

    try {
        const parseEnabled = (value) => {
            if (value === undefined) return true;
            if (typeof value === 'boolean') return value;
            const normalized = String(value).toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
        };

        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (parsed && Array.isArray(parsed.custom_fields)) {
            return parsed.custom_fields
                .map((field) => {
                    if (!field || typeof field !== 'object') return null;
                    const name = field.name || field.value;
                    const dataType = field.data_type || field.type;
                    if (!name || !dataType) return null;
                    const enabled = parseEnabled(field.enabled);
                    const extraData = field.extra_data && typeof field.extra_data === 'object'
                        ? { ...field.extra_data }
                        : {};

                    if (field.currency && !extraData.default_currency) {
                        extraData.default_currency = field.currency;
                    }

                    return {
                        name,
                        data_type: dataType,
                        description: field.description || '',
                        enabled,
                        extra_data: extraData
                    };
                })
                .filter((field) => field && field.data_type !== 'documentlink' && field.enabled);
        }
    } catch (error) {
        console.error('Failed to parse AI_CUSTOM_FIELDS:', error);
    }

    return [];
}

function buildResponseSchema({
    existingTags = [],
    existingDocumentTypesList = [],
    existingCorrespondents = [],
    restrictToExistingTags = false,
    restrictToExistingDocumentTypes = false,
    restrictToExistingCorrespondents = false,
    limitFunctions = null,
    includeCustomFieldProperties = false,
    customFields = [],
    customFieldsDescription = "Custom fields extracted from the document"
} = {}) {
    const allDocTypesList = Array.isArray(existingDocumentTypesList)
        ? existingDocumentTypesList.map((t) => typeof t === 'string' ? t : t.name).filter(Boolean)
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
                description: customFieldsDescription,
                properties: {}
            }
        },
        required: []
    };

    const isEnabled = (value, defaultValue = true) => {
        if (value == null) return defaultValue;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'yes' || value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
    };

    const required = [];
    if (isEnabled(limitFunctions?.activateTitle)) required.push('title');
    if (isEnabled(limitFunctions?.activateTagging)) required.push('tags');
    if (isEnabled(limitFunctions?.activateDocumentType)) required.push('document_type');
    if (isEnabled(limitFunctions?.activateCorrespondent)) required.push('correspondent');
    if (isEnabled(limitFunctions?.activateContent, false)) required.push('content');
    if (isEnabled(limitFunctions?.activateDocumentDate)) required.push('document_date');
    if (isEnabled(limitFunctions?.activateLanguage)) required.push('language');

    responseSchema.required = required;

    let tagsList = [];
    if (restrictToExistingTags && Array.isArray(existingTags) && existingTags.length > 0) {
        tagsList = existingTags.map((t) => typeof t === 'string' ? t : t.name).filter(Boolean);
        responseSchema.properties.tags = {
            type: "array",
            items: {
                type: "string",
                enum: tagsList
            },
            description: "Array of tags from the available pool"
        };
    }

    let restrictedDocTypesList = [];
    if (restrictToExistingDocumentTypes && Array.isArray(existingDocumentTypesList) && existingDocumentTypesList.length > 0) {
        restrictedDocTypesList = existingDocumentTypesList.map((t) => typeof t === 'string' ? t : t.name).filter(Boolean);
        responseSchema.properties.document_type = {
            type: ["string", "null"],
            enum: [...restrictedDocTypesList, null],
            description: "Document type from the restricted pool only, or null if no match"
        };
    }

    let correspondentsList = [];
    if (restrictToExistingCorrespondents && Array.isArray(existingCorrespondents) && existingCorrespondents.length > 0) {
        correspondentsList = existingCorrespondents
            .map((c) => typeof c === 'string' ? c : c?.name)
            .filter(Boolean);
        responseSchema.properties.correspondent = {
            type: ["string", "null"],
            enum: [...correspondentsList, null],
            description: "Correspondent from the restricted pool only, or null if no match"
        };
    }

    let customFieldsStr = '';
    if (includeCustomFieldProperties) {
        customFields.forEach((field) => {
            const customField = {
                description: field.description || 'Fill in the value based on your analysis'
            };
            switch (field.data_type) {
                case 'boolean':
                    customField.type = 'boolean';
                    break;
                case 'date':
                    customField.type = 'string';
                    customField.format = 'date';
                    break;
                case 'float':
                case 'number':
                    customField.type = 'number';
                    break;
                case 'integer':
                    customField.type = 'integer';
                    break;
                case 'monetary':
                    customField.type = 'number';
                    if (field.extra_data?.default_currency) {
                        customField.description = `${customField.description} Currency: ${field.extra_data.default_currency}.`;
                    }
                    break;
                case 'url':
                    customField.type = 'string';
                    customField.format = 'uri';
                    break;
                case 'select':
                    customField.type = 'string';
                    if (Array.isArray(field.extra_data?.select_options) && field.extra_data.select_options.length > 0) {
                        const optionLabels = field.extra_data.select_options
                            .map((option) => (typeof option === 'string' ? option : option?.label))
                            .filter(Boolean);
                        if (optionLabels.length > 0) {
                            customField.enum = optionLabels;
                        }
                    }
                    break;
                case 'longtext':
                    customField.type = 'string';
                    break;
                default:
                    customField.type = 'string';
            }
            if (field.name) {
                responseSchema.properties.custom_fields.properties[field.name] = customField;
            }
        });

        customFieldsStr = '"custom_fields": ' + JSON.stringify(responseSchema.properties.custom_fields.properties);
    }

    return {
        responseSchema,
        tagsList,
        restrictedDocTypesList,
        allDocTypesList,
        correspondentsList,
        customFieldsStr
    };
}

module.exports = {
    truncateValues,
    calculateTokens,
    calculateTotalPromptTokens,
    truncateToTokenLimit,
    writePromptToFile,
    parseCustomFields,
    buildResponseSchema
};
