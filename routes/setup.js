const express = require('express');
const router = express.Router();
const container = require('../services/container');
const configService = container.getConfigService();
const paperlessService = container.getPaperlessService();
const { parseBoolean, buildRequiredPaperlessPermissions } = require('../services/setupUtils');
const PaperlessService = require('../services/paperlessService');
const documentModel = require('../models/document.js');
const ChatService = container.getChatService();
const documentsService = container.getDocumentsService();
const RAGService = container.getRagService();
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { authenticateJWT, authenticateAPIKey, authenticateAPI, authenticateUI } = require('./auth.js');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const getRuntimeConfig = () => configService.getRuntimeConfig();


/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User authentication and authorization endpoints, including login, logout, and token management
 *   - name: Documents
 *     description: Document management and processing endpoints for interacting with Paperless-ngx documents
 *   - name: History
 *     description: Document processing history and tracking of AI-generated metadata
 *   - name: Navigation
 *     description: General navigation endpoints for the web interface
 *   - name: System
 *     description: System configuration, health checks, and administrative functions
 *   - name: Chat
 *     description: Document chat functionality for interacting with document content using AI
 *   - name: Setup
 *     description: Application setup and configuration endpoints
 *   - name: Metadata
 *     description: Endpoints for managing document metadata like tags, correspondents, and document types
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message
 *           example: Error resetting documents
 *     User:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           description: User's username
 *         password:
 *           type: string
 *           format: password
 *           description: User's password (will be hashed)
 *     Document:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Document ID
 *           example: 123
 *         title:
 *           type: string
 *           description: Document title
 *           example: Invoice #12345
 *         tags:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of tag IDs
 *           example: [1, 4, 7]
 *         correspondent:
 *           type: integer
 *           description: Correspondent ID
 *           example: 5
 *     HistoryItem:
 *       type: object
 *       properties:
 *         document_id:
 *           type: integer
 *           description: Document ID
 *           example: 123
 *         title:
 *           type: string
 *           description: Document title
 *           example: Invoice #12345
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Date and time when the processing occurred
 *         tags:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Tag'
 *         correspondent:
 *           type: string
 *           description: Document correspondent name
 *           example: Acme Corp
 *         link:
 *           type: string
 *           description: Link to the document in Paperless-ngx
 *     Tag:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Tag ID
 *           example: 5
 *         name:
 *           type: string
 *           description: Tag name
 *           example: Invoice
 *         color:
 *           type: string
 *           description: Tag color (hex code)
 *           example: "#FF5733"
 */

// API endpoints that should not redirect
const API_ENDPOINTS = ['/health'];
// Routes that don't require authentication
let PUBLIC_ROUTES = [
  '/health',
  '/login',
  '/logout',
  '/setup'
];

// Combined middleware to check authentication and setup
router.use(async (req, res, next) => {
  /*
  const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
  const apiKey = req.headers['x-api-key'];
  */
  // Public route check
  if (PUBLIC_ROUTES.some(route => req.path.startsWith(route))) {
    next();
    return;
  }
  /*
  // API key authentication
  if (apiKey && apiKey === process.env.API_KEY) {
    req.user = { apiKey: true };
  } else {
    // Fallback to JWT authentication
    if (!token) {
      return res.redirect('/login');
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      res.clearCookie('jwt');
      return res.redirect('/login');
    }
  }
  */

  // Setup check
  try {
    const isConfigured = await configService.isConfigured();

    const initialSetupEnabled = parseBoolean(process.env.PAPERLESS_AI_INITIAL_SETUP, false);
    if (!isConfigured && !initialSetupEnabled && !req.path.startsWith('/setup')) {
      return res.redirect('/setup');
    } else if (!isConfigured && initialSetupEnabled && !req.path.startsWith('/settings')) {
      return res.redirect('/settings');
    }
  } catch (error) {
    console.error('Error checking setup configuration:', error);
    return res.status(500).send('Internal Server Error');
  }
  next();
});

