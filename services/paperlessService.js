// services/paperlessService.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parse, isValid, parseISO, format } = require('date-fns');

class PaperlessService {
  static PERMISSIONS = [
    'account.add_emailaddress',
    'account.add_emailconfirmation',
    'account.change_emailaddress',
    'account.change_emailconfirmation',
    'account.delete_emailaddress',
    'account.delete_emailconfirmation',
    'account.view_emailaddress',
    'account.view_emailconfirmation',
    'admin.add_logentry',
    'admin.change_logentry',
    'admin.delete_logentry',
    'admin.view_logentry',
    'auditlog.add_logentry',
    'auditlog.change_logentry',
    'auditlog.delete_logentry',
    'auditlog.view_logentry',
    'auth.add_group',
    'auth.add_permission',
    'auth.add_user',
    'auth.change_group',
    'auth.change_permission',
    'auth.change_user',
    'auth.delete_group',
    'auth.delete_permission',
    'auth.delete_user',
    'auth.view_group',
    'auth.view_permission',
    'auth.view_user',
    'authtoken.add_token',
    'authtoken.add_tokenproxy',
    'authtoken.change_token',
    'authtoken.change_tokenproxy',
    'authtoken.delete_token',
    'authtoken.delete_tokenproxy',
    'authtoken.view_token',
    'authtoken.view_tokenproxy',
    'contenttypes.add_contenttype',
    'contenttypes.change_contenttype',
    'contenttypes.delete_contenttype',
    'contenttypes.view_contenttype',
    'django_celery_results.add_chordcounter',
    'django_celery_results.add_groupresult',
    'django_celery_results.add_taskresult',
    'django_celery_results.change_chordcounter',
    'django_celery_results.change_groupresult',
    'django_celery_results.change_taskresult',
    'django_celery_results.delete_chordcounter',
    'django_celery_results.delete_groupresult',
    'django_celery_results.delete_taskresult',
    'django_celery_results.view_chordcounter',
    'django_celery_results.view_groupresult',
    'django_celery_results.view_taskresult',
    'documents.add_correspondent',
    'documents.add_customfield',
    'documents.add_customfieldinstance',
    'documents.add_document',
    'documents.add_documenttype',
    'documents.add_log',
    'documents.add_note',
    'documents.add_paperlesstask',
    'documents.add_savedview',
    'documents.add_savedviewfilterrule',
    'documents.add_sharelink',
    'documents.add_storagepath',
    'documents.add_tag',
    'documents.add_uisettings',
    'documents.add_workflow',
    'documents.add_workflowaction',
    'documents.add_workflowactionemail',
    'documents.add_workflowactionwebhook',
    'documents.add_workflowrun',
    'documents.add_workflowtrigger',
    'documents.change_correspondent',
    'documents.change_customfield',
    'documents.change_customfieldinstance',
    'documents.change_document',
    'documents.change_documenttype',
    'documents.change_log',
    'documents.change_note',
    'documents.change_paperlesstask',
    'documents.change_savedview',
    'documents.change_savedviewfilterrule',
    'documents.change_sharelink',
    'documents.change_storagepath',
    'documents.change_tag',
    'documents.change_uisettings',
    'documents.change_workflow',
    'documents.change_workflowaction',
    'documents.change_workflowactionemail',
    'documents.change_workflowactionwebhook',
    'documents.change_workflowrun',
    'documents.change_workflowtrigger',
    'documents.delete_correspondent',
    'documents.delete_customfield',
    'documents.delete_customfieldinstance',
    'documents.delete_document',
    'documents.delete_documenttype',
    'documents.delete_log',
    'documents.delete_note',
    'documents.delete_paperlesstask',
    'documents.delete_savedview',
    'documents.delete_savedviewfilterrule',
    'documents.delete_sharelink',
    'documents.delete_storagepath',
    'documents.delete_tag',
    'documents.delete_uisettings',
    'documents.delete_workflow',
    'documents.delete_workflowaction',
    'documents.delete_workflowactionemail',
    'documents.delete_workflowactionwebhook',
    'documents.delete_workflowrun',
    'documents.delete_workflowtrigger',
    'documents.view_correspondent',
    'documents.view_customfield',
    'documents.view_customfieldinstance',
    'documents.view_document',
    'documents.view_documenttype',
    'documents.view_log',
    'documents.view_note',
    'documents.view_paperlesstask',
    'documents.view_savedview',
    'documents.view_savedviewfilterrule',
    'documents.view_sharelink',
    'documents.view_storagepath',
    'documents.view_tag',
    'documents.view_uisettings',
    'documents.view_workflow',
    'documents.view_workflowaction',
    'documents.view_workflowactionemail',
    'documents.view_workflowactionwebhook',
    'documents.view_workflowrun',
    'documents.view_workflowtrigger',
    'guardian.add_groupobjectpermission',
    'guardian.add_userobjectpermission',
    'guardian.change_groupobjectpermission',
    'guardian.change_userobjectpermission',
    'guardian.delete_groupobjectpermission',
    'guardian.delete_userobjectpermission',
    'guardian.view_groupobjectpermission',
    'guardian.view_userobjectpermission',
    'mfa.add_authenticator',
    'mfa.change_authenticator',
    'mfa.delete_authenticator',
    'mfa.view_authenticator',
    'paperless.add_applicationconfiguration',
    'paperless.change_applicationconfiguration',
    'paperless.delete_applicationconfiguration',
    'paperless.view_applicationconfiguration',
    'paperless_mail.add_mailaccount',
    'paperless_mail.add_mailrule',
    'paperless_mail.add_processedmail',
    'paperless_mail.change_mailaccount',
    'paperless_mail.change_mailrule',
    'paperless_mail.change_processedmail',
    'paperless_mail.delete_mailaccount',
    'paperless_mail.delete_mailrule',
    'paperless_mail.delete_processedmail',
    'paperless_mail.view_mailaccount',
    'paperless_mail.view_mailrule',
    'paperless_mail.view_processedmail',
    'sessions.add_session',
    'sessions.change_session',
    'sessions.delete_session',
    'sessions.view_session',
    'socialaccount.add_socialaccount',
    'socialaccount.add_socialapp',
    'socialaccount.add_socialtoken',
    'socialaccount.change_socialaccount',
    'socialaccount.change_socialapp',
    'socialaccount.change_socialtoken',
    'socialaccount.delete_socialaccount',
    'socialaccount.delete_socialapp',
    'socialaccount.delete_socialtoken',
    'socialaccount.view_socialaccount',
    'socialaccount.view_socialapp',
    'socialaccount.view_socialtoken'
  ];
  constructor({ apiUrl, apiToken, settings } = {}) {
    this.client = null;
    this.tagCache = new Map();
    this.customFieldCache = new Map();
    this.lastTagRefresh = 0;
    this.lastCustomFieldRefresh = 0;
    this.CACHE_LIFETIME = 3000; // 3 Sekunden
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
    this.settings = settings || {};
    this.initialize();
  }

