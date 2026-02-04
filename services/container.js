const ServiceContainer = require('./serviceContainer');
const configService = require('./configService');

module.exports = new ServiceContainer(configService.getRuntimeConfig());