// Protected route middleware for API endpoints
const protectApiRoute = (req, res, next) => {
  const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

/**
 * @swagger
 * /login:
 *   get:
 *     summary: Render login page or redirect to setup if no users exist
 *     description: |
 *       Serves the login page for user authentication to the Paperless-AI application.
 *       If no users exist in the database, the endpoint automatically redirects to the setup page
 *       to complete the initial application configuration.
 *
 *       This endpoint handles both new user sessions and returning users whose
 *       sessions have expired.
 *     tags:
 *       - Authentication
 *       - Navigation
 *     responses:
 *       200:
 *         description: Login page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the login page
 *       302:
 *         description: Redirect to setup page if no users exist, or to dashboard if already authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/setup"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/login', (req, res) => {
  //check if a user exists beforehand
  documentModel.getUsers().then((users) => {
    if(users.length === 0) {
      res.redirect('setup');
    } else {
      res.render('login', { error: null, layout: false });
    }
  });
});

// Login page route
/**
 * @swagger
 * /login:
 *   post:
 *     summary: Authenticate user with username and password
 *     description: |
 *       Authenticates a user using their username and password credentials.
 *       If authentication is successful, a JWT token is generated and stored in a secure HTTP-only
 *       cookie for subsequent requests.
 *
 *       Failed login attempts are logged for security purposes, and multiple failures
 *       may result in temporary account lockout depending on configuration.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: User's login name
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: "securepassword"
 *               rememberMe:
 *                 type: boolean
 *                 description: Whether to extend the session lifetime
 *                 example: false
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 redirect:
 *                   type: string
 *                   description: URL to redirect to after successful login
 *                   example: "/dashboard"
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               description: HTTP-only cookie containing JWT token
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid username or password"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log('Login attempt for user:', username);
    // Get user data - returns a single user object
    const user = await documentModel.getUser(username);

    // Check if user was found and has required fields
    if (!user || !user.password) {
      console.warn('Failed login  User not found or invalid data:', username);
      return res.render('login', { error: 'Invalid credentials', layout: false });
    }

    // Compare passwords
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password validation result:', isValidPassword);

    if (isValidPassword) {
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
      });

      return res.redirect('/dashboard');
    }else{
      return res.render('login', { error: 'Invalid credentials', layout: false });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'An error occurred during login', layout: false });
  }
});

// Logout route
/**
 * @swagger
 * /logout:
 *   get:
 *     summary: Log out user and clear JWT cookie
 *     description: |
 *       Terminates the current user session by invalidating and clearing the JWT authentication
 *       cookie. After logging out, the user is redirected to the login page.
 *
 *       This endpoint also clears any session-related data stored on the server side
 *       for the current user.
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       302:
 *         description: Logout successful, redirected to login page
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               description: HTTP-only cookie with cleared JWT token and immediate expiration
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/logout', (req, res) => {
  res.clearCookie('jwt');
  res.redirect('/login');
});

/**
 * @swagger
 * /sampleData/{id}:
 *   get:
 *     summary: Get sample data for a document
 *     description: |
 *       Retrieves sample data extracted from a document, including processed text content
 *       and any metadata that has been extracted or processed by the AI.
 *
 *       This endpoint is commonly used for previewing document data in the UI before
 *       completing document processing or updating metadata.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID to retrieve sample data for
 *         example: 123
 *     responses:
 *       200:
 *         description: Document sample data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   description: Extracted text content from the document
 *                   example: "Invoice from Acme Corp. Total amount: $125.00, Due date: 2023-08-15"
 *                 metadata:
 *                   type: object
 *                   description: Any metadata that has been extracted from the document
 *                   properties:
 *                     title:
 *                       type: string
 *                       example: "Acme Corp Invoice - August 2023"
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Invoice", "Finance"]
 *                     correspondent:
 *                       type: string
 *                       example: "Acme Corp"
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Document not found"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/sampleData/:id', authenticateAPI, async (req, res) => {
  try {
    //get all correspondents from one document by id
    const document = await paperlessService.getDocument(req.params.id);
    const correspondents = await paperlessService.getCorrespondentsFromDocument(document.id);

  } catch (error) {
    console.error('loading sample data:', error);
    res.status(500).json({ error: 'Error loading sample data' });
  }
});

// Documents view route
/**
 * @swagger
 * /playground:
 *   get:
 *     summary: AI playground testing environment
 *     description: |
 *       Renders the AI playground page for experimenting with document analysis.
 *
 *       This interactive environment allows users to test different AI providers and prompts
 *       on document content without affecting the actual document processing workflow.
 *       Users can paste document text, customize prompts, and see raw AI responses
 *       to better understand how the AI models analyze document content.
 *
 *       The playground is useful for fine-tuning prompts and testing AI capabilities
 *       before applying them to actual document processing.
 *     tags:
 *       - Navigation
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Playground page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the AI playground interface
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/playground', authenticateUI, async (req, res) => {
  try {
    const {
      documents,
      tagNames,
      correspondentNames,
      paperlessApiUrl
    } = await documentsService.getDocumentsWithMetadata();

    //limit documents to 16 items
    documents.length = 16;

    res.render('playground', {
      documents,
      tagNames,
      correspondentNames,
      paperlessApiUrl,
      version: getRuntimeConfig().version || ' ',
      active: 'playground',
      title: 'Paperless-AI Playground'
    });
  } catch (error) {
    console.error('loading documents view:', error);
    res.status(500).send('Error loading documents');
  }
});

/**
 * @swagger
 * /thumb/{documentId}:
 *   get:
 *     summary: Get document thumbnail
 *     description: |
 *       Retrieves the thumbnail image for a specific document from the Paperless-ngx system.
 *       This endpoint proxies the request to the Paperless-ngx API and returns the thumbnail
 *       image for display in the UI.
 *
 *       The thumbnail is returned as an image file in the format provided by Paperless-ngx,
 *       typically JPEG or PNG.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the document to retrieve thumbnail for
 *         example: 123
 *     responses:
 *       200:
 *         description: Thumbnail retrieved successfully
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Document or thumbnail not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Thumbnail not found"
 *       500:
 *         description: Server error or Paperless-ngx connection failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/thumb/:documentId', authenticateAPI, async (req, res) => {
  const cachePath = path.join('./public/images', `${req.params.documentId}.png`);

  try {
    // Prüfe ob das Bild bereits im Cache existiert
    try {
      await fs.access(cachePath);
      console.log('Serving cached thumbnail');

      // Wenn ja, sende direkt das gecachte Bild
      res.setHeader('Content-Type', 'image/png');
      return res.sendFile(path.resolve(cachePath));

    } catch (err) {
      // File existiert nicht im Cache, hole es von Paperless
      console.log('Thumbnail not cached, fetching from Paperless');

      const thumbnailData = await paperlessService.getThumbnailImage(req.params.documentId);

      if (!thumbnailData) {
        return res.status(404).send('Thumbnail nicht gefunden');
      }

      // Speichere im Cache
      await fs.mkdir(path.dirname(cachePath), { recursive: true }); // Erstelle Verzeichnis falls nicht existiert
      await fs.writeFile(cachePath, thumbnailData);

      // Sende das Bild
      res.setHeader('Content-Type', 'image/png');
      res.send(thumbnailData);
    }

  } catch (error) {
    console.error('Fehler beim Abrufen des Thumbnails:', error);
    res.status(500).send('Fehler beim Laden des Thumbnails');
  }
});

// Hauptseite mit Dokumentenliste
/**
 * @swagger
 * /chat:
 *   get:
 *     summary: Chat interface page
 *     description: |
 *       Renders the chat interface page where users can interact with document-specific AI assistants.
 *       This page displays a list of available documents and the chat interface for the selected document.
 *     tags:
 *       - Navigation
 *       - Chat
 *     parameters:
 *       - in: query
 *         name: open
 *         schema:
 *           type: string
 *         description: ID of document to open immediately in chat
 *         required: false
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Chat interface page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/chat', authenticateUI, async (req, res) => {
  try {
      const {open} = req.query;
      const documents = await paperlessService.getDocuments();
      const version = getRuntimeConfig().version || ' ';
      res.render('chat', { documents, open, version, active: 'chat', title: 'Paperless-AI Chat' });
  } catch (error) {
    console.error('loading documents:', error);
    res.status(500).send('Error loading documents');
  }
});

/**
 * @swagger
 * /chat/init:
 *   get:
 *     summary: Initialize chat for a document via query parameter
 *     description: |
 *       Initializes a chat session for a specific document identified by the query parameter.
 *       Loads document content and prepares it for the chat interface.
 *       This endpoint returns the document content, chat history if available, and initial context.
 *     tags:
 *       - API
 *       - Chat
 *     parameters:
 *       - in: query
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the document to initialize chat for
 *         example: "123"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Chat session initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documentId:
 *                   type: string
 *                   description: ID of the document
 *                   example: "123"
 *                 content:
 *                   type: string
 *                   description: Content of the document
 *                   example: "This is the document content"
 *                 title:
 *                   type: string
 *                   description: Title of the document
 *                   example: "Invoice #12345"
 *                 history:
 *                   type: array
 *                   description: Previous chat messages if any
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         example: "user"
 *                       content:
 *                         type: string
 *                         example: "What is this document about?"
 *       400:
 *         description: Missing document ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/chat/init', authenticateAPI, async (req, res) => {
  const documentId = req.query.documentId;
  const result = await ChatService.initializeChat(documentId);
  res.json(result);
});

// Nachricht senden
/**
 * @swagger
 * /chat/message:
 *   post:
 *     summary: Send message to document chat
 *     description: |
 *       Sends a user message to the document-specific chat AI assistant.
 *       The message is processed in the context of the specified document.
 *       Returns a streaming response with the AI's reply chunks.
 *     tags:
 *       - API
 *       - Chat
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *               - message
 *             properties:
 *               documentId:
 *                 type: string
 *                 description: ID of the document to chat with
 *                 example: "123"
 *               message:
 *                 type: string
 *                 description: User message to send to the chat
 *                 example: "What is this document about?"
 *     responses:
 *       200:
 *         description: |
 *           Response streaming started. Each event contains a message chunk.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 data: {"chunk":"This document appears to be"}
 *
 *                 data: {"chunk":" an invoice from"}
 *
 *                 data: {"done":true}
 *       400:
 *         description: Missing document ID or message
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/chat/message', authenticateAPI, async (req, res) => {
  try {
    const { documentId, message } = req.body;
    if (!documentId || !message) {
      return res.status(400).json({ error: 'Document ID and message are required' });
    }

    // Use the new streaming method
    await ChatService.sendMessageStream(documentId, message, res);
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /chat/init/{documentId}:
 *   get:
 *     summary: Initialize chat for a document via path parameter
 *     description: |
 *       Initializes a chat session for a specific document identified by the path parameter.
 *       Loads document content and prepares it for the chat interface.
 *       This endpoint returns the document content, chat history if available, and initial context.
 *     tags:
 *       - API
 *       - Chat
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the document to initialize chat for
 *         example: "123"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Chat session initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documentId:
 *                   type: string
 *                   description: ID of the document
 *                   example: "123"
 *                 content:
 *                   type: string
 *                   description: Content of the document
 *                   example: "This is the document content"
 *                 title:
 *                   type: string
 *                   description: Title of the document
 *                   example: "Invoice #12345"
 *                 history:
 *                   type: array
 *                   description: Previous chat messages if any
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         example: "user"
 *                       content:
 *                         type: string
 *                         example: "What is this document about?"
 *       400:
 *         description: Missing document ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/chat/init/:documentId', authenticateAPI, async (req, res) => {
  try {
      const { documentId } = req.params;
      if (!documentId) {
          return res.status(400).json({ error: 'Document ID is required' });
      }
      const result = await ChatService.initializeChat(documentId);
      res.json(result);
  } catch (error) {
      console.error('initializing chat:', error);
      res.status(500).json({ error: 'Failed to initialize chat' });
  }
});

/**
 * @swagger
 * /history:
 *   get:
 *     summary: Document history page
 *     description: |
 *       Renders the document history page with filtering options.
 *       This page displays a list of all documents that have been processed by Paperless-AI,
 *       showing the changes made to the documents through AI processing.
 *
 *       The page includes filtering capabilities by correspondent, tag, and free text search,
 *       allowing users to easily find specific documents or categories of processed documents.
 *       Each entry includes links to the original document in Paperless-ngx.
 *     tags:
 *       - History
 *       - Navigation
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: History page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the history page with filtering controls and document list
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/history', authenticateUI, async (req, res) => {
  try {
    const allTags = await paperlessService.getTags();
    const tagMap = new Map(allTags.map(tag => [tag.id, tag]));

    // Get all correspondents for filter dropdown
    const historyDocuments = await documentModel.getAllHistory();
    const allCorrespondents = [...new Set(historyDocuments.map(doc => doc.correspondent))]
      .filter(Boolean).sort();

    res.render('history', {
      version: getRuntimeConfig().version,
      filters: {
        allTags: allTags,
        allCorrespondents: allCorrespondents
      },
      active: 'history',
      title: 'Modified Documents - Paperless-AI'
    });
  } catch (error) {
    console.error('loading history page:', error);
    res.status(500).send('Error loading history page');
  }
});

/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: Get processed document history
 *     description: |
 *       Returns a paginated list of documents that have been processed by Paperless-AI.
 *       Supports filtering by tag, correspondent, and search term.
 *       Designed for integration with DataTables jQuery plugin.
 *
 *       This endpoint provides comprehensive information about each processed document,
 *       including its metadata before and after AI processing, allowing users to track
 *       changes made by the system.
 *     tags:
 *       - History
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: draw
 *         schema:
 *           type: integer
 *         description: Draw counter for DataTables (prevents XSS)
 *         example: 1
 *       - in: query
 *         name: start
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Starting record index for pagination
 *         example: 0
 *       - in: query
 *         name: length
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records to return per page
 *         example: 10
 *       - in: query
 *         name: search[value]
 *         schema:
 *           type: string
 *         description: Global search term (searches title, correspondent and tags)
 *         example: "invoice"
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter by tag ID
 *         example: "5"
 *       - in: query
 *         name: correspondent
 *         schema:
 *           type: string
 *         description: Filter by correspondent name
 *         example: "Acme Corp"
 *       - in: query
 *         name: order[0][column]
 *         schema:
 *           type: integer
 *         description: Index of column to sort by (0=document_id, 1=title, etc.)
 *         example: 1
 *       - in: query
 *         name: order[0][dir]
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort direction (ascending or descending)
 *         example: "desc"
 *     responses:
 *       200:
 *         description: Document history returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 draw:
 *                   type: integer
 *                   description: Echo of the draw parameter
 *                   example: 1
 *                 recordsTotal:
 *                   type: integer
 *                   description: Total number of records in the database
 *                   example: 100
 *                 recordsFiltered:
 *                   type: integer
 *                   description: Number of records after filtering
 *                   example: 20
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       document_id:
 *                         type: integer
 *                         description: Document ID
 *                         example: 123
 *                       title:
 *                         type: string
 *                         description: Document title
 *                         example: "Invoice #12345"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         description: Date and time when the processing occurred
 *                         example: "2023-07-15T14:30:45Z"
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 5
 *                             name:
 *                               type: string
 *                               example: "Invoice"
 *                             color:
 *                               type: string
 *                               example: "#FF5733"
 *                       correspondent:
 *                         type: string
 *                         description: Document correspondent name
 *                         example: "Acme Corp"
 *                       link:
 *                         type: string
 *                         description: Link to the document in Paperless-ngx
 *                         example: "http://paperless.example.com/documents/123/"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error loading history data"
 */
router.get('/api/history', authenticateAPI, async (req, res) => {
  try {
    const draw = parseInt(req.query.draw);
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const search = req.query.search?.value || '';
    const tagFilter = req.query.tag || '';
    const correspondentFilter = req.query.correspondent || '';

    // Get all documents
    const allDocs = await documentModel.getAllHistory();
    const allTags = await paperlessService.getTags();
    const tagMap = new Map(allTags.map(tag => [tag.id, tag]));

    // Format and filter documents
    let filteredDocs = allDocs.map(doc => {
      const tagIds = doc.tags === '[]' ? [] : JSON.parse(doc.tags || '[]');
      const resolvedTags = tagIds.map(id => tagMap.get(parseInt(id))).filter(Boolean);
      const baseURL = process.env.PAPERLESS_API_URL.replace(/\/api$/, '');

      resolvedTags.sort((a, b) => a.name.localeCompare(b.name));

      return {
        document_id: doc.document_id,
        title: doc.title || 'Modified: Invalid Date',
        created_at: doc.created_at,
        tags: resolvedTags,
        correspondent: doc.correspondent || 'Not assigned',
        link: `${baseURL}/documents/${doc.document_id}/`
      };
    }).filter(doc => {
      const matchesSearch = !search ||
        doc.title.toLowerCase().includes(search.toLowerCase()) ||
        doc.correspondent.toLowerCase().includes(search.toLowerCase()) ||
        doc.tags.some(tag => tag.name.toLowerCase().includes(search.toLowerCase()));

      const matchesTag = !tagFilter || doc.tags.some(tag => tag.id === parseInt(tagFilter));
      const matchesCorrespondent = !correspondentFilter || doc.correspondent === correspondentFilter;

      return matchesSearch && matchesTag && matchesCorrespondent;
    });

    // Sort documents if requested
    if (req.query.order) {
      const order = req.query.order[0];
      const column = req.query.columns[order.column].data;
      const dir = order.dir === 'asc' ? 1 : -1;

      filteredDocs.sort((a, b) => {
        if (a[column] == null) return 1;
        if (b[column] == null) return -1;
        if (column === 'created_at') {
          return dir * (new Date(a[column]) - new Date(b[column]));
        }
        if (column === 'document_id') {
          return dir * (a[column] - b[column]);
        }
        if (column === 'tags') {
          let min_len = (a[column].length < b[column].length)? a[column].length : b[column].length;
          for(let i=0; i < min_len; i+=1) {
            let cmp = a[column][i].name.localeCompare(b[column][i].name)
            if(cmp !== 0) return dir * cmp;
          }
          return dir * (a[column].length - b[column].length);
        }
        return dir * a[column].localeCompare(b[column]);
      });
    }

    res.json({
      draw: draw,
      recordsTotal: allDocs.length,
      recordsFiltered: filteredDocs.length,
      data: filteredDocs.slice(start, start + length)
    });
  } catch (error) {
    console.error('loading history data:', error);
    res.status(500).json({ error: 'Error loading history data' });
  }
});

/**
 * @swagger
 * /api/reset-all-documents:
 *   post:
 *     summary: Reset all processed documents
 *     description: |
 *       Deletes all processing records from the database, allowing documents to be processed again.
 *       This doesn't delete the actual documents from Paperless-ngx, only their processing status in Paperless-AI.
 *
 *       This operation can be useful when changing AI models or prompts, as it allows reprocessing
 *       all documents with the updated configuration.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: All documents successfully reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error resetting documents"
 */
router.post('/api/reset-all-documents', authenticateAPI, async (req, res) => {
  try {
    await documentModel.deleteAllDocuments();
    res.json({ success: true });
  }
  catch (error) {
    console.error('resetting documents:', error);
    res.status(500).json({ error: 'Error resetting documents' });
  }
});

/**
 * @swagger
 * /api/reset-documents:
 *   post:
 *     summary: Reset specific documents
 *     description: |
 *       Deletes processing records for specific documents, allowing them to be processed again.
 *       This doesn't delete the actual documents from Paperless-ngx, only their processing status in Paperless-AI.
 *
 *       This operation is useful when you want to reprocess only selected documents after changes to
 *       the AI model, prompt, or document metadata configuration.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of document IDs to reset
 *                 example: [123, 456, 789]
 *     responses:
 *       200:
 *         description: Documents successfully reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid document IDs"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error resetting documents"
 */
router.post('/api/reset-documents', authenticateAPI, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Invalid document IDs' });
    }

    await documentModel.deleteDocumentsIdList(ids);
    res.json({ success: true });
  }
  catch (error) {
    console.error('resetting documents:', error);
    res.status(500).json({ error: 'Error resetting documents' });
  }
});