  initialize() {
    if (!this.client && this.apiUrl && this.apiToken) {
      this.client = axios.create({
        baseURL: this.apiUrl,
        headers: {
          'Authorization': `Token ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  normalizeApiUrl(apiUrl) {
    if (!apiUrl) return apiUrl;
    return apiUrl.replace(/\/api\/?$/, '') + '/api';
  }

  normalizeTagList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(tag => String(tag).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map(tag => tag.trim()).filter(Boolean);
    }
    return [];
  }

  async validateConfig() {
    this.initialize();
    if (!this.client) {
      console.error('validateConfig: Paperless client is not initialized');
      return false;
    }

    try {
      const response = await this.client.get('/schema/', {
        params: { format: 'json' }
      });
      return response.status === 200;
    } catch (error) {
      console.error('Paperless validation error:', error.message);
      return false;
    }
  }

  async validatePermissions(permissions = ['*']) {
    this.initialize();
    if (!this.client) {
      return { success: false, message: 'Paperless client is not initialized' };
    }

    const requestedPermissions = Array.isArray(permissions) ? permissions : [permissions];

    try {
      const uiSettingsResponse = await this.client.get('/ui_settings/');
      const uiUser = uiSettingsResponse?.data?.user;
      const userId = uiUser?.id;
      if (uiUser?.is_superuser) {
        return { success: true, message: 'API permissions validated successfully' };
      }
      if (!userId) {
        return { success: false, message: 'Unable to determine current user from /api/ui_settings/' };
      }

      const userResponse = await this.client.get(`/users/${userId}/`);
      if (userResponse?.data?.is_superuser) {
        return { success: true, message: 'API permissions validated successfully' };
      }

      const userPermissions = Array.isArray(userResponse?.data?.user_permissions) ? userResponse.data.user_permissions : [];
      const inheritedPermissions = Array.isArray(userResponse?.data?.inherited_permissions) ? userResponse.data.inherited_permissions : [];
      const permissionSet = new Set([...userPermissions, ...inheritedPermissions]);

      for (const permission of requestedPermissions) {
        if (permission === '*') {
          const missingAll = PaperlessService.PERMISSIONS.filter(item => !permissionSet.has(item));
          if (missingAll.length > 0) {
            return {
              success: false,
              message: `Missing required permission(s) for '*': ${missingAll.join(', ')}`
            };
          }
          continue;
        }

        const isWildcard = !permission.includes('.') || permission.endsWith('.*');
        const wildcardPrefix = permission.replace(/\.\*$/, '');
        const requiredPermissions = isWildcard
          ? PaperlessService.PERMISSIONS.filter(item => item.startsWith(`${wildcardPrefix}.`))
          : [permission];

        if (requiredPermissions.length === 0) {
          return { success: false, message: `Unknown permission pattern '${permission}'` };
        }

        const missing = requiredPermissions.filter(required => !permissionSet.has(required));
        if (missing.length > 0) {
          return {
            success: false,
            message: `Missing required permission(s) for '${permission}': ${missing.join(', ')}`
          };
        }
      }
    } catch (error) {
      console.error('API permissions validation failed:', error.message);
      return { success: false, message: 'API permissions validation failed for current user' };
    }

    return { success: true, message: 'API permissions validated successfully' };
  }

  async getThumbnailImage(documentId) {
    this.initialize();
    try {
      const response = await this.client.get(`/documents/${documentId}/thumb/`, {
        responseType: 'arraybuffer'
      });

      if (response.data && response.data.byteLength > 0) {
        return Buffer.from(response.data);
      }

      console.debug(`No thumbnail data for document ${documentId}`);
      return null;
    } catch (error) {
      console.error(`fetching thumbnail for document ${documentId}:`, error.message);
      if (error.response) {
        console.error('status:', error.response.status);
        console.error('headers:', error.response.headers);
      }
      return null;
    }
  }


  // Aktualisiert den Tag-Cache, wenn er älter als CACHE_LIFETIME ist
  async ensureTagCache() {
    const now = Date.now();
    if (this.tagCache.size === 0 || (now - this.lastTagRefresh) > this.CACHE_LIFETIME) {
      await this.refreshTagCache();
    }
  }

  // Lädt alle existierenden Tags
  async refreshTagCache() {
      try {
        console.debug('Refreshing tag cache...');
        this.tagCache.clear();
        let nextUrl = '/tags/';
        while (nextUrl) {
          const response = await this.client.get(nextUrl);

          // Validate response structure
          if (!response?.data?.results) {
            console.error('Invalid response structure from API:', response?.data);
            break;
          }

          response.data.results.forEach(tag => {
            this.tagCache.set(tag.name.toLowerCase(), tag);
          });

          // Fix: Extract only path and query from next URL to prevent HTTP downgrade
          if (response.data.next) {
            try {
              const nextUrlObj = new URL(response.data.next);
              const baseUrlObj = new URL(this.client.defaults.baseURL);

              // Extract path relative to baseURL to avoid double /api/ prefix
              let relativePath = nextUrlObj.pathname;
              if (baseUrlObj.pathname && baseUrlObj.pathname !== '/') {
                // Remove the base path if it's included in the next URL path
                relativePath = relativePath.replace(baseUrlObj.pathname, '');
              }
              // Ensure path starts with /
              if (!relativePath.startsWith('/')) {
                relativePath = '/' + relativePath;
              }

              nextUrl = relativePath + nextUrlObj.search;
              console.debug('Next page URL:', nextUrl);
            } catch (e) {
              console.error('Failed to parse next URL:', e.message);
              nextUrl = null;
            }
          } else {
            nextUrl = null;
          }
        }
        this.lastTagRefresh = Date.now();
        console.debug(`Tag cache refreshed. Found ${this.tagCache.size} tags.`);
      } catch (error) {
        console.error('refreshing tag cache:', error.message);
        throw error;
      }
    }

  async initializeWithCredentials(apiUrl, apiToken) {
    const normalizedUrl = this.normalizeApiUrl(apiUrl);
    this.client = axios.create({
      baseURL: normalizedUrl,
      headers: {
        'Authorization': `Token ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Test the connection
    try {
      await this.client.get('/');
      return true;
    } catch (error) {
      console.error('Failed to initialize with credentials:', error.message);
      this.client = null;
      return false;
    }
  }

  async createCustomFieldSafely(fieldName, fieldType, default_currency) {
    try {
      // Try to create the field first
      const response = await this.client.post('/custom_fields/', {
        name: fieldName,
        data_type: fieldType,
        extra_data: {
          default_currency: default_currency || null
        }
      });
      const newField = response.data;
      console.debug(`Successfully created custom field "${fieldName}" with ID ${newField.id}`);
      this.customFieldCache.set(fieldName.toLowerCase(), newField);
      return newField;
    } catch (error) {
      if (error.response?.status === 400) {
        await this.refreshCustomFieldCache();
        const existingField = await this.findExistingCustomField(fieldName);
        if (existingField) {
          return existingField;
        }
      }
      throw error; // When couldn't find the field, rethrow the error
    }
  }

  async getExistingCustomFields(documentId) {
    try {
      const response = await this.client.get(`/documents/${documentId}/`);
      console.debug('Document response custom fields:', response.data.custom_fields);
      return response.data.custom_fields || [];
    } catch (error) {
      console.error(`fetching document ${documentId}:`, error.message);
      return [];
    }
  }

  async findExistingCustomField(fieldName) {
    const normalizedName = fieldName.toLowerCase();

    const cachedField = this.customFieldCache.get(normalizedName);
    if (cachedField) {
      console.debug(`Found custom field "${fieldName}" in cache with ID ${cachedField.id}`);
      return cachedField;
    }

    try {
      const response = await this.client.get('/custom_fields/', {
        params: {
          name__iexact: normalizedName  // Case-insensitive exact match
        }
      });

      if (response.data.results.length > 0) {
        const foundField = response.data.results[0];
        console.debug(`Found existing custom field "${fieldName}" via API with ID ${foundField.id}`);
        this.customFieldCache.set(normalizedName, foundField);
        return foundField;
      }
    } catch (error) {
      console.error(`searching for custom field "${fieldName}":`, error.message);
    }

    return null;
  }

  async refreshCustomFieldCache() {
      try {
        console.debug('Refreshing custom field cache...');
        this.customFieldCache.clear();
        let nextUrl = '/custom_fields/';
        while (nextUrl) {
          const response = await this.client.get(nextUrl);

          // Validate response structure
          if (!response?.data?.results) {
            console.error('Invalid response structure from API:', response?.data);
            break;
          }

          response.data.results.forEach(field => {
            this.customFieldCache.set(field.name.toLowerCase(), field);
          });

          // Fix: Extract only path and query from next URL to prevent HTTP downgrade
          if (response.data.next) {
            try {
              const nextUrlObj = new URL(response.data.next);
              const baseUrlObj = new URL(this.client.defaults.baseURL);

              // Extract path relative to baseURL to avoid double /api/ prefix
              let relativePath = nextUrlObj.pathname;
              if (baseUrlObj.pathname && baseUrlObj.pathname !== '/') {
                // Remove the base path if it's included in the next URL path
                relativePath = relativePath.replace(baseUrlObj.pathname, '');
              }
              // Ensure path starts with /
              if (!relativePath.startsWith('/')) {
                relativePath = '/' + relativePath;
              }

              nextUrl = relativePath + nextUrlObj.search;
              console.debug('Next page URL:', nextUrl);
            } catch (e) {
              console.error('Failed to parse next URL:', e.message);
              nextUrl = null;
            }
          } else {
            nextUrl = null;
          }
        }
        this.lastCustomFieldRefresh = Date.now();
        console.debug(`Custom field cache refreshed. Found ${this.customFieldCache.size} fields.`);
      } catch (error) {
        console.error('refreshing custom field cache:', error.message);
        throw error;
      }
    }

  async getCustomFieldsCached({ refresh = false } = {}) {
    this.initialize();
    if (!this.client) {
      console.debug('Client not initialized for custom fields');
      return [];
    }

    const now = Date.now();
    if (refresh || this.customFieldCache.size === 0 || (now - this.lastCustomFieldRefresh) > this.CACHE_LIFETIME) {
      await this.refreshCustomFieldCache();
    }

    return Array.from(this.customFieldCache.values());
  }


  async findExistingTag(tagName) {
    const normalizedName = tagName.toLowerCase();

    // 1. Zuerst im Cache suchen
    const cachedTag = this.tagCache.get(normalizedName);
    if (cachedTag) {
      console.debug(`Found tag "${tagName}" in cache with ID ${cachedTag.id}`);
      return cachedTag;
    }

    // 2. Direkte API-Suche
    try {
      const response = await this.client.get('/tags/', {
        params: {
          name__iexact: normalizedName  // Case-insensitive exact match
        }
      });

      if (response.data.results.length > 0) {
        const foundTag = response.data.results[0];
        console.debug(`Found existing tag "${tagName}" via API with ID ${foundTag.id}`);
        this.tagCache.set(normalizedName, foundTag);
        return foundTag;
      }
    } catch (error) {
      console.error(`searching for tag "${tagName}":`, error.message);
    }

    return null;
  }

  async createTagSafely(tagName) {
    const normalizedName = tagName.toLowerCase();

    try {
      // Versuche zuerst, den Tag zu erstellen
      const response = await this.client.post('/tags/', { name: tagName });
      const newTag = response.data;
      console.debug(`Successfully created tag "${tagName}" with ID ${newTag.id}`);
      this.tagCache.set(normalizedName, newTag);
      return newTag;
    } catch (error) {
      if (error.response?.status === 400) {
        // Bei einem 400er Fehler könnte der Tag bereits existieren
        // Aktualisiere den Cache und suche erneut
        await this.refreshTagCache();

        // Suche nochmal nach dem Tag
        const existingTag = await this.findExistingTag(tagName);
        if (existingTag) {
          return existingTag;
        }
      }
      throw error; // Wenn wir den Tag nicht finden konnten, werfen wir den Fehler weiter
    }
  }

  async processTags(tagNames, options = {}) {
    try {
      this.initialize();
      await this.ensureTagCache();

      // Check if we should restrict to existing tags
      // Explicitly check options first, then env var
      const restrictToExistingTags = options.restrictToExistingTags === true ||
                                   (options.restrictToExistingTags === undefined &&
                                    this.settings?.restrictToExisting?.tags === true);

      // Input validation
      if (!tagNames) {
        console.debug('No tags provided to processTags');
        return { tagIds: [], errors: [] };
      }

      // Convert to array if string is passed
      const tagsArray = typeof tagNames === 'string'
        ? [tagNames]
        : Array.isArray(tagNames)
          ? tagNames
          : [];

      if (tagsArray.length === 0) {
        console.debug('No valid tags to process');
        return { tagIds: [], errors: [] };
      }

      const tagIds = [];
      const errors = [];
      const processedTags = new Set(); // Prevent duplicates

      console.debug(`Processing tags with restrictToExistingTags=${restrictToExistingTags}`);

      // Process regular tags
      for (const tagName of tagsArray) {
        if (!tagName || typeof tagName !== 'string') {
          console.debug(`Skipping invalid tag name: ${tagName}`);
          errors.push({ tagName, error: 'Invalid tag name' });
          continue;
        }

        const normalizedName = tagName.toLowerCase().trim();

        // Skip empty or already processed tags
        if (!normalizedName || processedTags.has(normalizedName)) {
          continue;
        }

        try {
          // Search for existing tag first
          let tag = await this.findExistingTag(tagName);

          // If no existing tag found and restrictions are not enabled, create new one
          if (!tag && !restrictToExistingTags) {
            tag = await this.createTagSafely(tagName);
          } else if (!tag && restrictToExistingTags) {
            console.debug(`Tag "${tagName}" does not exist and restrictions are enabled, skipping`);
            errors.push({ tagName, error: 'Tag does not exist and restrictions are enabled' });
            continue;
          }

          if (tag && tag.id) {
            tagIds.push(tag.id);
            processedTags.add(normalizedName);
          }

        } catch (error) {
          console.error(`processing tag "${tagName}":`, error.message);
          errors.push({ tagName, error: error.message });
        }
      }

      // Add AI-Processed tag if enabled
      if (this.settings?.postProcessing?.addTags === true && this.settings?.postProcessing?.tagsToAdd) {
        try {
          const aiTagNames = this.normalizeTagList(this.settings.postProcessing.tagsToAdd);
          for (const aiTagName of aiTagNames) {
            let aiTag = await this.findExistingTag(aiTagName);

            if (!aiTag) {
              aiTag = await this.createTagSafely(aiTagName);
            }

            if (aiTag && aiTag.id) {
              tagIds.push(aiTag.id);
            }
          }
        } catch (error) {
          console.error(`processing AI tag "${this.settings.postProcessing.tagsToAdd}":`, error.message);
          errors.push({ tagName: this.settings.postProcessing.tagsToAdd, error: error.message });
        }
      }

      return {
        tagIds: [...new Set(tagIds)], // Remove any duplicates
        errors
      };
    } catch (error) {
      console.error('in processTags:', error);
      throw new Error(`[ERROR] Failed to process tags: ${error.message}`);
    }
  }

  async getTags() {
    this.initialize();
    if (!this.client) {
      console.debug('Client not initialized');
      return [];
    }

    let tags = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const params = {
          page,
          page_size: 100,  // Maximale Seitengröße für effizientes Laden
          ordering: 'name'  // Optional: Sortierung nach Namen
        };

        const response = await this.client.get('/tags/', { params });

        if (!response?.data?.results || !Array.isArray(response.data.results)) {
          console.debug(`Invalid API response on page ${page}`);
          break;
        }

        tags = tags.concat(response.data.results);
        hasMore = response.data.next !== null;
        page++;

        console.log(
          `[DEBUG] Fetched page ${page-1}, got ${response.data.results.length} tags. ` +
          `[DEBUG] Total so far: ${tags.length}`
        );

        // Kleine Verzögerung um die API nicht zu überlasten
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`fetching tags page ${page}:`, error.message);
        if (error.response) {
          console.debug('Response status:', error.response.status);
          console.debug('Response data:', error.response.data);
        }
        break;
      }
    }

    return tags;
  }

  async getCorrespondents() {
    this.initialize();
    if (!this.client) {
      console.debug('Client not initialized');
      return [];
    }

    let correspondents = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const params = {
          page,
          page_size: 100,
          ordering: 'name'
        };

        const response = await this.client.get('/correspondents/', { params });

        if (!response?.data?.results || !Array.isArray(response.data.results)) {
          console.debug(`Invalid API response on page ${page}`);
          break;
        }

        correspondents = correspondents.concat(response.data.results);
        hasMore = response.data.next !== null;
        page++;

        console.log(
          `[DEBUG] Fetched page ${page - 1}, got ${response.data.results.length} correspondents. ` +
          `[DEBUG] Total so far: ${correspondents.length}`
        );

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`fetching correspondents page ${page}:`, error.message);
        if (error.response) {
          console.debug('Response status:', error.response.status);
          console.debug('Response data:', error.response.data);
        }
        break;
      }
    }

    return correspondents;
  }

  async getTagCount() {
    this.initialize();
    try {
      const response = await this.client.get('/tags/', {
        params: { count: true }
      });
      return response.data.count;
    } catch (error) {
      console.error('fetching tag count:', error.message);
      return 0;
    }
  }

  async getCorrespondentCount() {
    this.initialize();
    try {
      const response = await this.client.get('/correspondents/', {
        params: { count: true }
      });
      return response.data.count;
    } catch (error) {
      console.error('fetching correspondent count:', error.message);
      return 0;
    }
  }

  async getDocumentCount() {
    this.initialize();
    try {
      const response = await this.client.get('/documents/', {
        params: { count: true }
      });
      return response.data.count;
    } catch (error) {
      console.error('fetching document count:', error.message);
      return 0;
    }
  }

  async listCorrespondentsNames() {
    this.initialize();
    let allCorrespondents = [];
    let page = 1;
    let hasNextPage = true;

    try {
      while (hasNextPage) {
        const response = await this.client.get('/correspondents/', {
          params: {
            fields: 'id,name',
            count: true,
            page: page
          }
        });

        const { results, next } = response.data;

        // Füge die Ergebnisse der aktuellen Seite hinzu
        allCorrespondents = allCorrespondents.concat(
          results.map(correspondent => ({
            name: correspondent.name,
            id: correspondent.id,
            document_count: correspondent.document_count
          }))
        );

        // Prüfe, ob es eine nächste Seite gibt
        hasNextPage = next !== null;
        page++;

        // Optional: Füge eine kleine Verzögerung hinzu, um die API nicht zu überlasten
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return allCorrespondents;

    } catch (error) {
      console.error('fetching correspondent names:', error.message);
      return [];
    }
  }

  async listDocumentTypesNames() {
    this.initialize();
    let allDocumentTypes = [];
    let page = 1;
    let hasNextPage = true;

    try {
      while (hasNextPage) {
        const response = await this.client.get('/document_types/', {
          params: {
            fields: 'id,name',
            count: true,
            page: page
          }
        });

        const { results, next } = response.data;

        allDocumentTypes = allDocumentTypes.concat(
          results.map(docType => ({
            name: docType.name,
            id: docType.id
          }))
        );

        hasNextPage = next !== null;
        page++;

        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return allDocumentTypes;

    } catch (error) {
      console.error('fetching document type names:', error.message);
      return [];
    }
  }

  async listTagNames() {
    this.initialize();
    let allTags = [];
    let currentPage = 1;
    let hasMorePages = true;

    try {
      while (hasMorePages) {
        const response = await this.client.get('/tags/', {
          params: {
            fields: 'name',
            count: true,
            page: currentPage,
            page_size: 100 // Sie können die Seitengröße nach Bedarf anpassen
          }
        });

        // Füge die Tags dieser Seite zum Gesamtergebnis hinzu
        allTags = allTags.concat(
          response.data.results.map(tag => ({
            name: tag.name,
            document_count: tag.document_count
          }))
        );

        // Prüfe, ob es weitere Seiten gibt
        hasMorePages = response.data.next !== null;
        currentPage++;
      }

      return allTags;
    } catch (error) {
      console.error('Error fetching tag names:', error.message);
      return [];
    }
  }

  async getAllDocuments() {
    this.initialize();
    if (!this.client) {
      console.debug('Client not initialized');
      return [];
    }

    let documents = [];
    let page = 1;
    let hasMore = true;
    const filterSettings = this.settings?.processing?.filter;
    const shouldFilterByTags = filterSettings?.enabled === true;
    let includeTagIds = [];
    let excludeTagIds = [];

    // Vorverarbeitung der Tags, wenn Filter aktiv ist
    if (shouldFilterByTags) {
      const includeTagsValue = filterSettings?.includeTags;
      const excludeTagsValue = filterSettings?.excludeTags;
      const includeTagNames = this.normalizeTagList(includeTagsValue);
      const excludeTagNames = this.normalizeTagList(excludeTagsValue);

      if (includeTagNames.length === 0 && excludeTagNames.length === 0) {
        console.debug('FILTER_DOCUMENTS is set to true but no filter tags are defined');
        return [];
      }

      await this.ensureTagCache();

      for (const tagName of includeTagNames) {
        const tag = await this.findExistingTag(tagName);
        if (tag) {
          includeTagIds.push(tag.id);
        }
      }

      for (const tagName of excludeTagNames) {
        const tag = await this.findExistingTag(tagName);
        if (tag) {
          excludeTagIds.push(tag.id);
        }
      }

      if (includeTagNames.length > 0 && includeTagIds.length === 0) {
        console.debug('None of the specified include tags were found');
        return [];
      }

      if (includeTagIds.length > 0) {
        console.debug('Filtering documents for include tag IDs:', includeTagIds);
      }
      if (excludeTagIds.length > 0) {
        console.debug('Filtering documents for exclude tag IDs:', excludeTagIds);
      }
    }

    while (hasMore) {
      try {
        const params = {
          page,
          page_size: 100,
          fields: 'id,title,created,created_date,added,tags,correspondent'
        };

        // Füge Tag-Filter hinzu, wenn Tags definiert sind
        if (shouldFilterByTags && includeTagIds.length > 0) {
          params.tags__id__in = includeTagIds.join(',');
        }

        const response = await this.client.get('/documents/', { params });

        if (!response?.data?.results || !Array.isArray(response.data.results)) {
          console.debug(`Invalid API response on page ${page}`);
          break;
        }

        let pageResults = response.data.results;
        if (shouldFilterByTags && excludeTagIds.length > 0) {
          pageResults = pageResults.filter(doc => {
            if (!Array.isArray(doc.tags) || doc.tags.length === 0) return true;
            return !doc.tags.some(tagId => excludeTagIds.includes(tagId));
          });
        }

        documents = documents.concat(pageResults);
        hasMore = response.data.next !== null;
        page++;

        console.log(
          `[DEBUG] Fetched page ${page-1}, got ${response.data.results.length} documents. ` +
          `[DEBUG] Total so far: ${documents.length}`
        );

        // Kleine Verzögerung um die API nicht zu überlasten
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(` fetching documents page ${page}:`, error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
        }
        break;
      }
    }

    console.debug(`Finished fetching. Found ${documents.length} documents.`);
    return documents;
}

  async getAllDocumentIds() {
    /**
     * Get all Document IDs from the Paperless API.
     *
     * @returns    An array of all Document IDs.
     * @throws     An error if the request fails.
     * @note       This method is used to get all Document IDs for further processing.
     */
    this.initialize();
    try {
      const response = await this.client.get('/documents/', {
        params: {
          page,
          page_size: 100,
          fields: 'id',
        }
      });
      return response.data.results.map(doc => doc.id);
    } catch (error) {
      console.error('fetching document IDs:', error.message);
      return [];
    }
  }

  async getAllDocumentIdsScan() {
    /**
     * Get all Document IDs from the Paperless API.
     *
     * @returns    An array of all Document IDs.
     * @throws     An error if the request fails.
     * @note       This method is used to get all Document IDs for further processing.
     */
    this.initialize();
    if (!this.client) {
      console.debug('Client not initialized');
      return [];
    }

    let documents = [];
    let page = 1;
    let hasMore = true;
    const filterSettings = this.settings?.processing?.filter;
    const shouldFilterByTags = filterSettings?.enabled === true;
    let includeTagIds = [];
    let excludeTagIds = [];

    // Vorverarbeitung der Tags, wenn Filter aktiv ist
    if (shouldFilterByTags) {
      const includeTagsValue = filterSettings?.includeTags;
      const excludeTagsValue = filterSettings?.excludeTags;
      const includeTagNames = this.normalizeTagList(includeTagsValue);
      const excludeTagNames = this.normalizeTagList(excludeTagsValue);

      if (includeTagNames.length === 0 && excludeTagNames.length === 0) {
        console.debug('FILTER_DOCUMENTS is set to true but no filter tags are defined');
        return [];
      }

      await this.ensureTagCache();

      for (const tagName of includeTagNames) {
        const tag = await this.findExistingTag(tagName);
        if (tag) {
          includeTagIds.push(tag.id);
        }
      }

      for (const tagName of excludeTagNames) {
        const tag = await this.findExistingTag(tagName);
        if (tag) {
          excludeTagIds.push(tag.id);
        }
      }

      if (includeTagNames.length > 0 && includeTagIds.length === 0) {
        console.debug('None of the specified include tags were found');
        return [];
      }

      if (includeTagIds.length > 0) {
        console.debug('Filtering documents for include tag IDs:', includeTagIds);
      }
      if (excludeTagIds.length > 0) {
        console.debug('Filtering documents for exclude tag IDs:', excludeTagIds);
      }
    }

    while (hasMore) {
      try {
        const params = {
          page,
          page_size: 100,
          fields: shouldFilterByTags && excludeTagIds.length > 0 ? 'id,tags' : 'id'
        };
        if (shouldFilterByTags && includeTagIds.length > 0) {
          params.tags__id__in = includeTagIds.join(',');
        }

        const response = await this.client.get('/documents/', { params });

        if (!response?.data?.results || !Array.isArray(response.data.results)) {
          console.error(`Invalid API response on page ${page}`);
          break;
        }

        let pageResults = response.data.results;
        if (shouldFilterByTags && excludeTagIds.length > 0) {
          pageResults = pageResults.filter(doc => {
            if (!Array.isArray(doc.tags) || doc.tags.length === 0) return true;
            return !doc.tags.some(tagId => excludeTagIds.includes(tagId));
          });
        }

        documents = documents.concat(pageResults);
        hasMore = response.data.next !== null;
        page++;

        console.log(
          `[DEBUG] Fetched page ${page-1}, got ${response.data.results.length} documents. ` +
          `[DEBUG] Total so far: ${documents.length}`
        );

        // Kleine Verzögerung um die API nicht zu überlasten
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`fetching documents page ${page}:`, error.message);
        if (error.response) {
          console.debug('Response status:', error.response.status);
        }
        break;
      }
    }

    console.debug(`Finished fetching. Found ${documents.length} documents.`);
    return documents;
  }

  async getDocumentProcessingBreakdown(processedDocumentIds = []) {
    this.initialize();
    if (!this.client) {
      console.debug('Client not initialized');
      return null;
    }

    const totalCount = await this.getDocumentCount();
    const processedIdSet = new Set((processedDocumentIds || []).map(id => Number(id)));
    const filterSettings = this.settings?.processing?.filter;
    const shouldFilterByTags = filterSettings?.enabled === true;

    const includeTagNames = this.normalizeTagList(filterSettings?.includeTags);
    const excludeTagNames = this.normalizeTagList(filterSettings?.excludeTags);
    const includeTagsActive = includeTagNames.length > 0;
    const excludeTagsActive = excludeTagNames.length > 0;

    if (!shouldFilterByTags) {
      return {
        totalCount,
        processedCount: processedIdSet.size,
        excludedCount: 0,
        notIncludedCount: 0,
        inScopeCount: Math.max(totalCount - processedIdSet.size, 0),
        includeTagsActive: false,
        excludeTagsActive: false
      };
    }

    if (!includeTagsActive && !excludeTagsActive) {
      return {
        totalCount,
        processedCount: processedIdSet.size,
        excludedCount: 0,
        notIncludedCount: 0,
        inScopeCount: Math.max(totalCount - processedIdSet.size, 0),
        includeTagsActive: false,
        excludeTagsActive: false
      };
    }

    await this.ensureTagCache();

    const includeTagIds = [];
    const excludeTagIds = [];

    for (const tagName of includeTagNames) {
      const tag = await this.findExistingTag(tagName);
      if (tag) {
        includeTagIds.push(tag.id);
      }
    }

    for (const tagName of excludeTagNames) {
      const tag = await this.findExistingTag(tagName);
      if (tag) {
        excludeTagIds.push(tag.id);
      }
    }

    const includeTagIdSet = new Set(includeTagIds);
    const excludeTagIdSet = new Set(excludeTagIds);

    let excludedCount = 0;
    let notIncludedCount = 0;
    let inScopeCount = 0;

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get('/documents/', {
          params: {
            page,
            page_size: 100,
            fields: 'id,tags'
          }
        });

        if (!response?.data?.results || !Array.isArray(response.data.results)) {
          console.debug(`Invalid API response on page ${page}`);
          break;
        }

        for (const doc of response.data.results) {
          const docId = Number(doc.id);
          if (processedIdSet.has(docId)) {
            continue;
          }

          const docTags = Array.isArray(doc.tags) ? doc.tags : [];
          const hasExclude = excludeTagIdSet.size > 0 && docTags.some(tagId => excludeTagIdSet.has(tagId));

          if (hasExclude) {
            excludedCount += 1;
            continue;
          }

          if (includeTagIdSet.size > 0) {
            const hasInclude = docTags.some(tagId => includeTagIdSet.has(tagId));
            if (hasInclude) {
              inScopeCount += 1;
            } else {
              notIncludedCount += 1;
            }
            continue;
          }

          inScopeCount += 1;
        }

        hasMore = response.data.next !== null;
        page += 1;
      } catch (error) {
        console.error(`fetching documents page ${page} for breakdown:`, error.message);
        if (error.response) {
          console.debug('Response status:', error.response.status);
        }
        break;
      }
    }

    return {
      totalCount,
      processedCount: processedIdSet.size,
      excludedCount,
      notIncludedCount: includeTagIdSet.size > 0 ? notIncludedCount : 0,
      inScopeCount,
      includeTagsActive,
      excludeTagsActive
    };
  }

  async getCorrespondentNameById(correspondentId) {
    /**
     * Get the Name of a Correspondent by its ID.
     *
     * @param   id  The id of the correspondent.
     * @returns    The name of the correspondent.
     */
    this.initialize();
    try {
      const response = await this.client.get(`/correspondents/${correspondentId}/`);
      return response.data;
    } catch (error) {
      console.error(`fetching correspondent ${correspondentId}:`, error.message);
      return null;
    }
  }

  async getTagNameById(tagId) {
    /**
     * Get the Name of a Tag by its ID.
     *
     * @param   id  The id of the tag.
     * @returns    The name of the tag.
     */
    this.initialize();
    try {
      const response = await this.client.get(`/tags/${tagId}/`);
      return response.data.name;
    } catch (error) {
      console.error(`fetching tag name for ID ${tagId}:`, error.message);
      return null;
    }
  }

  async getDocumentsWithTitleTagsCorrespondentCreated () {
    /**
     * Get all documents with metadata (title, tags, correspondent, created date).
     *
     * @returns    An array of documents with metadata.
     * @throws     An error if the request fails.
     * @note       This method is used to get all documents with metadata for further processing
     */

    this.initialize();
    try {
      const response = await this.client.get('/documents/', {
        params: {
          fields: 'id,title,tags,correspondent,created'
        }
      });
      return response.data.results;
    } catch (error) {
      console.error('fetching documents with metadata:', error.message);
      return [];
    }
  }

  async getDocumentsForRAGService () {
    /**
     * Get all documents with metadata (title, tags, correspondent, created date and content).
     *
     * @returns    An array of documents with metadata.
     * @throws     An error if the request fails.
     * @note       This method is used to get all documents with metadata for further processing
     */

    this.initialize();
    try {
      let response;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          const params = {
            params: { fields: 'id,title,tags,correspondent,created,content' },
            page,
            page_size: 100,  // Maximale Seitengröße für effizientes Laden
            ordering: 'name'  // Optional: Sortierung nach Namen
          };

          response = await this.client.get('/documents/', { params });

          if (!response?.data?.results || !Array.isArray(response.data.results)) {
            console.debug(`Invalid API response on page ${page}`);
            break;
          }

          hasMore = response.data.next !== null;
          page++;

        } catch (error) {
          console.error(`fetching documents page ${page}:`, error.message);
          if (error.response) {
            console.error('Response status:', error.response.status);
          }
          break;
        }
      }
      return response.data.results;
    } catch (error) {
      console.error('fetching documents with metadata:', error.message);
      return [];
    }
  }


  // Aktualisierte getDocuments Methode
  async getDocuments() {
    return this.getAllDocuments();
  }

  async getDocumentContent(documentId) {
    this.initialize();
    const response = await this.client.get(`/documents/${documentId}/`);
    return response.data.content;
  }

  async getDocument(documentId) {
    this.initialize();
    try {
      const response = await this.client.get(`/documents/${documentId}/`);
      return response.data;
    } catch (error) {
      console.error(`fetching document ${documentId}:`, error.message);
      throw error;
    }
  }

  async getDocumentFile(documentId, original = true) {
    this.initialize();
    try {
      const response = await this.client.get(`/documents/${documentId}/download/`, {
        params: { original: !!original },
        responseType: 'arraybuffer'
      });

      if (response.data && response.data.byteLength > 0) {
        return {
          'content-type': response.headers['content-type'],
          'size': response.headers['content-length'],
          'content': Buffer.from(response.data)
        }
      }

      console.debug(`No file data for document ${documentId}`);
      throw `No file data for document ${documentId}`;
    } catch (error) {
      console.error(`fetching document file ${documentId}:`, error.message);
      if (error.response) {
        console.error('status:', error.response.status);
        console.error('headers:', error.response.headers);
      }
      throw error;
    }
  }

  async searchForCorrespondentById(id) {
    try {
      const response = await this.client.get('/correspondents/', {
          params: {
              id: id
          }
      });

      const results = response.data.results;

      if (results.length === 0) {
          console.debug(`No correspondent with "${id}" found`);
          return null;
      }

      if (results.length > 1) {
          console.debug(`Multiple correspondents found:`);
          results.forEach(c => {
              console.log(`- ID: ${c.id}, Name: ${c.name}`);
          });
          return results;
      }

      // Genau ein Ergebnis gefunden
      return {
          id: results[0].id,
          name: results[0].name
      };

  } catch (error) {
      console.error('while seraching for existing correspondent:', error.message);
      throw error;
  }
}

