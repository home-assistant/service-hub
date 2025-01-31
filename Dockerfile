FROM node:20 AS builder
WORKDIR /app
COPY . /app
ENV NODE_ENV production
RUN \
    yarn install \
    && yarn prebuild \
    && yarn build:bots


FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/.yarn /app/.yarn
COPY --from=builder /app/data /app/data
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/libs /app/libs
COPY --from=builder /usr/bin/git /usr/bin/git
COPY package.json ./
COPY version.json ./
COPY yarn.lock ./
COPY .yarnrc.yml ./

ENV NO_COLOR true

RUN yarn install --immutable --immutable-cache

ENTRYPOINT ["yarn"]