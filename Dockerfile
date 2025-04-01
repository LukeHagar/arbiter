FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose ports for proxy and docs servers
EXPOSE 8080 9000

# Set default command
CMD ["node", "dist/src/cli.js"] 