/**
 * @swagger
 * /api/scan/now:
 *   post:
 *     summary: Trigger immediate document scan
 *     description: |
 *       Initiates an immediate scan of documents in Paperless-ngx that haven't been processed yet.
 *       This endpoint can be used to manually trigger processing without waiting for the scheduled interval.
 *
 *       The scan will:
 *       - Connect to Paperless-ngx API
 *       - Fetch all unprocessed documents
 *       - Process each document with the configured AI service
 *       - Update documents in Paperless-ngx with generated metadata
 *
 *       The process respects the function limitations set in the configuration.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Scan initiated successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Task completed"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error during document scan"
 */
router.post('/api/scan/now', authenticateAPI, async (req, res) => {
  try {
    const isConfigured = await configService.isConfigured();
    if (!isConfigured) {
      console.log(`Setup not completed. Visit http://your-machine-ip:${process.env.PAPERLESS_AI_PORT || 3000}/setup to complete setup.`);
      return;
    }

    const userId = await paperlessService.getOwnUserID();
    if (!userId) {
      console.error('Failed to get own user ID. Abort scanning.');
      return;
    }

      try {
        let [existingTags, documents, ownUserId, existingCorrespondentList, existingDocumentTypes] = await Promise.all([
          paperlessService.getTags(),
          paperlessService.getAllDocuments(),
          paperlessService.getOwnUserID(),
          paperlessService.listCorrespondentsNames(),
          paperlessService.listDocumentTypesNames()
        ]);

        //get existing correspondent list
        existingCorrespondentList = existingCorrespondentList.map(correspondent => correspondent.name);

        //get existing document types list
        let existingDocumentTypesList = existingDocumentTypes.map(docType => docType.name);

        // Extract tag names from tag objects
        const existingTagNames = existingTags.map(tag => tag.name);

        for (const doc of documents) {
          try {
            const result = await processDocument(doc, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId);
            if (!result) continue;

            const { analysis, originalData } = result;
            const updateData = await buildUpdateData(analysis, doc);
            await saveDocumentChanges(doc.id, updateData, analysis, originalData);
          } catch (error) {
            console.error(`processing document ${doc.id}:`, error);
          }
        }
      } catch (error) {
        console.error(' during document scan:', error);
      } finally {
        runningTask = false;
        console.info('Task completed');
        res.send('Task completed');
      }
  } catch (error) {
    console.error('in startScanning:', error);
  }
});

async function processDocument(doc, existingTags, existingCorrespondentList, existingDocumentTypesList, ownUserId, customPrompt = null) {
  const config = getRuntimeConfig();
  const isProcessed = await documentModel.isDocumentProcessed(doc.id);
  if (isProcessed) return null;
  await documentModel.setProcessingStatus(doc.id, doc.title, 'processing');

  const documentEditable = await paperlessService.getPermissionOfDocument(doc.id);
  if (!documentEditable) {
    console.debug(`Document belongs to: ${documentEditable}, skipping analysis`);
    console.debug(`Document ${doc.id} Not Editable by Paper-Ai User, skipping analysis`);
    return null;
  }else {
    console.debug(`Document ${doc.id} rights for AI User - processed`);
  }

  let [content, originalData] = await Promise.all([
    paperlessService.getDocumentContent(doc.id),
    paperlessService.getDocument(doc.id)
  ]);

  if ((config.ai?.contentSourceMode || 'content') === 'content') {
    if (!content || content.length < 10) {
      console.debug(`Document ${doc.id} has no content, skipping analysis`);
      return null;
    }

    if (content.length > 50000) {
      content = content.substring(0, 50000);
    }
  }

  let externalApiData = null;

  // Get external API data if enabled
  if (config.externalApi.enabled === true) {
    try {
      const externalApiService = container.getExternalApiService();
      const externalData = await externalApiService.fetchData();
      if (externalData) {
        externalApiData = externalData;
        console.debug('Retrieved external API data for prompt enrichment');
      }
    } catch (error) {
      console.error('Failed to fetch external API data:', error.message);
    }
  }

  const aiService = container.getAIService();
  let analysis;
  if(customPrompt) {
    console.debug('Starting document analysis with custom prompt');
    analysis = await aiService.analyzeDocument(content, existingTags, existingCorrespondentList, existingDocumentTypesList, doc.id, customPrompt, externalApiData);
  }else{
    analysis = await aiService.analyzeDocument(content, existingTags, existingCorrespondentList, existingDocumentTypesList, doc.id, null, externalApiData);
  }
  console.log('Response from AI service:', analysis);
  if (analysis.error) {
    throw new Error(`Document analysis failed: ${analysis.error}`);
  }
  await documentModel.setProcessingStatus(doc.id, doc.title, 'complete');
  return { analysis, originalData };
}

async function buildUpdateData(analysis, doc) {
  const config = getRuntimeConfig();
  const updateData = {};

  // Create options object with restriction settings
  const options = {
    restrictToExistingTags: config.restrictToExisting.tags === true,
    restrictToExistingCorrespondents: config.restrictToExisting.correspondents === true
  };

  console.debug(`Building update data with restrictions: tags=${options.restrictToExistingTags}, correspondent=${options.restrictToExistingCorrespondents}`);

  // Only process tags if tagging is enabled
  if (config.enableUpdates?.tags !== false) {
    const { tagIds, errors } = await paperlessService.processTags(analysis.document.tags, options);
    if (errors.length > 0) {
      console.error('Some tags could not be processed:', errors);
    }
    updateData.tags = tagIds;
  } else if (config.enableUpdates?.tags === false && config.postProcessing.addTags === true) {
    // Add AI processed tags to the document (processTags function awaits a tags array)
    console.debug('Tagging is disabled but AI processed tag will be added');
    const processedTags = Array.isArray(config.postProcessing.tagsToAdd) ? config.postProcessing.tagsToAdd : [];
    const { tagIds, errors } = await paperlessService.processTags(processedTags, options);
    if (errors.length > 0) {
      console.error('Some tags could not be processed:', errors);
    }
    updateData.tags = tagIds;
    console.debug('Tagging is disabled');
  }

  // Only process title if title generation is enabled
  if (config.enableUpdates?.title !== false) {
    updateData.title = analysis.document.title || doc.title;
  }

  // Only update content if content update is enabled and AI provided content
  if (config.enableUpdates?.content !== false && typeof analysis.document.content === 'string') {
    const trimmedContent = analysis.document.content.trim();
    if (trimmedContent.length > 0) {
      updateData.content = trimmedContent;
    }
  }

  // Add created date regardless of settings as it's a core field
  if (config.enableUpdates?.documentDate !== false && analysis.document.document_date) {
    updateData.created = analysis.document.document_date;
  } else {
    updateData.created = doc.created;
  }

  // Only process document type if document type classification is enabled
  if (config.enableUpdates?.documentType !== false && analysis.document.document_type) {
    try {
      let documentType;

      // If restricting to existing document types, search for exact match only
      if (config.restrictToExisting.documentTypes === true) {
        documentType = await paperlessService.searchForExistingDocumentType(analysis.document.document_type);
        if (documentType) {
          console.debug(`Found existing document type "${analysis.document.document_type}" with ID ${documentType.id}`);
          updateData.document_type = documentType.id;
        } else {
          console.debug(`Document type "${analysis.document.document_type}" does not exist in Paperless and restrict mode is enabled - skipping`);
        }
      } else {
        // Original behavior: get or create document type
        documentType = await paperlessService.getOrCreateDocumentType(analysis.document.document_type);
        if (documentType) {
          updateData.document_type = documentType.id;
        }
      }
    } catch (error) {
      console.error(`Error processing document type:`, error);
    }
  }

  // Only process custom fields if custom fields detection is enabled
  if (config.enableUpdates?.customFields !== false && analysis.document.custom_fields) {
    const customFields = analysis.document.custom_fields;
    const processedFields = [];

    // Get existing custom fields
    const existingFields = await paperlessService.getExistingCustomFields(doc.id);
    console.debug(`Found existing fields:`, existingFields);

    // Keep track of which fields we've processed to avoid duplicates
    const processedFieldIds = new Set();

    // First, add any new/updated fields
    /*
    for (const key in customFields) {
      const customField = customFields[key];

      if (!customField.field_name || !customField.value?.trim()) {
        console.debug(`Skipping empty/invalid custom field`);
        continue;
      }

      const fieldDetails = await paperlessService.findExistingCustomField(customField.field_name);
      if (fieldDetails?.id) {
        processedFields.push({
          field: fieldDetails.id,
          value: customField.value.trim()
        });
        processedFieldIds.add(fieldDetails.id);
      }
    }
    */
    for (const key in customFields) {
      console.debug(`Processing AI-provided custom field "${key}"`);
      if (customFields[key] === null) {
        console.debug(`Skipping AI-provided custom field "${key}" because of null value`);
        continue;
      }
      const fieldDetails = await paperlessService.findExistingCustomField(key);
      if (fieldDetails?.id) {
        console.debug(`Found custom field "${fieldDetails.name}" with id "${fieldDetails.id}" and type "${fieldDetails.data_type}"`);
        processedFields.push({
          field: fieldDetails.id,
          value: customFields[key]
        });
        processedFieldIds.add(fieldDetails.id);
      } else {
        console.debug(`No matching custom field found for "${key}"`);
      }
    }

    // Then add any existing fields that weren't updated
    for (const existingField of existingFields) {
      if (!processedFieldIds.has(existingField.field)) {
        processedFields.push(existingField);
      }
    }

    if (processedFields.length > 0) {
      updateData.custom_fields = processedFields;
    }
  }

  // Only process correspondent if correspondent detection is enabled
  if (config.enableUpdates?.correspondent !== false && analysis.document.correspondent) {
    try {
      const correspondent = await paperlessService.getOrCreateCorrespondent(analysis.document.correspondent, options);
      if (correspondent) {
        updateData.correspondent = correspondent.id;
      }
    } catch (error) {
      console.error(`Error processing correspondent:`, error);
    }
  }

  if (config.enableUpdates?.language !== false && analysis.document.language) {
    updateData.language = analysis.document.language;
  }

  return updateData;
}

async function saveDocumentChanges(docId, updateData, analysis, originalData) {
  const config = getRuntimeConfig();
  const { tags: originalTags, correspondent: originalCorrespondent, title: originalTitle } = originalData;

  await documentModel.saveOriginalData(docId, originalTags, originalCorrespondent, originalTitle);
  await paperlessService.updateDocument(docId, updateData);

  if (config.postProcessing.removeTags === true &&
      config.postProcessing.tagsToRemove &&
      (Array.isArray(config.postProcessing.tagsToRemove) ? config.postProcessing.tagsToRemove.length > 0 : String(config.postProcessing.tagsToRemove).trim() !== '')) {
    await paperlessService.removeTagsFromDocument(docId, config.postProcessing.tagsToRemove);
  }

  await Promise.all([
    documentModel.addProcessedDocument(docId, updateData.title),
    documentModel.addOpenAIMetrics(
      docId,
      analysis.metrics.promptTokens,
      analysis.metrics.completionTokens,
      analysis.metrics.totalTokens
    ),
    documentModel.addToHistory(docId, updateData.tags, updateData.title, analysis.document.correspondent)
  ]);
}

