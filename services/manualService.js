const {
    calculateTokens,
    calculateTotalPromptTokens,
    truncateToTokenLimit,
    writePromptToFile
} = require('./serviceUtils');
const axios = require('axios');
const OpenAI = require('openai');
const AzureOpenAI = require('openai').AzureOpenAI;
const emptyVar = null;

class ManualService {
    constructor({
        aiProvider,
        openaiApiKey,
        openaiModel,
        customApiKey,
        customApiUrl,
        customModel,
        azureApiKey,
        azureEndpoint,
        azureDeploymentName,
        azureApiVersion,
        ollamaApiUrl,
        ollamaModel,
        systemPrompt,
        tokenLimit
    } = {}) {
        this.aiProvider = aiProvider || process.env.AI_PROVIDER;
        this.openaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY;
        this.openaiModel = openaiModel || process.env.OPENAI_MODEL;
        this.customApiKey = customApiKey || process.env.CUSTOM_API_KEY;
        this.customApiUrl = customApiUrl || process.env.CUSTOM_BASE_URL;
        this.customModel = customModel || process.env.CUSTOM_MODEL;
        this.azureApiKey = azureApiKey || process.env.AZURE_API_KEY;
        this.azureEndpoint = azureEndpoint || process.env.AZURE_ENDPOINT;
        this.azureDeploymentName = azureDeploymentName || process.env.AZURE_DEPLOYMENT_NAME;
        this.azureApiVersion = azureApiVersion || process.env.AZURE_API_VERSION;
        this.ollamaApiUrl = ollamaApiUrl || process.env.OLLAMA_API_URL;
        this.ollamaModel = ollamaModel || process.env.OLLAMA_MODEL;
        this.systemPrompt = systemPrompt || process.env.AI_SYSTEM_PROMPT;
        this.tokenLimit = tokenLimit;
        this._initializeClients(this.aiProvider);
    }

    _initializeClients(provider) {
        if (provider === 'custom') {
            this.openai = new OpenAI({
                apiKey: this.customApiKey,
                baseUrl: this.customApiUrl
            });
        } else if (provider === 'azure') {
            this.openai = new AzureOpenAI({
                apiKey: this.azureApiKey,
                endpoint: this.azureEndpoint,
                deploymentName: this.azureDeploymentName,
                apiVersion: this.azureApiVersion
            });
        } else {
            this.openai = new OpenAI({ apiKey: this.openaiApiKey });
            this.ollama = axios.create({
                timeout: 300000
            });
        }
    }

    async analyzeDocument(content, existingTags, provider) {
        try {
        const providerName = provider || this.aiProvider;
        this._initializeClients(providerName);
        if (providerName === 'openai') {
            return this._analyzeOpenAI(content, existingTags);
        } else if (providerName === 'ollama') {
            return this._analyzeOllama(content, existingTags);
        } else if (providerName === 'custom') {
            return this._analyzeCustom(content, existingTags);
        } else if (providerName === 'azure') {
            return this._analyzeAzure(content, existingTags);
        } else {
            throw new Error('Invalid provider');
        }
        } catch (error) {
        console.error('Error analyzing document:', error);
        return { tags: [], correspondent: null };
        }
    }

    async _analyzeOpenAI(content, existingTags) {
        try {
        const model = this.openaiModel;
        const systemPrompt = this.systemPrompt;
        await writePromptToFile(systemPrompt, content);
        const response = await this.openai.chat.completions.create({
            model: model,
            messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: content
            }
            ],
            ...(model !== 'o3-mini' && { temperature: 0.3 }),
        });

        let jsonContent = response.choices[0].message.content;
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const parsedResponse = JSON.parse(jsonContent);
        try {
            parsedResponse = JSON.parse(jsonContent);
            fs.appendFile('./logs/response.txt', jsonContent, (err) => {
                if (err) throw err;
            });
        } catch (error) {
            console.error('Failed to parse JSON response:', error);
            throw new Error('Invalid JSON response from API');
        }

