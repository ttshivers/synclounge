#!/usr/bin/env node

const syncloungeServer = require('syncloungeserver');
const path = require('path');
const config = require('./config');

// Using a single function to handle multiple signals
const handle = (signal) => {
  console.log(`Received ${signal}. Exiting`);
  process.exit(0);
};

process.on('SIGINT', handle);
process.on('SIGTERM', handle);

const blockList = Object.keys(syncloungeServer.defaultConfig);
const appConfig = config.get(null, blockList);
console.log(appConfig);

const preStaticInjection = (router) => {
  // Add route for config
  router.get('/config.json', (req, res) => {
    res.json(appConfig);
  });
};

const socketConfig = syncloungeServer.getConfig();
syncloungeServer.socketServer({
  ...socketConfig,
  static_path: path.join(__dirname, 'dist'),
  preStaticInjection,
});
