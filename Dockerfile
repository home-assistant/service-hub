# Bun runs the TypeScript entrypoint directly — no build step.
FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies first for layer caching. --frozen-lockfile fails the
# build if bun.lock is out of sync with package.json.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

ENV ENVIRONMENT=production
ENV PORT=8787
EXPOSE 8787

CMD ["bun", "src/server.ts"]
