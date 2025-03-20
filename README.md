# Arbiter

A powerful API proxy with automatic OpenAPI documentation generation and HAR export capabilities.

## Features

- Proxy API requests to any target server
- Automatic OpenAPI documentation generation
- HAR file export for request/response analysis
- Beautiful Swagger UI for API exploration
- CLI interface for easy configuration
- Support for API key injection
- CORS enabled by default
- Pretty JSON responses

## Installation

```bash
npm install -g arbiter
```

Or clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/arbiter.git
cd arbiter
npm install
```

## Usage

### CLI

The easiest way to use Arbiter is through the CLI:

```bash
# Basic usage
arbiter --target http://api.example.com

# Specify custom port
arbiter --port 8080 --target http://api.example.com

# Add API key to requests
arbiter --key your-api-key --target http://api.example.com

# Run only the documentation server
arbiter --docs-only --port 3000

# Run only the proxy server
arbiter --proxy-only --port 3000

# Enable verbose logging
arbiter --verbose --target http://api.example.com
```

### Development

For development, you can use the following commands:

```bash
# Start the development server
npm run dev

# Build the project
npm run build

# Start the production server
npm start

# Run the CLI in development mode
npm run cli
```

## Architecture

Arbiter runs two separate servers:

1. **Proxy Server** (default port 3000)
   - Handles all API requests
   - Forwards requests to the target API
   - Records request/response data
   - Supports API key injection

2. **Documentation Server** (default port 3001)
   - Serves the Swagger UI interface
   - Provides OpenAPI specification
   - Handles HAR file exports
   - Separated from proxy for better performance

## API Endpoints

### Proxy Server
- All requests are proxied to the target API
- No path prefix required
- Example: `http://localhost:3000/api/v1/users`

### Documentation Server
- `/docs` - Swagger UI interface
- `/openapi.json` - OpenAPI specification
- `/har` - HAR file export

## Configuration

### Environment Variables

- `PORT` - Proxy server port (default: 3000)
- `TARGET` - Target API URL
- `API_KEY` - API key to add to requests
- `VERBOSE` - Enable verbose logging

### Command Line Options

- `-p, --port <number>` - Proxy server port
- `-t, --target <url>` - Target API URL
- `-k, --key <string>` - API key
- `-d, --docs-only` - Run only documentation server
- `-x, --proxy-only` - Run only proxy server
- `-v, --verbose` - Enable verbose logging

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Testing

The project includes both unit tests and integration tests. Tests are written using Vitest.

### Running Tests Locally

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

### Continuous Integration

The project uses GitHub Actions for continuous integration. The CI pipeline runs on every push to the main branch and on pull requests. It includes:

- Running unit tests
- Running integration tests
- Linting checks
- Testing against multiple Node.js versions (18.x and 20.x)

You can view the CI status in the GitHub Actions tab of the repository.