/**
 * @swagger
 * /api/key-regenerate:
 *   post:
 *     summary: Regenerate API key
 *     description: |
 *       Generates a new random API key for the application and updates the .env file.
 *       The previous API key will be invalidated immediately after generation.
 *
 *       This API key can be used for programmatic access to the API endpoints
 *       by sending it in the `x-api-key` header of subsequent requests.
 *
 *       **Security Notice**: This operation invalidates any existing API key.
 *       All systems using the previous key will need to be updated.
 *     tags:
 *       - System
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: API key regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: string
 *                   description: The newly generated API key
 *                   example: "3f7a8d6e2c1b5a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5"
 *       401:
 *         description: Unauthorized - JWT authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error regenerating API key"
 */
router.post('/api/key-regenerate', authenticateAPI, async (req, res) => {
  try {
    const crypto = require('crypto');
    // Generiere ein neues API-Token
    const apiKey = crypto.randomBytes(32).toString('hex');
    const currentConfig = configService.getMergedConfigSync();
    currentConfig.API_KEY = apiKey;
    await configService.saveConfig(currentConfig);
    container.refreshConfig(configService.getRuntimeConfig({ refresh: true }));

    // Sende die Antwort zurück
    res.json({ success: apiKey });
    console.log('API key regenerated:', apiKey);
  } catch (error) {
    console.error('API key regeneration error:', error);
    res.status(500).json({ error: 'Error regenerating API key' });
  }
});


