# tsx runs the TypeScript entrypoint directly — no build step.
FROM node:24-alpine

WORKDIR /app

# Install dependencies first for layer caching. npm ci fails the build if
# package-lock.json is out of sync with package.json.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV ENVIRONMENT=production
ENV PORT=8787
EXPOSE 8787

CMD ["./node_modules/.bin/tsx", "src/server.ts"]
