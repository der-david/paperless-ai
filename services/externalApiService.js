const axios = require('axios');
/**
 * Service for fetching data from external APIs to enrich AI prompts
 */
class ExternalApiService {
  constructor({ enabled = false, url = '', method = 'GET', headers = {}, body = {}, timeout = 5000, transform = '' } = {}) {
    this.enabled = enabled;
    this.url = url;
    this.method = method;
    this.headers = headers;
    this.body = body;
    this.timeout = timeout;
    this.transform = transform;
  }

  /**
   * Fetch data from the configured external API
   * @returns {Promise<Object|string|null>} The data from the API or null if disabled/error
   */
  async fetchData() {
    try {
      // Check if external API integration is enabled
      if (!this.enabled) {
        console.debug('External API integration is disabled');
        return null;
      }

      if (!this.url) {
        console.error('External API URL not configured');
        return null;
      }

      console.debug(`Fetching data from external API: ${this.url}`);

      // Parse headers if they're a string
      let parsedHeaders = this.headers;
      if (typeof this.headers === 'string') {
        try {
          parsedHeaders = JSON.parse(this.headers);
        } catch (error) {
          console.error('Failed to parse external API headers:', error.message);
          parsedHeaders = {};
        }
      }

      // Parse body if it's a string
      let parsedBody = this.body;
      if (typeof this.body === 'string' && (this.method === 'POST' || this.method === 'PUT')) {
        try {
          parsedBody = JSON.parse(this.body);
        } catch (error) {
          console.error('Failed to parse external API body:', error.message);
          parsedBody = {};
        }
      }

      // Configure request options
      const options = {
        method: this.method,
        url: this.url,
        headers: parsedHeaders,
        timeout: parseInt(this.timeout) || 5000,
      };

      // Add request body for POST/PUT requests
      if (this.method === 'POST' || this.method === 'PUT') {
        options.data = parsedBody;
      }

      // Make the request
      const response = await axios(options);
      let data = response.data;

      // Apply transform function if provided
      if (this.transform && typeof this.transform === 'string') {
        try {
          // Create a safe transform function
          const transformFn = new Function('data', this.transform);
          data = transformFn(data);
          console.debug('Successfully transformed external API data');
        } catch (error) {
          console.error('Failed to execute transform function:', error.message);
        }
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch data from external API:', error.message);
      if (error.response) {
        console.error('API Response:', error.response.status, error.response.data);
      }
      return null;
    }
  }
}

module.exports = ExternalApiService;
