const config = require('../config/config');
const ServiceContainer = require('./serviceContainer');

module.exports = new ServiceContainer(config);
