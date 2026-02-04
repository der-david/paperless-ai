const configService = require('./configService');

const parseBoolean = (value, defaultValue = false) => configService.parseBoolean(value, defaultValue);

const buildRequiredPaperlessPermissions = ({
  enableUpdates = {},
  restrictToExisting = {},
  postProcessingAddTags,
  postProcessingRemoveTags
} = {}) => {
  const needsTagging = parseBoolean(enableUpdates.tags, true) ||
    parseBoolean(postProcessingAddTags, false) ||
    parseBoolean(postProcessingRemoveTags, false);
  const needsCorrespondent = parseBoolean(enableUpdates.correspondent, true);
  const needsDocumentType = parseBoolean(enableUpdates.documentType, true);
  const needsCustomFields = parseBoolean(enableUpdates.customFields, true);
  const needsContent = parseBoolean(enableUpdates.content, false);
  const needsTitle = parseBoolean(enableUpdates.title, true);
  const needsDocumentDate = parseBoolean(enableUpdates.documentDate, true);
  const needsLanguage = parseBoolean(enableUpdates.language, true);
  const needsDocUpdate = needsTagging || needsCorrespondent || needsDocumentType || needsTitle || needsDocumentDate || needsLanguage || needsContent;
  const restrictToExistingTags = parseBoolean(restrictToExisting.tags, false);
  const restrictToExistingCorrespondents = parseBoolean(restrictToExisting.correspondents, false);
  const restrictToExistingDocumentTypes = parseBoolean(restrictToExisting.documentTypes, false);

  const required = new Set(['documents.view_document']);

  if (needsCorrespondent) {
    required.add('documents.view_correspondent');
    if (!restrictToExistingCorrespondents) {
      required.add('documents.add_correspondent');
    }
  }
  if (needsCustomFields) {
    required.add('documents.view_customfield');
    required.add('documents.view_customfieldinstance');
    required.add('documents.change_customfieldinstance');
    required.add('documents.add_customfieldinstance');
  }
  if (needsDocumentType) {
    required.add('documents.view_documenttype');
    if (!restrictToExistingDocumentTypes) {
      required.add('documents.add_documenttype');
    }
  }
  if (needsTagging) {
    required.add('documents.view_tag');
    if (!restrictToExistingTags) {
      required.add('documents.add_tag');
    }
  }
  if (needsDocUpdate) {
    required.add('documents.change_document');
  }

  return Array.from(required);
};

module.exports = {
  parseBoolean,
  buildRequiredPaperlessPermissions
};