async searchForExistingCorrespondent(correspondent) {
  try {
      const response = await this.client.get('/correspondents/', {
          params: {
              name__icontains: correspondent
          }
      });

      const results = response.data.results;

      if (results.length === 0) {
          console.debug(`No correspondent with name "${correspondent}" found`);
          return null;
      }

      // Check for exact match in the results - thanks to @skius for the hint!
      const exactMatch = results.find(c => c.name.toLowerCase() === correspondent.toLowerCase());
      if (exactMatch) {
          console.debug(`Found exact match for correspondent "${correspondent}" with ID ${exactMatch.id}`);
          return {
              id: exactMatch.id,
              name: exactMatch.name
          };
      }

      // No exact match found, return null
      console.debug(`No exact match found for "${correspondent}"`);
      return null;

  } catch (error) {
      console.error('while searching for existing correspondent:', error.message);
      throw error;
  }
}

  async getOrCreateCorrespondent(name, options = {}) {
    this.initialize();

    // Check if we should restrict to existing correspondents
    // Explicitly check options first, then env var
    const restrictToExistingCorrespondents = options.restrictToExistingCorrespondents === true ||
                                           (options.restrictToExistingCorrespondents === undefined &&
                                            this.settings?.restrictToExisting?.correspondents === true);

    console.debug(`Processing correspondent with restrictToExistingCorrespondents=${restrictToExistingCorrespondents}`);

    try {
        // Search for the correspondent
        const existingCorrespondent = await this.searchForExistingCorrespondent(name);
        console.debug("Response Correspondent Search: ", existingCorrespondent);

        if (existingCorrespondent) {
            console.debug(`Found existing correspondent "${name}" with ID ${existingCorrespondent.id}`);
            return existingCorrespondent;
        }

        // If we're restricting to existing correspondents and none was found, return null
        if (restrictToExistingCorrespondents) {
            console.debug(`Correspondent "${name}" does not exist and restrictions are enabled, returning null`);
            return null;
        }

        // Create new correspondent only if restrictions are not enabled
        try {
            const createResponse = await this.client.post('/correspondents/', {
                name: name,
                matching_algorithm: 0
            });
            console.debug(`Created new correspondent "${name}" with ID ${createResponse.data.id}`);
            return createResponse.data;
        } catch (createError) {
            if (createError.response?.status === 400 &&
                createError.response?.data?.error?.includes('unique constraint')) {

                // Race condition check - another process might have created it
                const retryResponse = await this.client.get('/correspondents/', {
                    params: { name: name }
                });

                const justCreatedCorrespondent = retryResponse.data.results.find(
                    c => c.name.toLowerCase() === name.toLowerCase()
                );

                if (justCreatedCorrespondent) {
                    console.debug(`Retrieved correspondent "${name}" after constraint error with ID ${justCreatedCorrespondent.id}`);
                    return justCreatedCorrespondent;
                }
            }
            throw createError;
        }
    } catch (error) {
        console.error(`Failed to process correspondent "${name}":`, error.message);
        throw error;
    }
}

