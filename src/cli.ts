#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { startServers } from './server.js';

const program = new Command();

console.log('Starting Arbiter...');

program
  .name('arbiter')
  .description('API proxy with OpenAPI generation and HAR export capabilities')
  .version('1.0.0')
  .requiredOption('-t, --target <url>', 'target API URL to proxy to')
  .option('-p, --port <number>', 'port to run the proxy server on', '8080')
  .option('-d, --docs-port <number>', 'port to run the documentation server on', '9000')
  .option('--docs-only', 'run only the documentation server')
  .option('--proxy-only', 'run only the proxy server')
  .option('-v, --verbose', 'enable verbose logging')
  .parse(process.argv);

const options = program.opts();

// Start the servers
startServers({
  target: options.target,
  proxyPort: parseInt(options.port),
  docsPort: parseInt(options.docsPort),
  verbose: options.verbose,
}).catch((error) => {
  console.error(chalk.red('Failed to start servers:'), error);
  process.exit(1);
});
