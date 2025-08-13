FROM node:20-slim

# Install build tools needed for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose ports for proxy and docs servers
EXPOSE 8080 9000

# Persistent data directory
VOLUME ["/data"]

# Set default command
CMD ["node", "dist/src/cli.js"] 