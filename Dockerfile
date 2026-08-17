# Build stage: nest build
FROM node:26-alpine AS build

WORKDIR /app

# corepack installs the pnpm version pinned in package.json's packageManager.
RUN npm install -g corepack && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build


# Runtime stage
FROM node:26-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN npm install -g corepack && corepack enable \
    && pnpm install --frozen-lockfile --prod \
    && rm -rf /root/.npm /root/.cache /root/.local/share/pnpm

COPY --from=build /app/dist ./dist

# Sentry deployment label
ENV ENVIRONMENT=production
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

USER node

CMD ["node", "dist/main.js"]