/**
 * @swagger
 * /setup:
 *   get:
 *     summary: Application setup page
 *     description: |
 *       Renders the application setup page for initial configuration.
 *
 *       This page allows configuring the connection to Paperless-ngx, AI services,
 *       and other application settings. It loads existing configuration if available
 *       and redirects to dashboard if setup is already complete.
 *
 *       The setup page is the entry point for new installations and guides users through
 *       the process of connecting to Paperless-ngx, configuring AI providers, and setting up
 *       admin credentials.
 *     tags:
 *       - Navigation
 *       - Setup
 *       - System
 *     responses:
 *       200:
 *         description: Setup page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the application setup page
 *       302:
 *         description: Redirects to dashboard if setup is already complete
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/dashboard"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/setup', async (req, res) => {
  try {
    let config = configService.buildBaseConfig();
    const runtimeConfig = getRuntimeConfig();

    // Check both configuration and users
    const [isEnvConfigured, users] = await Promise.all([
      configService.isConfigured(),
      documentModel.getUsers()
    ]);

    // Load saved config if it exists
    if (isEnvConfigured) {
      const savedConfig = await configService.loadConfig();
      config = configService.mergeSavedConfig(config, savedConfig);
    }

    // Debug output
    console.log('Current config FILTER_INCLUDE_TAGS:', config.FILTER_INCLUDE_TAGS);
    console.log('Current config FILTER_EXCLUDE_TAGS:', config.FILTER_EXCLUDE_TAGS);
    console.log('Current config AI_PROMPT_TAGS:', config.AI_PROMPT_TAGS);

    // Check if system is fully configured
    const hasUsers = Array.isArray(users) && users.length > 0;
    const isFullyConfigured = isEnvConfigured && hasUsers;

    // Generate appropriate success message
    let successMessage;
    if (isEnvConfigured && !hasUsers) {
      successMessage = 'Environment is configured, but no users exist. Please create at least one user.';
    } else if (isEnvConfigured) {
      successMessage = 'The application is already configured. You can update the configuration below.';
    }

    // If everything is configured and we have users, redirect to dashboard
    // BUT only after we've loaded all the config
    if (isFullyConfigured) {
      return res.redirect('/dashboard');
    }

    // Render setup page with config and appropriate message
    config.ai = runtimeConfig.ai;
    res.render('setup', {
      config,
      success: successMessage,
      layout: false
    });
  } catch (error) {
    console.error('Setup route error:', error);
    res.status(500).render('setup', {
      config: {},
      error: 'An error occurred while loading the setup page.',
      layout: false
    });
  }
});

/**
 * @swagger
 * /manual/preview/{id}:
 *   get:
 *     summary: Document preview
 *     description: |
 *       Fetches and returns the content of a specific document from Paperless-ngx
 *       for preview in the manual document review interface.
 *
 *       This endpoint retrieves document details including content, title, ID, and tags,
 *       allowing users to view the document text before applying changes or processing
 *       it with AI tools. The document content is retrieved directly from Paperless-ngx
 *       using the system's configured API credentials.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The document ID from Paperless-ngx
 *         example: 123
 *     responses:
 *       200:
 *         description: Document content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   description: The document content
 *                   example: "Invoice from ACME Corp. Amount: $1,234.56"
 *                 title:
 *                   type: string
 *                   description: The document title
 *                   example: "ACME Corp Invoice #12345"
 *                 id:
 *                   type: integer
 *                   description: The document ID
 *                   example: 123
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Array of tag names assigned to the document
 *                   example: ["Invoice", "ACME Corp", "2023"]
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual/preview/:id', authenticateAPI, async (req, res) => {
  try {
    const documentId = req.params.id;
    console.log('Fetching content for document:', documentId);

    const response = await fetch(
      `${process.env.PAPERLESS_API_URL}/documents/${documentId}/`,
      {
        headers: {
          'Authorization': `Token ${process.env.PAPERLESS_API_TOKEN}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch document content: ${response.status} ${response.statusText}`);
    }

    const document = await response.json();
    //map the tags to their names
    document.tags = await Promise.all(document.tags.map(async tag => {
      const tagName = await paperlessService.getTagTextFromId(tag);
      return tagName;
    }
    ));
    console.log('Document Data:', document);
    res.json({ content: document.content, title: document.title, id: document.id, tags: document.tags });
  } catch (error) {
    console.error('Content fetch error:', error);
    res.status(500).json({ error: `Error fetching document content: ${error.message}` });
  }
});

/**
 * @swagger
 * /manual:
 *   get:
 *     summary: Document review page
 *     description: |
 *       Renders the manual document review page that allows users to browse,
 *       view and manually process documents from Paperless-ngx.
 *
 *       This interface enables users to review documents, view their content, and
 *       manage tags, correspondents, and document metadata without AI assistance.
 *       Users can apply manual changes to documents based on their own judgment,
 *       which is particularly useful for correction or verification of AI-processed documents.
 *     tags:
 *       - Navigation
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Manual document review page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the manual document review interface
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual', authenticateUI, async (req, res) => {
  const version = getRuntimeConfig().version || ' ';
  res.render('manual', {
    title: 'Paperless-AI Manual',
    error: null,
    success: null,
    version,
    paperlessApiUrl: process.env.PAPERLESS_API_URL,
    paperlessApiToken: process.env.PAPERLESS_API_TOKEN,
    config: {},
    active: 'manual'
  });
});

/**
 * @swagger
 * /manual/tags:
 *   get:
 *     summary: Get all tags
 *     description: |
 *       Retrieves all tags from Paperless-ngx for use in the manual document review interface.
 *
 *       This endpoint returns a complete list of all available tags that can be applied to documents,
 *       including their IDs, names, and colors. The tags are retrieved directly from Paperless-ngx
 *       and used for tag selection in the UI when manually updating document metadata.
 *     tags:
 *       - Documents
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Tags retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tag'
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual/tags', authenticateAPI, async (req, res) => {
  const getTags = await paperlessService.getTags();
  res.json(getTags);
});

/**
 * @swagger
 * /manual/documents:
 *   get:
 *     summary: Get all documents
 *     description: |
 *       Retrieves all documents from Paperless-ngx for display in the manual document review interface.
 *
 *       This endpoint returns a list of all available documents that can be manually reviewed,
 *       including their basic metadata such as ID, title, and creation date. The documents are
 *       retrieved directly from Paperless-ngx and presented in the UI for selection and processing.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual/documents', authenticateAPI, async (req, res) => {
  const getDocuments = await paperlessService.getDocuments();
  res.json(getDocuments);
});

/**
 * @swagger
 * /api/correspondentsCount:
 *   get:
 *     summary: Get count of correspondents
 *     description: |
 *       Retrieves the list of correspondents with their document counts.
 *       This endpoint returns all correspondents in the system along with
 *       the number of documents associated with each correspondent.
 *     tags:
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of correspondents with document counts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID of the correspondent
 *                     example: 1
 *                   name:
 *                     type: string
 *                     description: Name of the correspondent
 *                     example: "ACME Corp"
 *                   count:
 *                     type: integer
 *                     description: Number of documents associated with this correspondent
 *                     example: 5
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/correspondentsCount', authenticateAPI, async (req, res) => {
  const correspondents = await paperlessService.listCorrespondentsNames();
  res.json(correspondents);
});

/**
 * @swagger
 * /api/tagsCount:
 *   get:
 *     summary: Get count of tags
 *     description: |
 *       Retrieves the list of tags with their document counts.
 *       This endpoint returns all tags in the system along with
 *       the number of documents associated with each tag.
 *     tags:
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of tags with document counts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID of the tag
 *                     example: 1
 *                   name:
 *                     type: string
 *                     description: Name of the tag
 *                     example: "Invoice"
 *                   count:
 *                     type: integer
 *                     description: Number of documents associated with this tag
 *                     example: 12
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/tagsCount', authenticateAPI, async (req, res) => {
  const tags = await paperlessService.listTagNames();
  res.json(tags);
});

const documentQueue = [];
let isProcessing = false;

function extractDocumentId(url) {
  const match = url.match(/\/documents\/(\d+)\//);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  throw new Error('Could not extract document ID from URL');
}

async function processQueue(customPrompt) {
  if (customPrompt) {
    console.log('Using custom prompt:', customPrompt);
  }

  if (isProcessing || documentQueue.length === 0) return;

  isProcessing = true;

  try {
    const isConfigured = await configService.isConfigured();
    if (!isConfigured) {
      console.log(`Setup not completed. Visit http://your-machine-ip:${process.env.PAPERLESS_AI_PORT || 3000}/setup to complete setup.`);
      return;
    }

    const userId = await paperlessService.getOwnUserID();
    if (!userId) {
      console.error('Failed to get own user ID. Abort scanning.');
      return;
    }

    const [existingTags, existingCorrespondentList, existingDocumentTypes, ownUserId] = await Promise.all([
      paperlessService.getTags(),
      paperlessService.listCorrespondentsNames(),
      paperlessService.listDocumentTypesNames(),
      paperlessService.getOwnUserID()
    ]);

    const existingDocumentTypesList = existingDocumentTypes.map(docType => docType.name);

    while (documentQueue.length > 0) {
      const doc = documentQueue.shift();

      try {
        const result = await processDocument(doc, existingTags, existingCorrespondentList, existingDocumentTypesList, ownUserId, customPrompt);
        if (!result) continue;

        const { analysis, originalData } = result;
        const updateData = await buildUpdateData(analysis, doc);
        await saveDocumentChanges(doc.id, updateData, analysis, originalData);
      } catch (error) {
        console.error(`Failed to process document ${doc.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error during queue processing:', error);
  } finally {
    isProcessing = false;

    if (documentQueue.length > 0) {
      processQueue();
    }
  }
}

/**
 * @swagger
 * /api/webhook/document:
 *   post:
 *     summary: Webhook for document updates
 *     description: |
 *       Processes incoming webhook notifications from Paperless-ngx about document
 *       changes, additions, or deletions. The webhook allows Paperless-AI to respond
 *       to document changes in real-time.
 *
 *       When a new document is added or updated in Paperless-ngx, this endpoint can
 *       trigger automatic AI processing for metadata extraction.
 *     tags:
 *       - Documents
 *       - API
 *       - System
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_type
 *               - document_id
 *             properties:
 *               event_type:
 *                 type: string
 *                 description: Type of event that occurred
 *                 enum: ["added", "updated", "deleted"]
 *                 example: "added"
 *               document_id:
 *                 type: integer
 *                 description: ID of the affected document
 *                 example: 123
 *               document_info:
 *                 type: object
 *                 description: Additional information about the document (optional)
 *                 properties:
 *                   title:
 *                     type: string
 *                     example: "Invoice"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document event processed"
 *                 processing_queued:
 *                   type: boolean
 *                   description: Whether AI processing was queued for this document
 *                   example: true
 *       400:
 *         description: Invalid webhook payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Missing required fields: event_type, document_id"
 *       401:
 *         description: Unauthorized - invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized: Invalid API key"
 *       500:
 *         description: Server error processing webhook
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/api/webhook/document', [express.json(), authenticateAPI], async (req, res) => {
  try {
    const config = getRuntimeConfig();
    if (config.processing.enableWebhook !== true) {
      return res.status(403).json({ error: 'Webhook processing is disabled' });
    }
    console.log(req);
    console.log(req.body);
    const { url, prompt } = req.body;
    let usePrompt = false;
    if (!url) {
      return res.status(400).send('Missing document URL');
    }

    try {
      const documentId = extractDocumentId(url);
      const document = await paperlessService.getDocument(documentId);

      if (!document) {
        return res.status(404).send(`Document with ID ${documentId} not found`);
      }

      documentQueue.push(document);
      if (prompt) {
        usePrompt = true;
        console.debug('Using custom prompt:', prompt);
        await processQueue(prompt);
      } else {
        await processQueue();
      }


      res.status(202).send({
        message: 'Document accepted for processing',
        documentId: documentId,
        queuePosition: documentQueue.length
      });

    } catch (error) {
      console.error('Failed to extract document ID or fetch document:', error);
      return res.status(200).send('Invalid document URL format');
    }

  } catch (error) {
    console.error('Error in webhook endpoint:', error);
    res.status(200).send('Internal server error');
  }
});

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Main dashboard page
 *     description: |
 *       Renders the main dashboard page of the application with summary statistics and visualizations.
 *       The dashboard provides an overview of processed documents, system metrics, and important statistics
 *       about document processing including tag counts, correspondent counts, and token usage.
 *
 *       The page displays visualizations for document processing status, token distribution,
 *       processing time statistics, and document type categorization to help administrators
 *       understand system performance and document processing patterns.
 *     tags:
 *       - Navigation
 *       - System
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the dashboard page
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/dashboard', authenticateUI, async (req, res) => {
  const tagCount = await paperlessService.getTagCount();
  const correspondentCount = await paperlessService.getCorrespondentCount();
  const documentCount = await paperlessService.getDocumentCount();
  const processedDocumentCount = await documentModel.getProcessedDocumentsCount();
  const processedDocumentIds = await documentModel.getProcessedDocumentIds();
  const processingBreakdown = await paperlessService.getDocumentProcessingBreakdown(processedDocumentIds);
  const metrics = await documentModel.getMetrics();
  const processingTimeStats = await documentModel.getProcessingTimeStats();
  const tokenDistribution = await documentModel.getTokenDistribution();
  const documentTypes = await documentModel.getDocumentTypeStats();

  const averagePromptTokens = metrics.length > 0 ? Math.round(metrics.reduce((acc, cur) => acc + cur.promptTokens, 0) / metrics.length) : 0;
  const averageCompletionTokens = metrics.length > 0 ? Math.round(metrics.reduce((acc, cur) => acc + cur.completionTokens, 0) / metrics.length) : 0;
  const averageTotalTokens = metrics.length > 0 ? Math.round(metrics.reduce((acc, cur) => acc + cur.totalTokens, 0) / metrics.length) : 0;
  const tokensOverall = metrics.length > 0 ? metrics.reduce((acc, cur) => acc + cur.totalTokens, 0) : 0;

  const version = getRuntimeConfig().version || ' ';

  res.render('dashboard', {
    paperless_data: {
      tagCount,
      correspondentCount,
      documentCount,
      processedDocumentCount,
      processingBreakdown,
      processingTimeStats,
      tokenDistribution,
      documentTypes
    },
    openai_data: {
      averagePromptTokens,
      averageCompletionTokens,
      averageTotalTokens,
      tokensOverall
    },
    version,
    active: 'dashboard',
    title: 'Paperless-AI Dashboard'
  });
});

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Application settings page
 *     description: |
 *       Renders the application settings page where users can modify configuration
 *       after initial setup.
 *
 *       This page allows administrators to update connections to Paperless-ngx,
 *       AI provider settings, processing parameters, feature toggles, and custom fields.
 *       The interface provides validation for connection settings and displays the current
 *       configuration values.
 *
 *       Changes made on this page require application restart to take full effect.
 *     tags:
 *       - Navigation
 *       - Setup
 *       - System
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Settings page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the application settings page
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/settings', authenticateUI, async (req, res) => {
  let showErrorCheckSettings = false;
  const isConfigured = await configService.isConfigured();
  if (!isConfigured && parseBoolean(process.env.PAPERLESS_AI_INITIAL_SETUP, false)) {
    showErrorCheckSettings = true;
  }
  let config = configService.buildBaseConfig();

  if (isConfigured) {
    const savedConfig = await configService.loadConfig();
    config = configService.mergeSavedConfig(config, savedConfig);
  }

  // Debug-output
  console.log('Current config FILTER_INCLUDE_TAGS:', config.FILTER_INCLUDE_TAGS);
  console.log('Current config FILTER_EXCLUDE_TAGS:', config.FILTER_EXCLUDE_TAGS);
  console.log('Current config AI_PROMPT_TAGS:', config.AI_PROMPT_TAGS);
  const version = getRuntimeConfig().version || ' ';
  config.ai = getRuntimeConfig().ai;
  let paperlessCustomFields = [];
  try {
    paperlessCustomFields = await paperlessService.getCustomFieldsCached();
  } catch (error) {
    console.error('Failed to load custom fields from Paperless-ngx:', error.message);
  }
  res.render('settings', {
    version,
    config,
    paperlessCustomFields,
    success: isConfigured ? 'The application is already configured. You can update the configuration below.' : undefined,
    settingsError: showErrorCheckSettings ? 'Please check your settings. Something is not working correctly.' : undefined,
    active: 'settings',
    title: 'Paperless-AI Settings'
  });
});

/**
 * @swagger
 * /debug:
 *   get:
 *     summary: Debug interface
 *     description: |
 *       Renders a debug interface for testing and troubleshooting Paperless-ngx connections
 *       and API responses.
 *
 *       This page provides a simple UI for executing API calls to Paperless-ngx endpoints
 *       and viewing the raw responses. It's primarily used for diagnosing connection issues
 *       and understanding the structure of data returned by the Paperless-ngx API.
 *
 *       The debug interface should only be accessible to administrators and is not intended
 *       for regular use in production environments.
 *     tags:
 *       - Navigation
 *       - System
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Debug interface rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the debug interface
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug', authenticateUI, async (req, res) => {
  //const isConfigured = await setupService.isConfigured();
  //if (!isConfigured) {
  //   return res.status(503).json({
  //     status: 'not_configured',
  //     message: 'Application setup not completed'
  //   });
  // }
  res.render('debug', { layout: false });
});

// router.get('/test/:correspondent', async (req, res) => {
//   //create a const for the correspondent that is base64 encoded and decode it
//   const correspondentx = Buffer.from(req.params.correspondent, 'base64').toString('ascii');
//   const correspondent = await paperlessService.searchForExistingCorrespondent(correspondentx);
//   res.send(correspondent);
// });

/**
 * @swagger
 * /debug/tags:
 *   get:
 *     summary: Debug tags API
 *     description: |
 *       Returns the raw tags data from Paperless-ngx for debugging purposes.
 *
 *       This endpoint performs a direct API call to the Paperless-ngx tags endpoint
 *       and returns the unmodified response. It's used for diagnosing tag-related issues
 *       and verifying proper connection to Paperless-ngx.
 *     tags:
 *       - System
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tags data retrieved successfully from Paperless-ngx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Raw response from Paperless-ngx tags API
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug/tags', authenticateAPI, async (req, res) => {
  const tags = await paperlessService.getTags();
  res.json(tags);
});

/**
 * @swagger
 * /debug/documents:
 *   get:
 *     summary: Debug documents API
 *     description: |
 *       Returns the raw documents data from Paperless-ngx for debugging purposes.
 *
 *       This endpoint performs a direct API call to the Paperless-ngx documents endpoint
 *       and returns the unmodified response. It's used for diagnosing document-related issues
 *       and verifying proper connection to Paperless-ngx.
 *     tags:
 *       - System
 *       - API
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Documents data retrieved successfully from Paperless-ngx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Raw response from Paperless-ngx documents API
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug/documents', authenticateAPI, async (req, res) => {
  const documents = await paperlessService.getDocuments();
  res.json(documents);
});

/**
 * @swagger
 * /debug/correspondents:
 *   get:
 *     summary: Debug correspondents API
 *     description: |
 *       Returns the raw correspondents data from Paperless-ngx for debugging purposes.
 *
 *       This endpoint performs a direct API call to the Paperless-ngx correspondents endpoint
 *       and returns the unmodified response. It's used for diagnosing correspondent-related issues
 *       and verifying proper connection to Paperless-ngx.
 *     tags:
 *       - System
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Correspondents data retrieved successfully from Paperless-ngx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Raw response from Paperless-ngx correspondents API
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug/correspondents', authenticateAPI, async (req, res) => {
  const correspondents = await paperlessService.getCorrespondents();
  res.json(correspondents);
});

/**
 * @swagger
 * /manual/analyze:
 *   post:
 *     summary: Analyze document content manually
 *     description: |
 *       Analyzes document content using the configured AI provider and returns structured metadata.
 *       This endpoint processes the document text to extract relevant information such as tags,
 *       correspondent, and document type based on content analysis.
 *
 *       The analysis is performed using the AI provider configured in the application settings.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The document text content to analyze
 *                 example: "Invoice from Acme Corp. Total amount: $125.00, Due date: 2023-08-15"
 *               existingTags:
 *                 type: array
 *                 description: List of existing tags in the system to help with tag matching
 *                 items:
 *                   type: string
 *                 example: ["Invoice", "Finance", "Acme Corp"]
 *               id:
 *                 type: string
 *                 description: Optional document ID for tracking metrics
 *                 example: "doc_123"
 *     responses:
 *       200:
 *         description: Document analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 correspondent:
 *                   type: string
 *                   description: Detected correspondent name
 *                   example: "Acme Corp"
 *                 title:
 *                   type: string
 *                   description: Suggested document title
 *                   example: "Acme Corp Invoice - August 2023"
 *                 tags:
 *                   type: array
 *                   description: Suggested tags for the document
 *                   items:
 *                     type: string
 *                   example: ["Invoice", "Finance"]
 *                 documentType:
 *                   type: string
 *                   description: Detected document type
 *                   example: "Invoice"
 *                 metrics:
 *                   type: object
 *                   description: Token usage metrics (when using OpenAI)
 *                   properties:
 *                     promptTokens:
 *                       type: number
 *                       example: 350
 *                     completionTokens:
 *                       type: number
 *                       example: 120
 *                     totalTokens:
 *                       type: number
 *                       example: 470
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error or AI provider not configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/manual/analyze', [express.json(), authenticateAPI], async (req, res) => {
  try {
    const { content, existingTags, id } = req.body;
    let existingCorrespondentList = await paperlessService.listCorrespondentsNames();
    existingCorrespondentList = existingCorrespondentList.map(correspondent => correspondent.name);
    let existingTagsList = await paperlessService.listTagNames();
    existingTagsList = existingTagsList.map(tags => tags.name);
    let existingDocumentTypes = await paperlessService.listDocumentTypesNames();
    let existingDocumentTypesList = existingDocumentTypes.map(docType => docType.name);

    if (!content || typeof content !== 'string') {
      console.log('Invalid content received:', content);
      return res.status(400).json({ error: 'Valid content string is required' });
    }

    if (process.env.AI_PROVIDER === 'openai') {
      const analyzeDocument = await container.getAIService().analyzeDocument(content, existingTagsList, existingCorrespondentList, existingDocumentTypesList, id || [], null, null);
      await documentModel.addOpenAIMetrics(
            id,
            analyzeDocument.metrics.promptTokens,
            analyzeDocument.metrics.completionTokens,
            analyzeDocument.metrics.totalTokens
          )
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'ollama') {
      const analyzeDocument = await container.getAIService().analyzeDocument(content, existingTagsList, existingCorrespondentList, existingDocumentTypesList, id || [], null, null);
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'custom') {
      const analyzeDocument = await container.getAIService().analyzeDocument(content, existingTagsList, existingCorrespondentList, existingDocumentTypesList, id || [], null, null);
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'azure') {
      const analyzeDocument = await container.getAIService().analyzeDocument(content, existingTagsList, existingCorrespondentList, existingDocumentTypesList, id || [], null, null);
      return res.json(analyzeDocument);
    } else {
      return res.status(500).json({ error: 'AI provider not configured' });
    }
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /manual/playground:
 *   post:
 *     summary: Process document using a custom prompt in playground mode
 *     description: |
 *       Analyzes document content using a custom user-provided prompt.
 *       This endpoint is primarily used for testing and experimenting with different prompts
 *       without affecting the actual document processing workflow.
 *
 *       The analysis is performed using the AI provider configured in the application settings,
 *       but with a custom prompt that overrides the default system prompt.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The document text content to analyze
 *                 example: "Invoice from Acme Corp. Total amount: $125.00, Due date: 2023-08-15"
 *               prompt:
 *                 type: string
 *                 description: Custom prompt to use for analysis
 *                 example: "Extract the company name, invoice amount, and due date from this document."
 *               documentId:
 *                 type: string
 *                 description: Optional document ID for tracking metrics
 *                 example: "doc_123"
 *     responses:
 *       200:
 *         description: Document analysis results using the custom prompt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: string
 *                   description: The raw AI response using the custom prompt
 *                   example: "Company: Acme Corp\nAmount: $125.00\nDue Date: 2023-08-15"
 *                 metrics:
 *                   type: object
 *                   description: Token usage metrics (when using OpenAI)
 *                   properties:
 *                     promptTokens:
 *                       type: number
 *                       example: 350
 *                     completionTokens:
 *                       type: number
 *                       example: 120
 *                     totalTokens:
 *                       type: number
 *                       example: 470
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error or AI provider not configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/manual/playground', [express.json(), authenticateAPI], async (req, res) => {
  try {
    const { content, existingTags, prompt, documentId } = req.body;

    if (!content || typeof content !== 'string') {
      console.log('Invalid content received:', content);
      return res.status(400).json({ error: 'Valid content string is required' });
    }

    if (process.env.AI_PROVIDER === 'openai') {
      const analyzeDocument = await container.getAIService().analyzePlayground(content, prompt);
      await documentModel.addOpenAIMetrics(
        documentId,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      )
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'ollama') {
      const analyzeDocument = await container.getAIService().analyzePlayground(content, prompt);
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'custom') {
      const analyzeDocument = await container.getAIService().analyzePlayground(content, prompt);
      await documentModel.addOpenAIMetrics(
        documentId,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      )
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'azure') {
      const analyzeDocument = await container.getAIService().analyzePlayground(content, prompt);
      await documentModel.addOpenAIMetrics(
        documentId,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      )
      return res.json(analyzeDocument);
    } else {
      return res.status(500).json({ error: 'AI provider not configured' });
    }
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /manual/updateDocument:
 *   post:
 *     summary: Update document metadata in Paperless-ngx
 *     description: |
 *       Updates document metadata such as tags, correspondent and title in the Paperless-ngx system.
 *       This endpoint handles the translation between tag names and IDs, and manages the creation of
 *       new tags or correspondents if they don't exist in the system.
 *
 *       The endpoint also removes any unused tags from the document to keep the metadata clean.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *             properties:
 *               documentId:
 *                 type: number
 *                 description: ID of the document to update in Paperless-ngx
 *                 example: 123
 *               filterIncludeTags:
 *                 type: array
 *                 description: List of tags to apply (can be tag IDs or names)
 *                 items:
 *                   oneOf:
 *                     - type: number
 *                     - type: string
 *                 example: ["Invoice", 42, "Finance"]
 *               correspondent:
 *                 type: string
 *                 description: Correspondent name to assign to the document
 *                 example: "Acme Corp"
 *               title:
 *                 type: string
 *                 description: New title for the document
 *                 example: "Acme Corp Invoice - August 2023"
 *     responses:
 *       200:
 *         description: Document successfully updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document updated successfully"
 *       400:
 *         description: Invalid request parameters or tag processing errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Failed to create tag: Invalid tag name"]
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/manual/updateDocument', [express.json(), authenticateAPI], async (req, res) => {
  try {
    var { documentId, tags, correspondent, title } = req.body;
    console.log("TITLE: ", title);
    // Convert all tags to names if they are IDs
    tags = await Promise.all(tags.map(async tag => {
      console.log('Processing tag:', tag);
      if (!isNaN(tag)) {
        const tagName = await paperlessService.getTagTextFromId(Number(tag));
        console.log('Converted tag ID:', tag, 'to name:', tagName);
        return tagName;
      }
      return tag;
    }));

    // Filter out any null or undefined tags
    tags = tags.filter(tag => tag != null);

    // Process new tags to get their IDs
    const { tagIds, errors } = await paperlessService.processTags(tags);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Process correspondent if provided
    const correspondentData = correspondent ? await paperlessService.getOrCreateCorrespondent(correspondent) : null;


    await paperlessService.removeUnusedTagsFromDocument(documentId, tagIds);

    // Then update with new tags (this will only add new ones since we already removed unused ones)
    const updateData = {
      tags: tagIds,
      correspondent: correspondentData ? correspondentData.id : null,
      title: title ? title : null
    };

    if(updateData.tags === null && updateData.correspondent === null && updateData.title === null) {
      return res.status(400).json({ error: 'No changes provided' });
    }
    const updateDocument = await paperlessService.updateDocument(documentId, updateData);

    // Mark document as processed
    await documentModel.addProcessedDocument(documentId, updateData.title);

    res.json(updateDocument);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: System health check endpoint
 *     description: |
 *       Provides information about the current system health status.
 *       This endpoint checks database connectivity and returns system operational status.
 *       Used for monitoring and automated health checks.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: System is healthy and operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Health status of the system
 *                   example: "healthy"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Status indicating an error
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   description: Error message details
 *                   example: "Internal server error"
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Status indicating database error
 *                   example: "database_error"
 *                 message:
 *                   type: string
 *                   description: Details about the service unavailability
 *                   example: "Database check failed"
 */
