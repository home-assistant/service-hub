FROM mcr.microsoft.com/devcontainers/typescript-node:4-20
ENV \
    DEBIAN_FRONTEND=noninteractive \
    DEVCONTAINER=true \
    PATH=$PATH:./node_modules/.bin

# Install cli
RUN \
    yarn global add \
    @nestjs/cli \
    \
    && apt update \
    && apt install -y \
    redis-server \
    && rm -fr /var/lib/apt/lists/*
