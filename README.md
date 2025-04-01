# Arbiter

Arbiter is a powerful API proxy and documentation generator that automatically creates OpenAPI specifications and HAR (HTTP Archive) recordings for any API you access through it.

## Features

- **API Proxy** - Transparently proxies all API requests to the target API 
- **Automatic OpenAPI Generation** - Builds a complete OpenAPI 3.1 specification based on observed traffic
- **HAR Recording** - Records all requests and responses in HAR format for debugging and analysis
- **Interactive API Documentation** - Provides beautiful, interactive API documentation using [Scalar](https://github.com/scalar/scalar)
- **Security Scheme Detection** - Automatically detects and documents API key, Bearer token, and Basic authentication
- **Schema Inference** - Analyzes JSON responses to generate accurate schema definitions
- **Path Parameter Detection** - Intelligently identifies path parameters from multiple requests
- **Support for Complex Content Types** - Handles JSON, XML, form data, and binary content

## Getting Started

### Installation

```bash
npm install -g arbiter
```

### Basic Usage

Start Arbiter by pointing it to your target API:

```bash
arbiter --target https://api.example.com --proxy-port 3000 --docs-port 3001
```

Then send requests through the proxy:

```bash
curl http://localhost:3000/users
```

And view the automatically generated documentation:

```bash
open http://localhost:3001/docs
```

### Docker Usage

You can run Arbiter using Docker:

```bash
# Build the Docker image
docker build -t arbiter .

# Run the container
docker run -p 3000:3000 -p 3001:3001 arbiter --target https://api.example.com
```

The container exposes:
- Port 3000 for the proxy server
- Port 3001 for the documentation server

You can customize the ports and other options:

```bash
docker run -p 8080:8080 -p 8081:8081 arbiter \
  --target https://api.example.com \
  --proxy-port 8080 \
  --docs-port 8081 \
  --verbose
```

## Usage Options

| Option | Description | Default |
|--------|-------------|---------|
| `--target` | Target API URL | (required) |
| `--proxy-port` | Port for the proxy server | 3000 |
| `--docs-port` | Port for the documentation server | 3001 |
| `--verbose` | Enable verbose logging | false |

## API Documentation

After using the API through the proxy, you can access:

- Interactive API docs: `http://localhost:3001/docs`
- OpenAPI JSON: `http://localhost:3001/openapi.json`
- OpenAPI YAML: `http://localhost:3001/openapi.yaml`
- HAR Export: `http://localhost:3001/har`

## How It Works

### Proxy Server

Arbiter creates a proxy server that forwards all requests to your target API, preserving headers, method, body, and other request details. Responses are returned unmodified to the client, while Arbiter records the exchange in the background.

### OpenAPI Generation

As requests flow through the proxy, Arbiter:

1. Records endpoints, methods, and path parameters
2. Analyzes request bodies and generates request schemas
3. Processes response bodies and generates response schemas
4. Detects query parameters and headers
5. Identifies security schemes based on authentication headers
6. Combines multiple observations to create a comprehensive specification

### Schema Generation

Arbiter uses sophisticated algorithms to generate accurate JSON schemas:

- Object property types are inferred from values
- Array item schemas are derived from sample items
- Nested objects and arrays are properly represented
- Path parameters are identified from URL patterns
- Query parameters are extracted and documented
- Security requirements are automatically detected

### HAR Recording

All requests and responses are recorded in HAR (HTTP Archive) format, providing:

- Complete request details (method, URL, headers, body)
- Complete response details (status, headers, body)
- Timing information
- Content size and type

## Advanced Features

### Structure Analysis

Arbiter can analyze the structure of JSON-like text that isn't valid JSON:

- Detects array-like structures (`[{...}, {...}]`)
- Identifies object-like structures (`{"key": "value"}`)
- Extracts field names from malformed JSON
- Provides fallback schemas for unstructured content

### Content Processing

Arbiter handles various content types:

- **JSON** - Parsed and converted to schemas with proper types
- **XML** - Recognized and documented with appropriate schema format
- **Form Data** - Processed and documented as form parameters
- **Binary Data** - Handled with appropriate binary format schemas
- **Compressed Content** - Automatically decompressed (gzip support)

## Middleware Usage

Arbiter can also be used as middleware in your own application:

```typescript
import express from 'express';
import { harRecorder } from 'arbiter/middleware';
import { openApiStore } from 'arbiter/store';

const app = express();

// Add Arbiter middleware
app.use(harRecorder(openApiStore));

// Your routes
app.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'User' }]);
});

app.listen(3000);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
