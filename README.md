# Arbiter

A powerful API proxy with automatic OpenAPI documentation generation and HAR export capabilities.

## Features

- Proxy API requests to any target server
- Automatic OpenAPI documentation generation
- HAR file export for request/response analysis
- Beautiful API documentation powered by [Scalar](https://github.com/scalar/scalar)
  - Interactive API playground
  - Dark/Light theme support
  - Request/Response examples
  - Authentication handling
  - OpenAPI 3.1 support
- CLI interface for easy configuration
- Support for security scheme detection
- CORS enabled by default
- Pretty JSON responses

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/LukeHagar/arbiter.git
cd arbiter
npm install
```

## Usage

### Development Setup

1. Build the project:
```bash
npm run build
```

2. Start the development server:
```bash
npm run dev -- --target http://api.example.com
```

Once started, you can access:
- The API documentation at `http://localhost:9000/docs`
- The proxy server at `http://localhost:8080`

The documentation interface is powered by Scalar, providing:
- A modern, responsive UI for API exploration
- Interactive request builder and testing
- Authentication management
- Code snippets in multiple languages
- Dark/Light theme switching
- OpenAPI 3.1 specification support

### CLI Options

```bash
# Basic usage (default ports: proxy=8080, docs=9000)
npm run dev -- --target http://api.example.com

# Specify custom ports
npm run dev -- --port 3000 --docs-port 4000 --target http://api.example.com

# Run with verbose logging
npm run dev -- --verbose --target http://api.example.com

# Run only the documentation server
npm run dev -- --docs-only --target http://api.example.com

# Run only the proxy server
npm run dev -- --proxy-only --target http://api.example.com
```

### Required Options
- `-t, --target <url>`: Target API URL to proxy to (required)

### Optional Options
- `-p, --port <number>`: Port for the proxy server (default: 8080)
- `-d, --docs-port <number>`: Port for the documentation server (default: 9000)
- `--docs-only`: Run only the documentation server
- `--proxy-only`: Run only the proxy server
- `-v, --verbose`: Enable verbose logging

## Architecture

Arbiter runs two separate servers:

1. **Proxy Server** (default port 8080)
   - Handles all API requests
   - Forwards requests to the target API
   - Records request/response data
   - Detects and records security schemes

2. **Documentation Server** (default port 9000)
   - Serves the Scalar API documentation interface
   - Provides interactive API playground
   - Supports OpenAPI 3.1 specification
   - Handles HAR file exports
   - Separated from proxy for better performance

## API Endpoints

### Proxy Server
- All requests are proxied to the target API
- No path prefix required
- Example: `http://localhost:8080/api/v1/users`

### Documentation Server
- `/docs` - Scalar API documentation interface
  - Interactive request builder
  - Authentication management
  - Code snippets in multiple languages
  - Dark/Light theme support
- `/openapi.json` - OpenAPI specification in JSON format
- `/openapi.yaml` - OpenAPI specification in YAML format
- `/har` - HAR file export

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

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

## License

This project is licensed under the ISC License - see the LICENSE file for details.
