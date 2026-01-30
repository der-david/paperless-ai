const jwt = require('jsonwebtoken');
const config = require('../config/config');

// JWT secret key - should be moved to environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// JWT middleware to verify token

const getJWT = (req) => {
  return req.cookies.jwt || req.headers.authorization?.split(' ')[1];
};

const hasJWT = (req) => {
  if(getJWT(req)) {
    return true;
  }
};

const isValidJWT = (token) => {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch (error) {
  }
};

const hasValidJWT = (req) => {
  return isValidJWT(getJWT(req));
};

const applyJWT = (req) => {
  try {
    const decoded = jwt.verify(getJWT(req), JWT_SECRET);
    req.user = decoded;
    return true;
  } catch (error) {
  }
};

const getAPIKey = (req) => {
  return req.headers['x-api-key'];
};

const hasAPIKey = (req) => {
  if(getAPIKey(req)) {
    return true;
  }
};

const isValidAPIKey = (apiKey) => {
  return apiKey === process.env.API_KEY;
};

const hasValidAPIKey = (req) => {
  return isValidAPIKey(getAPIKey(req));
};

const applyAPIKey = (req) => {
  req.user = { apiKey: true };
  return true;
};

const authenticateJWT = (req, res, next) => {
  if (!hasJWT(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!hasValidJWT(req)) {
    res.clearCookie('jwt');
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
  applyJWT(req);
  next();
};

const authenticateAPIKey = (req, res, next) => {
  if (!hasAPIKey(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!hasValidAPIKey(req)) {
    return res.status(403).json({ message: 'Invalid API key' });
  }
  applyAPIKey(req);
  next();
};

const authenticateAPI = (req, res, next) => {
  if (!hasAPIKey(req) && !hasJWT(req)) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (hasValidAPIKey(req)) {
    applyAPIKey(req);
    next();
    return;
  }

  if (hasValidJWT(req)) {
    applyJWT(req);
    next();
    return;
  }
  res.clearCookie('jwt');
  res.status(403).json({ message: 'Invalid or expired authentication' });
};

const authenticateUI = (req, res, next) => {
  if (!hasValidJWT(req)) {
    res.clearCookie('jwt');
    res.redirect('/login');
    return;
  }
  applyJWT(req);
  next();
};

module.exports = { authenticateJWT, authenticateAPIKey, authenticateAPI, authenticateUI };