router.get('/health', async (req, res) => {
  try {
    // const isConfigured = await setupService.isConfigured();
    // if (!isConfigured) {
    //   return res.status(503).json({
    //     status: 'not_configured',
    //     message: 'Application setup not completed'
    //   });
    // }
    try {
      await documentModel.isDocumentProcessed(1);
    } catch (error) {
      return res.status(503).json({
        status: 'database_error',
        message: 'Database check failed'
      });
    }

    res.json({ status: 'healthy' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /setup:
 *   post:
 *     summary: Submit initial application setup configuration
 *     description: |
 *       Configures the initial setup of the Paperless-AI application, including connections
 *       to Paperless-ngx, AI provider settings, processing parameters, and user authentication.
 *
 *       This endpoint is primarily used during the first-time setup of the application and
 *       creates the necessary configuration files and database tables.
 *     tags:
 *       - System
 *       - Setup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paperlessApiUrl
 *               - paperlessApiToken
 *               - aiProvider
 *               - username
 *               - password
 *             properties:
 *               paperlessApiUrl:
 *                 type: string
 *                 description: URL of the Paperless-ngx instance
 *                 example: "https://paperless.example.com"
 *               paperlessApiToken:
 *                 type: string
 *                 description: API token for Paperless-ngx access
 *                 example: "abc123def456"
 *               aiProvider:
 *                 type: string
 *                 description: Selected AI provider for document analysis
 *                 enum: ["openai", "ollama", "custom", "azure"]
 *                 example: "openai"
 *               openaiApiKey:
 *                 type: string
 *                 description: API key for OpenAI (required when aiProvider is 'openai')
 *                 example: "sk-abc123def456"
 *               openaiModel:
 *                 type: string
 *                 description: OpenAI model to use for analysis
 *                 example: "gpt-4"
 *               openaiSystemPromptRole:
 *                 type: string
 *                 description: Role to use for the system prompt (OpenAI)
 *                 enum: ["system", "developer"]
 *                 example: "system"
 *               openaiGizmoId:
 *                 type: string
 *                 description: Gizmo ID for a custom GPT (optional)
 *                 example: "g-697d35206a2481a4bda4c4c01ddfbcd3"
 *               ollamaApiUrl:
 *                 type: string
 *                 description: URL for Ollama API (required when aiProvider is 'ollama')
 *                 example: "http://localhost:11434"
 *               ollamaModel:
 *                 type: string
 *                 description: Ollama model to use for analysis
 *                 example: "llama2"
 *               customApiKey:
 *                 type: string
 *                 description: API key for custom LLM provider
 *                 example: "api-key-123"
 *               customBaseUrl:
 *                 type: string
 *                 description: Base URL for custom LLM provider
 *                 example: "https://api.customllm.com"
 *               customModel:
 *                 type: string
 *                 description: Model name for custom LLM provider
 *                 example: "custom-model"
 *               processingJobInterval:
 *                 type: number
 *                 description: Interval in minutes for scanning new documents
 *                 example: 15
 *               processingEnableJob:
 *                 type: boolean
 *                 description: Enable automatic document processing
 *                 example: false
 *               processingEnableWebhook:
 *                 type: boolean
 *                 description: Enable webhook processing
 *                 example: true
 *               aiSystemPrompt:
 *                 type: string
 *                 description: Custom system prompt for document analysis
 *                 example: "Extract key information from the following document..."
 *               filterDocuments:
 *                 type: boolean
 *                 description: Enable tag-based filtering for documents
 *                 example: true
 *               aiTokenLimit:
 *                 type: integer
 *                 description: The maximum number of tokens the AI can handle
 *                 example: 128000
 *               aiResponseTokens:
 *                 type: integer
 *                 description: The approx. amount of tokens required for the response
 *                 example: 1000
 *               aiContentSourceMode:
 *                 type: string
 *                 description: Which document data is sent to the AI for analysis
 *                 enum: ["content", "raw_document", "both"]
 *                 example: "content"
 *               aiRawDocumentMode:
 *                 type: string
 *                 description: How raw document data is sent to the AI
 *                 enum: ["text", "file", "image"]
 *                 example: "text"
 *               filterIncludeTags:
 *                 type: string
 *                 description: Comma-separated list of tags to include
 *                 example: "Invoice,Receipt,Contract"
 *               filterExcludeTags:
 *                 type: string
 *                 description: Comma-separated list of tags to exclude (takes precedence)
 *                 example: "no-AI,ignore"
 *               postProcessingAddTags:
 *                 type: boolean
 *                 description: Whether to add tags after AI processing
 *                 example: true
 *               postProcessingTagsToAdd:
 *                 type: string
 *                 description: Comma-separated list of tags to add after AI processing
 *                 example: "ai-processed,reviewed"
 *               postProcessingRemoveTags:
 *                 type: boolean
 *                 description: Whether to remove tags after processing
 *                 example: false
 *               postProcessingTagsToRemove:
 *                 type: string
 *                 description: Comma-separated list of tags to remove after processing
 *                 example: "inbox,no-ai"
 *               aiUsePromptTags:
 *                 type: boolean
 *                 description: Whether to use tags in prompts
 *                 example: true
 *               aiPromptTags:
 *                 type: string
 *                 description: Comma-separated list of tags to use in prompts
 *                 example: "Invoice,Receipt"
 *               username:
 *                 type: string
 *                 description: Admin username for Paperless-AI
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 description: Admin password for Paperless-AI
 *                 example: "securepassword"
 *               aiUseExistingData:
 *                 type: boolean
 *                 description: Whether to use existing data from a previous setup
 *                 example: false
 *               enableTags:
 *                 type: boolean
 *                 description: Enable AI-based tag suggestions
 *                 example: true
 *               enableCorrespondent:
 *                 type: boolean
 *                 description: Enable AI-based correspondent suggestions
 *                 example: true
 *               enableDocumentType:
 *                 type: boolean
 *                 description: Enable AI-based document type suggestions
 *                 example: true
 *               enableTitle:
 *                 type: boolean
 *                 description: Enable AI-based title suggestions
 *                 example: true
 *               enableDocumentDate:
 *                 type: boolean
 *                 description: Enable AI-based document date extraction
 *                 example: true
 *               enableLanguage:
 *                 type: boolean
 *                 description: Enable AI-based language detection
 *                 example: true
 *               enableContent:
 *                 type: boolean
 *                 description: Enable AI-based document content updates
 *                 example: false
 *               enableCustomFields:
 *                 type: boolean
 *                 description: Enable AI-based custom field extraction
 *                 example: false
 *     responses:
 *       200:
 *         description: Setup completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["success"]
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Configuration saved successfully"
 *       400:
 *         description: Invalid configuration parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Missing required configuration parameters"
 *       500:
 *         description: Server error during setup
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Failed to save configuration: Database error"
 */
router.post('/setup', express.json(), async (req, res) => {
  try {
    const {
      paperlessApiUrl,
      paperlessApiToken,
      aiProvider,
      openaiApiKey,
      openaiModel,
      openaiGizmoId,
      ollamaApiUrl,
      ollamaModel,
      processingJobInterval,
      aiSystemPrompt,
      filterDocuments,
      aiTokenLimit,
      aiResponseTokens,
      aiContentSourceMode,
      aiRawDocumentMode,
      filterIncludeTags,
      filterExcludeTags,
      postProcessingAddTags,
      postProcessingTagsToAdd,
      postProcessingRemoveTags,
      postProcessingTagsToRemove,
      aiUsePromptTags,
      aiPromptTags,
      username,
      password,
      aiUseExistingData,
      customApiKey,
      customBaseUrl,
      customModel,
      enableTags,
      enableCorrespondent,
      enableDocumentType,
      enableTitle,
      enableDocumentDate,
      enableLanguage,
      enableContent,
      enableCustomFields,
      aiCustomFields,
      processingEnableJob,
      processingEnableWebhook,
      restrictToExistingTags,
      restrictToExistingCorrespondents,
      restrictToExistingDocumentTypes,
      azureEndpoint,
      azureApiKey,
      azureDeploymentName,
      azureApiVersion
    } = req.body;

    const allowedContentSourceModes = new Set(['content', 'raw_document', 'both']);
    if (aiContentSourceMode && !allowedContentSourceModes.has(aiContentSourceMode)) {
      return res.status(400).json({
        error: 'Invalid content source mode. Must be one of: content, raw_document, both.'
      });
    }
    const allowedRawDocumentModes = new Set(['text', 'file', 'image']);
    if (aiRawDocumentMode && !allowedRawDocumentModes.has(aiRawDocumentMode)) {
      return res.status(400).json({
        error: 'Invalid raw document mode. Must be one of: text, file, image.'
      });
    }

    // Log setup request with sensitive data redacted
    const sensitiveKeys = ['paperlessApiToken', 'openaiApiKey', 'customApiKey', 'password', 'confirmPassword'];
    const redactedBody = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [
      key,
      sensitiveKeys.includes(key) ? '******' : value
      ])
    );
    console.log('Setup request received:', redactedBody);


    // Initialize paperlessService with the new credentials
    const paperlessApiEndpoint = paperlessApiUrl + '/api';
    const initSuccess = await paperlessService.initializeWithCredentials(paperlessApiEndpoint, paperlessApiToken);

    if (!initSuccess) {
      return res.status(400).json({
        error: 'Failed to initialize connection to Paperless-ngx. Please check URL and Token.'
      });
    }

    // Validate Paperless credentials
    const isPaperlessValid = await paperlessService.validateConfig();
    if (!isPaperlessValid) {
      return res.status(400).json({
        error: 'Paperless-ngx connection failed. Please check URL and Token.'
      });
    }

    const requiredPermissions = buildRequiredPaperlessPermissions({
      enableUpdates: {
        tags: enableTags,
        correspondent: enableCorrespondent,
        documentType: enableDocumentType,
        title: enableTitle,
        documentDate: enableDocumentDate,
        language: enableLanguage,
        content: enableContent,
        customFields: enableCustomFields
      },
      restrictToExisting: {
        tags: restrictToExistingTags,
        correspondents: restrictToExistingCorrespondents,
        documentTypes: restrictToExistingDocumentTypes
      },
      postProcessingAddTags,
      postProcessingRemoveTags
    });
    const isPermissionValid = await paperlessService.validatePermissions(requiredPermissions);
    if (!isPermissionValid.success) {
      return res.status(400).json({
        error: 'Paperless-ngx API permissions are insufficient. Error: ' + isPermissionValid.message
      });
    }

    // Process custom fields if enabled
    let processedCustomFields = [];
    if (aiCustomFields && parseBoolean(enableCustomFields, true)) {
      const inputFields = configService.parseCustomFieldsInput(aiCustomFields);
      for (const field of inputFields) {
        try {
          const createdField = await paperlessService.createCustomFieldSafely(
            field.name,
            field.data_type,
            field.extra_data?.default_currency
          );

          if (createdField) {
            processedCustomFields.push(field);
            console.info(`Created/found custom field: ${field.name}`);
          }
        } catch (fieldError) {
          console.warn(`Error creating custom field ${field.name}:`, fieldError);
        }
      }
    }

    // Generate tokens if not provided in environment
    const apiToken = process.env.API_KEY || require('crypto').randomBytes(64).toString('hex');
    const jwtToken = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');

    const processedPrompt = aiSystemPrompt
      ? aiSystemPrompt.replace(/\r\n/g, '\n').replace(/\n/g, '\\n').replace(/=/g, '')
      : '';

    // Prepare base config
    const config = configService.buildSetupConfigFromRequest({
      body: req.body,
      processedPrompt,
      apiToken,
      jwtToken,
      processedCustomFields
    });

    // Validate AI provider config
    if (aiProvider === 'openai') {
      config.OPENAI_API_KEY = openaiApiKey;
      config.OPENAI_MODEL = openaiModel || 'gpt-4o-mini';
      config.OPENAI_GIZMO_ID = openaiGizmoId || '';
    } else if (aiProvider === 'ollama') {
      config.OLLAMA_API_URL = ollamaApiUrl || 'http://localhost:11434';
      config.OLLAMA_MODEL = ollamaModel || 'llama3.2';
    } else if (aiProvider === 'custom') {
      config.CUSTOM_BASE_URL = customBaseUrl;
      config.CUSTOM_API_KEY = customApiKey;
      config.CUSTOM_MODEL = customModel;
    } else if (aiProvider === 'azure') {
      config.AZURE_ENDPOINT = azureEndpoint || config.AZURE_ENDPOINT;
      config.AZURE_API_KEY = azureApiKey || config.AZURE_API_KEY;
      config.AZURE_DEPLOYMENT_NAME = azureDeploymentName || config.AZURE_DEPLOYMENT_NAME;
      config.AZURE_API_VERSION = azureApiVersion || config.AZURE_API_VERSION;
    }

    // Save configuration
    await configService.saveConfig(config);
    container.refreshConfig(configService.getRuntimeConfig({ refresh: true }));
    const hashedPassword = await bcrypt.hash(password, 15);
    await documentModel.addUser(username, hashedPassword);

    res.json({
      success: true,
      message: 'Configuration saved successfully.',
      restart: true
    });

    // Trigger application restart
    setTimeout(() => {
      process.exit(0);
    }, 5000);

  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      error: 'An error occurred: ' + error.message
    });
  }
});

/**
 * @swagger
 * /settings:
 *   post:
 *     summary: Update application settings
 *     description: |
 *       Updates the configuration settings of the Paperless-AI application after initial setup.
 *       This endpoint allows administrators to modify connections to Paperless-ngx,
 *       AI provider settings, processing parameters, and feature toggles.
 *
 *       Changes made through this endpoint are applied immediately and affect all future
 *       document processing operations.
 *     tags:
 *       - System
 *       - Setup
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paperlessApiUrl:
 *                 type: string
 *                 description: URL of the Paperless-ngx instance
 *                 example: "https://paperless.example.com"
 *               paperlessApiToken:
 *                 type: string
 *                 description: API token for Paperless-ngx access
 *                 example: "abc123def456"
 *               aiProvider:
 *                 type: string
 *                 description: Selected AI provider for document analysis
 *                 enum: ["openai", "ollama", "custom", "azure"]
 *                 example: "openai"
 *               openaiApiKey:
 *                 type: string
 *                 description: API key for OpenAI (required when aiProvider is 'openai')
 *                 example: "sk-abc123def456"
 *               openaiModel:
 *                 type: string
 *                 description: OpenAI model to use for analysis
 *                 example: "gpt-4"
 *               openaiSystemPromptRole:
 *                 type: string
 *                 description: Role to use for the system prompt (OpenAI)
 *                 enum: ["system", "developer"]
 *                 example: "system"
 *               ollamaApiUrl:
 *                 type: string
 *                 description: URL for Ollama API (required when aiProvider is 'ollama')
 *                 example: "http://localhost:11434"
 *               ollamaModel:
 *                 type: string
 *                 description: Ollama model to use for analysis
 *                 example: "llama2"
 *               customApiKey:
 *                 type: string
 *                 description: API key for custom LLM provider
 *                 example: "api-key-123"
 *               customBaseUrl:
 *                 type: string
 *                 description: Base URL for custom LLM provider
 *                 example: "https://api.customllm.com"
 *               customModel:
 *                 type: string
 *                 description: Model name for custom LLM provider
 *                 example: "custom-model"
 *               processingJobInterval:
 *                 type: number
 *                 description: Interval in minutes for scanning new documents
 *                 example: 15
 *               aiSystemPrompt:
 *                 type: string
 *                 description: Custom system prompt for document analysis
 *                 example: "Extract key information from the following document..."
 *               filterDocuments:
 *                 type: boolean
 *                 description: Whether to show tags in the UI
 *                 example: true
 *               aiTokenLimit:
 *                 type: integer
 *                 description: The maximum number of tokens th AI can handle
 *                 example: 128000
 *               aiResponseTokens:
 *                 type: integer
 *                 description: The approx. amount of tokens required for the response
 *                 example: 1000
 *               aiContentSourceMode:
 *                 type: string
 *                 description: Which document data is sent to the AI for analysis
 *                 enum: ["content", "raw_document", "both"]
 *                 example: "content"
 *               aiRawDocumentMode:
 *                 type: string
 *                 description: How raw document data is sent to the AI
 *                 enum: ["text", "file", "image"]
 *                 example: "text"
 *               filterIncludeTags:
 *                 type: string
 *                 description: Comma-separated list of tags to include
 *                 example: "Invoice,Receipt,Contract"
 *               filterExcludeTags:
 *                 type: string
 *                 description: Comma-separated list of tags to exclude (takes precedence)
 *                 example: "no-AI,ignore"
 *               postProcessingAddTags:
 *                 type: boolean
 *                 description: Whether to add tags after AI processing
 *                 example: true
 *               postProcessingTagsToAdd:
 *                 type: string
 *                 description: Comma-separated list of tags to add after AI processing
 *                 example: "ai-processed,reviewed"
 *               postProcessingRemoveTags:
 *                 type: boolean
 *                 description: Whether to remove tags after processing
 *                 example: false
 *               postProcessingTagsToRemove:
 *                 type: string
 *                 description: Comma-separated list of tags to remove after processing
 *                 example: "inbox,no-ai"
 *               aiUsePromptTags:
 *                 type: boolean
 *                 description: Whether to use tags in prompts
 *                 example: true
 *               aiPromptTags:
 *                 type: string
 *                 description: Comma-separated list of tags to use in prompts
 *                 example: "Invoice,Receipt"
 *               aiUseExistingData:
 *                 type: boolean
 *                 description: Whether to use existing data from a previous setup
 *                 example: false
 *               enableTags:
 *                 type: boolean
 *                 description: Enable AI-based tag suggestions
 *                 example: true
 *               enableCorrespondent:
 *                 type: boolean
 *                 description: Enable AI-based correspondent suggestions
 *                 example: true
 *               enableDocumentType:
 *                 type: boolean
 *                 description: Enable AI-based document type suggestions
 *                 example: true
 *               enableTitle:
 *                 type: boolean
 *                 description: Enable AI-based title suggestions
 *                 example: true
 *               enableDocumentDate:
 *                 type: boolean
 *                 description: Enable AI-based document date extraction
 *                 example: true
 *               enableLanguage:
 *                 type: boolean
 *                 description: Enable AI-based language detection
 *                 example: true
 *               enableContent:
 *                 type: boolean
 *                 description: Enable AI-based document content updates
 *                 example: false
 *               enableCustomFields:
 *                 type: boolean
 *                 description: Enable AI-based custom field extraction
 *                 example: false
 *               aiCustomFields:
 *                 type: string
 *                 description: JSON string defining custom fields to extract
 *                 example: '{"invoice_number":{"type":"string"},"total_amount":{"type":"number"}}'
 *               processingEnableJob:
 *                 type: boolean
 *                 description: Enable automatic document processing
 *                 example: false
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["success"]
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Settings updated successfully"
 *       400:
 *         description: Invalid configuration parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Invalid settings: AI provider required when automatic processing is enabled"
 *       500:
 *         description: Server error while updating settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Failed to update settings: Database error"
 */
router.post('/settings', [express.json(), authenticateAPI], async (req, res) => {
  try {
    const {
      paperlessApiUrl,
      paperlessApiToken,
      aiProvider,
      openaiApiKey,
      openaiModel,
      openaiGizmoId,
      ollamaApiUrl,
      ollamaModel,
      processingJobInterval,
      aiSystemPrompt,
      filterDocuments,
      aiTokenLimit,
      aiResponseTokens,
      aiContentSourceMode,
      aiRawDocumentMode,
      filterIncludeTags,
      filterExcludeTags,
      postProcessingAddTags,
      postProcessingTagsToAdd,
      postProcessingRemoveTags,
      postProcessingTagsToRemove,
      aiUsePromptTags,
      aiPromptTags,
      aiUseExistingData,
      customApiKey,
      customBaseUrl,
      customModel,
      enableTags,
      enableCorrespondent,
      enableDocumentType,
      enableTitle,
      enableDocumentDate,
      enableLanguage,
      enableContent,
      enableCustomFields,
      aiCustomFields,
      processingEnableJob,
      processingEnableWebhook,
      restrictToExistingTags,
      restrictToExistingCorrespondents,
      restrictToExistingDocumentTypes,
      azureEndpoint,
      azureApiKey,
      azureDeploymentName,
      azureApiVersion
    } = req.body;

    //replace equal char in system prompt
    const processedPrompt = aiSystemPrompt
      ? aiSystemPrompt.replace(/\r\n/g, '\n').replace(/=/g, '')
      : '';

    const allowedContentSourceModes = new Set(['content', 'raw_document', 'both']);
    if (aiContentSourceMode && !allowedContentSourceModes.has(aiContentSourceMode)) {
      return res.status(400).json({
        error: 'Invalid content source mode. Must be one of: content, raw_document, both.'
      });
    }
    const allowedRawDocumentModes = new Set(['text', 'file', 'image']);
    if (aiRawDocumentMode && !allowedRawDocumentModes.has(aiRawDocumentMode)) {
      return res.status(400).json({
        error: 'Invalid raw document mode. Must be one of: text, file, image.'
      });
    }

    const baseConfig = configService.buildBaseConfig();
    const savedConfig = await configService.loadConfig();
    const currentConfig = configService.mergeSavedConfig(baseConfig, savedConfig);

    const processedCustomFields = configService.parseCustomFieldsInput(aiCustomFields);

    // Extract tag and correspondent restriction settings with defaults
    const isConfigured = await configService.isConfigured();

    if (paperlessApiUrl !== currentConfig.PAPERLESS_API_URL?.replace('/api', '') ||
        paperlessApiToken !== currentConfig.PAPERLESS_API_TOKEN) {
      const tempPaperlessService = new PaperlessService({
        apiUrl: `${paperlessApiUrl}/api`,
        apiToken: paperlessApiToken
      });
      const isPaperlessValid = await tempPaperlessService.validateConfig();
      if (!isPaperlessValid) {
        return res.status(400).json({
          error: 'Paperless-ngx connection failed. Please check URL and Token.'
        });
      }
      const requiredPermissions = buildRequiredPaperlessPermissions({
        enableUpdates: {
          tags: enableTags,
          correspondent: enableCorrespondent,
          documentType: enableDocumentType,
          title: enableTitle,
          documentDate: enableDocumentDate,
          language: enableLanguage,
          content: enableContent,
          customFields: enableCustomFields
        },
        restrictToExisting: {
          tags: restrictToExistingTags,
          correspondents: restrictToExistingCorrespondents,
          documentTypes: restrictToExistingDocumentTypes
        },
        postProcessingAddTags,
        postProcessingRemoveTags
      });
      const isPermissionValid = await tempPaperlessService.validatePermissions(requiredPermissions);
      if (!isPermissionValid.success) {
        return res.status(400).json({
          error: 'Paperless-ngx API permissions are insufficient. Error: ' + isPermissionValid.message
        });
      }
    }
    const { updatedConfig, mergedConfig } = configService.buildSettingsUpdateFromRequest({
      body: req.body,
      currentConfig,
      processedPrompt,
      processedCustomFields
    });

    // Handle AI provider configuration
    if (aiProvider) {
      updatedConfig.AI_PROVIDER = aiProvider;

      if (aiProvider === 'openai' && openaiApiKey) {
        updatedConfig.OPENAI_API_KEY = openaiApiKey;
        if (openaiModel) updatedConfig.OPENAI_MODEL = openaiModel;
        if (openaiGizmoId !== undefined) updatedConfig.OPENAI_GIZMO_ID = openaiGizmoId;
      }
      else if (aiProvider === 'ollama' && (ollamaApiUrl || ollamaModel)) {
        if (ollamaApiUrl) updatedConfig.OLLAMA_API_URL = ollamaApiUrl;
        if (ollamaModel) updatedConfig.OLLAMA_MODEL = ollamaModel;
      } else if (aiProvider === 'azure') {
        if (azureEndpoint) updatedConfig.AZURE_ENDPOINT = azureEndpoint;
        if (azureApiKey) updatedConfig.AZURE_API_KEY = azureApiKey;
        if (azureDeploymentName) updatedConfig.AZURE_DEPLOYMENT_NAME = azureDeploymentName;
        if (azureApiVersion) updatedConfig.AZURE_API_VERSION = azureApiVersion;
      } else if (aiProvider === 'custom') {
        if (customBaseUrl) updatedConfig.CUSTOM_BASE_URL = customBaseUrl;
        if (customApiKey) updatedConfig.CUSTOM_API_KEY = customApiKey;
        if (customModel) updatedConfig.CUSTOM_MODEL = customModel;
      }
    }

    const finalConfig = { ...mergedConfig, ...updatedConfig };

    await configService.saveConfig(finalConfig);
    container.refreshConfig(configService.getRuntimeConfig({ refresh: true }));
    res.json({
      success: true,
      message: 'Configuration saved successfully.',
      restart: true
    });

    setTimeout(() => {
      process.exit(0);
    }, 5000);

  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({
      error: 'An error occurred: ' + error.message
    });
  }
});

/**
 * @swagger
 * /api/processing-status:
 *   get:
 *     summary: Get document processing status
 *     description: |
 *       Returns the current status of document processing operations.
 *       This endpoint provides information about documents in the processing queue
 *       and the current processing state (active/idle).
 *
 *       The status information can be used by UIs to display progress indicators
 *       and provide real-time feedback about background processing operations.
 *     tags:
 *       - Documents
 *       - System
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Processing status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isProcessing:
 *                   type: boolean
 *                   description: Whether documents are currently being processed
 *                   example: true
 *                 queueLength:
 *                   type: integer
 *                   description: Number of documents waiting in the processing queue
 *                   example: 5
 *                 currentDocument:
 *                   type: object
 *                   description: Details about the document currently being processed (if any)
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Document ID
 *                       example: 123
 *                     title:
 *                       type: string
 *                       description: Document title
 *                       example: "Invoice #12345"
 *                     status:
 *                       type: string
 *                       description: Current processing status
 *                       example: "processing"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch processing status"
 */
router.get('/api/processing-status', authenticateAPI, async (req, res) => {
  try {
      const status = await documentModel.getCurrentProcessingStatus();
      res.json(status);
  } catch (error) {
      res.status(500).json({ error: 'Failed to fetch processing status' });
  }
});

router.get('/api/rag-test', authenticateAPI, async (req, res) => {
  RAGService.initialize();
  try {
    if(await RAGService.sendDocumentsToRAGService()){
      res.status(200).json({ success: true });
    }else{
      res.status(500).json({ success: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch processing status' });
  }
}
);

router.get('/dashboard/doc/:id', authenticateAPI, async (req, res) => {
  const docId = req.params.id;
  if (!docId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }
  try {
    // Redirect to paperless-ngx and show detail page of the document (for example https://paperless.example.com/documents/887/details)
    const paperlessApiUrl = process.env.PAPERLESS_API_URL;
    const paperlessApiUrlWithoutApi = paperlessApiUrl.replace('/api', '');
    const redirectUrl = `${paperlessApiUrlWithoutApi}/documents/${docId}/details`;
    console.log('Redirecting to Paperless-ngx URL:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

module.exports = router;