async searchForExistingDocumentType(documentType) {
  try {
      const response = await this.client.get('/document_types/', {
          params: {
              name__icontains: documentType
          }
      });

      const results = response.data.results;

      if (results.length === 0) {
          console.debug(`No document type with name "${documentType}" found`);
          return null;
      }

      // Check for exact match in the results
      const exactMatch = results.find(dt => dt.name.toLowerCase() === documentType.toLowerCase());
      if (exactMatch) {
          console.debug(`Found exact match for document type "${documentType}" with ID ${exactMatch.id}`);
          return {
              id: exactMatch.id,
              name: exactMatch.name
          };
      }

      // No exact match found, return null
      console.debug(`No exact match found for "${documentType}"`);
      return null;

  } catch (error) {
      console.error('while searching for existing document type:', error.message);
      throw error;
  }
}

async getOrCreateDocumentType(name) {
  this.initialize();

  try {
      // Suche nach existierendem document_type
      const existingDocType = await this.searchForExistingDocumentType(name);
      console.debug("Response Document Type Search: ", existingDocType);

      if (existingDocType) {
          console.debug(`Found existing document type "${name}" with ID ${existingDocType.id}`);
          return existingDocType;
      }

      // Erstelle neuen document_type
      try {
          const createResponse = await this.client.post('/document_types/', {
              name: name,
              matching_algorithm: 1, // 1 = ANY
              match: "",  // Optional: Kann später angepasst werden
              is_insensitive: true
          });
          console.debug(`Created new document type "${name}" with ID ${createResponse.data.id}`);
          return createResponse.data;
      } catch (createError) {
          if (createError.response?.status === 400 &&
              createError.response?.data?.error?.includes('unique constraint')) {

              // Race condition check
              const retryResponse = await this.client.get('/document_types/', {
                  params: { name: name }
              });

              const justCreatedDocType = retryResponse.data.results.find(
                  dt => dt.name.toLowerCase() === name.toLowerCase()
              );

              if (justCreatedDocType) {
                  console.debug(`Retrieved document type "${name}" after constraint error with ID ${justCreatedDocType.id}`);
                  return justCreatedDocType;
              }
          }
          throw createError;
      }
  } catch (error) {
      console.error(`Failed to process document type "${name}":`, error.message);
      throw error;
  }
}

  async removeUnusedTagsFromDocument(documentId, keepTagIds) {
    this.initialize();
    if (!this.client) return;

    try {
      console.debug(`Removing unused tags from document ${documentId}, keeping tags:`, keepTagIds);

      // Hole aktuelles Dokument
      const currentDoc = await this.getDocument(documentId);

      // Finde Tags die entfernt werden sollen (die nicht in keepTagIds sind)
      const tagsToRemove = currentDoc.tags.filter(tagId => !keepTagIds.includes(tagId));

      if (tagsToRemove.length === 0) {
        console.debug('No tags to remove');
        return currentDoc;
      }

      // Update das Dokument mit nur den zu behaltenden Tags
      const updateData = {
        tags: keepTagIds
      };

      // Führe das Update durch
      await this.client.patch(`/documents/${documentId}/`, updateData);
      console.debug(`Successfully removed ${tagsToRemove.length} tags from document ${documentId}`);

      return await this.getDocument(documentId);
    } catch (error) {
      console.error(`Error removing unused tags from document ${documentId}:`, error.message);
      throw error;
    }
  }

  async removeTagsFromDocument(documentId, tagNames) {
    this.initialize();
    if (!this.client) return null;

    const normalizedTagNames = this.normalizeTagList(tagNames);
    if (normalizedTagNames.length === 0) {
      return null;
    }

    try {
      const currentDoc = await this.getDocument(documentId);
      const currentTagIds = Array.isArray(currentDoc?.tags) ? currentDoc.tags : [];

      const tagsToRemove = new Set();

      for (const tagName of normalizedTagNames) {
        if (!tagName) continue;
        const numericId = Number(tagName);
        if (!Number.isNaN(numericId) && Number.isFinite(numericId)) {
          tagsToRemove.add(numericId);
          continue;
        }
        const existing = await this.findExistingTag(tagName);
        if (existing?.id) {
          tagsToRemove.add(existing.id);
        }
      }

      if (tagsToRemove.size === 0) {
        return currentDoc;
      }

      const filteredTags = currentTagIds.filter(tagId => !tagsToRemove.has(tagId));
      if (filteredTags.length === currentTagIds.length) {
        return currentDoc;
      }

      await this.client.patch(`/documents/${documentId}/`, { tags: filteredTags });
      console.debug(`Removed tags from document ${documentId}:`, Array.from(tagsToRemove));
      return await this.getDocument(documentId);
    } catch (error) {
      console.error(`Error removing tags from document ${documentId}:`, error.message);
      throw error;
    }
  }

  async getTagTextFromId(tagId) {
    this.initialize();
    try {
      const response = await this.client.get(`/tags/${tagId}/`);
      return response.data.name;
    } catch (error) {
      console.error(`fetching tag text for ID ${tagId}:`, error.message);
      return null;
    }
  }

  async getOwnUserID() {
    this.initialize();
    try {
      const uiSettingsResponse = await this.client.get('/ui_settings/');
      const userId = uiSettingsResponse?.data?.user?.id;
      if (userId) {
        console.debug(`Found own user ID from ui_settings: ${userId}`);
        return userId;
      }
      return null;
    } catch (error) {
        console.error('fetching own user ID:', error.message);
        return null;
    }
}
  //Remove if not needed?
  async getOwnerOfDocument(documentId) {
    this.initialize();
    try {
      const response = await this.client.get(`/documents/${documentId}/`);
      return response.data.owner;
    } catch (error) {
      console.error(`fetching owner of document ${documentId}:`, error.message);
      return null;
    }
  }

  // Checks if the document is accessable by the current user
  async getPermissionOfDocument(documentId) {
    this.initialize();
    try {
      const response = await this.client.get(`/documents/${documentId}/`);
      return response.data.user_can_change;
    } catch (error) {
      console.error(`No Permission to edit document ${documentId}:`, error.message);
      return null;
    }
  }


  async updateDocument(documentId, updates) {
    this.initialize();
    if (!this.client) return;
    try {
      const currentDoc = await this.getDocument(documentId);

      if (updates.tags) {
        console.debug(`Current tags for document ${documentId}:`, currentDoc.tags);
        console.debug(`Adding new tags:`, updates.tags);

        const combinedTags = [...new Set([...currentDoc.tags, ...updates.tags])];
        updates.tags = combinedTags;

        console.debug(`Combined tags:`, combinedTags);
      }

      if (currentDoc.correspondent && updates.correspondent) {
        console.debug(`Current correspondent:`, currentDoc.correspondent);
        console.debug(`New correspondent:`, updates.correspondent);
        console.debug('Document already has a correspondent, keeping existing one:', currentDoc.correspondent);
        delete updates.correspondent;
      }

      let updateData;
      try {
        if (updates.created) {
          let dateObject;

          dateObject = parseISO(updates.created);

          if (!isValid(dateObject)) {
            dateObject = parse(updates.created, 'dd.MM.yyyy', new Date());
            if (!isValid(dateObject)) {
              dateObject = parse(updates.created, 'dd-MM-yyyy', new Date());
            }
          }

          if (!isValid(dateObject)) {
            console.warn(`Invalid date format: ${updates.created}, using fallback date: 01.01.1990`);
            dateObject = new Date(1990, 0, 1);
          }

          updateData = {
            ...updates,
            created: format(dateObject, 'yyyy-MM-dd'),
          };
        } else {
          updateData = { ...updates };
        }
      } catch (error) {
        console.warn('Error parsing date:', error.message);
        console.debug('Received Date:', updates);
        updateData = {
          ...updates,
          created: format(new Date(1990, 0, 1), 'yyyy-MM-dd'),
        };
      }

      // // Handle custom fields update
      // if (updateData.custom_fields) {
      //   console.debug('Custom fields update detected');
      //   try {
      //     // First, delete existing custom fields
      //     console.debug(`Deleting existing custom fields for document ${documentId}`);
      //     await this.client.delete(`/documents/${documentId}/custom_fields/`);
      //   } catch (error) {
      //     // If deletion fails, try updating with empty array first
      //     console.warn('Could not delete custom fields, trying to clear them:', error.message);
      //     await this.client.patch(`/documents/${documentId}/`, { custom_fields: [] });
      //   }
      // }

      // Validate title length before sending to API
      if (updateData.title && updateData.title.length > 128) {
        updateData.title = updateData.title.substring(0, 124) + '…';
        console.warn(`Title truncated to 128 characters for document ${documentId}`);
      }

      console.debug('Final update data:', updateData);
      await this.client.patch(`/documents/${documentId}/`, updateData);
      console.info(`Updated document ${documentId} with:`, updateData);
      return await this.getDocument(documentId);
    } catch (error) {
      console.log(error);
      console.error(`updating document ${documentId}:`, error.message);
      return null;
    }
  }
}


module.exports = PaperlessService;