        if (!Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
            throw new Error('Invalid response structure');
        }

        return parsedResponse;
        } catch (error) {
        console.error('Failed to analyze document with OpenAI:', error);
        return { tags: [], correspondent: null };
        }
    }

    async _analyzeAzure(content, existingTags) {
        try {
        const systemPrompt = this.systemPrompt;
        await writePromptToFile(systemPrompt, content);
        const response = await this.openai.chat.completions.create({
            model: this.azureDeploymentName,
            messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: content
            }
            ],
            temperature: 0.3,
        });

        let jsonContent = response.choices[0].message.content;
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const parsedResponse = JSON.parse(jsonContent);
        try {
            parsedResponse = JSON.parse(jsonContent);
            fs.appendFile('./logs/response.txt', jsonContent, (err) => {
                if (err) throw err;
            });
        } catch (error) {
            console.error('Failed to parse JSON response:', error);
            throw new Error('Invalid JSON response from API');
        }

        if (!Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
            throw new Error('Invalid response structure');
        }

        return parsedResponse;
        } catch (error) {
        console.error('Failed to analyze document with OpenAI:', error);
        return { tags: [], correspondent: null };
        }
    }

    async _analyzeCustom(content, existingTags) {
        try {
            const systemPrompt = this.systemPrompt;
            const model = this.customModel;
            const response = await this.openai.chat.completions.create({
                model: model,
                messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: content
                }
                ],
                ...(model !== 'o3-mini' && { temperature: 0.3 }),
            });

            let jsonContent = response.choices[0].message.content;
            jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const parsedResponse = JSON.parse(jsonContent);

            if (!Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
                throw new Error('Invalid response structure');
            }

            return parsedResponse;
            } catch (error) {
            console.error('Failed to analyze document with OpenAI:', error);
            return { tags: [], correspondent: null };
            }
    }

    async _analyzeOllama(content, existingTags) {
        try {
        const prompt = this.systemPrompt;

        const getAvailableMemory = async () => {
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            const totalMemoryMB = (totalMemory / (1024 * 1024)).toFixed(0);
            const freeMemoryMB = (freeMemory / (1024 * 1024)).toFixed(0);
            return { totalMemoryMB, freeMemoryMB };
        };

        const calculateNumCtx = (promptTokenCount, expectedResponseTokens) => {
            const totalTokenUsage = promptTokenCount + expectedResponseTokens;
            const maxCtxLimit = Number(this.tokenLimit) || 8192;

            const numCtx = Math.min(totalTokenUsage, maxCtxLimit);

            console.log('Prompt Token Count:', promptTokenCount);
            console.log('Expected Response Tokens:', expectedResponseTokens);
            console.log('Dynamic calculated num_ctx:', numCtx);

            return numCtx;
        };

        const calculatePromptTokenCount = (prompt) => {
            return Math.ceil(prompt.length / 4);
        };

        const { freeMemoryMB } = await getAvailableMemory();
        const expectedResponseTokens = 1024;
        const promptTokenCount = calculatePromptTokenCount(prompt);

        const numCtx = calculateNumCtx(promptTokenCount, expectedResponseTokens);

        const response = await this.ollama.post(`${this.ollamaApiUrl}/api/generate`, {
            model: this.ollamaModel,
            prompt: prompt,
            stream: false,
            options: {
            temperature: 0.7,
            top_p: 0.9,
            repeat_penalty: 1.1,
            num_ctx: numCtx,
            }
        });

        if (!response.data || !response.data.response) {
            console.error('Unexpected Ollama response format:', response);
            throw new Error('Invalid response from Ollama API');
        }

        return this._parseResponse(response.data.response);
        }

        catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error('Timeout bei der Ollama-Anfrage:', error);
            throw new Error('Die Analyse hat zu lange gedauert. Bitte versuchen Sie es erneut.');
        }
        console.error('Error analyzing document with Ollama:', error);
        throw error;
        }
    }
}

module.exports = ManualService;
