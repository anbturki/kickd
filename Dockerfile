FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Create data directory
RUN mkdir -p data logs

EXPOSE 7400

ENV KICKD_PORT=7400

CMD ["bun", "run", "start"]
