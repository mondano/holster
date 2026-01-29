# Use official Bun image
FROM oven/bun:1.0-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY bun.lockb package.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the app
COPY . .

# Expose ports
EXPOSE 3000 8765

# Run the app
CMD ["bun", "run", "start"]