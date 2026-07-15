# tsx runs the TypeScript entrypoint directly — no build step.
FROM node:24-alpine

WORKDIR /app

# corepack installs the pnpm version pinned in package.json's packageManager.
RUN corepack enable

# Install dependencies first for layer caching. --frozen-lockfile fails the
# build if pnpm-lock.yaml is out of sync with package.json. The workspace
# file carries the esbuild build-script approval.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY . .

ENV ENVIRONMENT=production
ENV PORT=8787
EXPOSE 8787

CMD ["./node_modules/.bin/tsx", "src/server.ts"]
