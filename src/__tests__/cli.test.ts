import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

describe('CLI Options', () => {
  it('should require target URL', () => {
    const program = new Command();
    program
      .name('arbiter')
      .description('API proxy with OpenAPI generation and HAR export capabilities')
      .version('1.0.0')
      .requiredOption('-t, --target <url>', 'target API URL to proxy to')
      .option('-p, --port <number>', 'port to run the proxy server on', '8080')
      .option('-d, --docs-port <number>', 'port to run the documentation server on', '9000')
      .option('-k, --key <string>', 'API key to add to proxied requests')
      .option('--docs-only', 'run only the documentation server')
      .option('--proxy-only', 'run only the proxy server')
      .option('-v, --verbose', 'enable verbose logging');

    // Test without target URL
    expect(() => program.parse(['node', 'arbiter'])).toThrow();

    // Test with target URL
    const options = program.parse(['node', 'arbiter', '-t', 'http://example.com']).opts();
    expect(options.target).toBe('http://example.com');
    expect(options.port).toBe('8080');
    expect(options.docsPort).toBe('9000');
  });

  it('should handle custom ports', () => {
    const program = new Command();
    program
      .name('arbiter')
      .description('API proxy with OpenAPI generation and HAR export capabilities')
      .version('1.0.0')
      .requiredOption('-t, --target <url>', 'target API URL to proxy to')
      .option('-p, --port <number>', 'port to run the proxy server on', '8080')
      .option('-d, --docs-port <number>', 'port to run the documentation server on', '9000');

    const options = program.parse([
      'node',
      'arbiter',
      '-t',
      'http://example.com',
      '-p',
      '8081',
      '-d',
      '9001',
    ]).opts();

    expect(options.port).toBe('8081');
    expect(options.docsPort).toBe('9001');
  });

  it('should handle API key', () => {
    const program = new Command();
    program
      .name('arbiter')
      .description('API proxy with OpenAPI generation and HAR export capabilities')
      .version('1.0.0')
      .requiredOption('-t, --target <url>', 'target API URL to proxy to')
      .option('-k, --key <string>', 'API key to add to proxied requests');

    const options = program.parse([
      'node',
      'arbiter',
      '-t',
      'http://example.com',
      '-k',
      'test-api-key',
    ]).opts();

    expect(options.key).toBe('test-api-key');
  });

  it('should handle server mode options', () => {
    const program = new Command();
    program
      .name('arbiter')
      .description('API proxy with OpenAPI generation and HAR export capabilities')
      .version('1.0.0')
      .requiredOption('-t, --target <url>', 'target API URL to proxy to')
      .option('--docs-only', 'run only the documentation server')
      .option('--proxy-only', 'run only the proxy server');

    // Test docs-only mode
    const docsOptions = program.parse([
      'node',
      'arbiter',
      '-t',
      'http://example.com',
      '--docs-only',
    ]).opts();
    expect(docsOptions.docsOnly).toBe(true);

    // Test proxy-only mode
    const proxyOptions = program.parse([
      'node',
      'arbiter',
      '-t',
      'http://example.com',
      '--proxy-only',
    ]).opts();
    expect(proxyOptions.proxyOnly).toBe(true);
  });
}); 