# service-hub

This is an all-purpose monorepo to handle our service needs.

## Services

### Bots

#### [cla-sign](https://github.com/home-assistant/service-hub/tree/main/services/bots/src/cla-sign)

Receiver to handle CLA sign requests

#### [discord](https://github.com/home-assistant/service-hub/tree/main/services/bots/src/discord)

Bot for our [Discord server](https://www.home-assistant.io/join-chat)

#### [github-webhook](https://github.com/home-assistant/service-hub/tree/main/services/bots/src/github-webhook)

Webhook handler for all our GitHub repositories

## Deployments

When a new release is created, a new container image is created and pushed to [ghcr.io](https://github.com/home-assistant/service-hub/pkgs/container/service-hub).

All deployments are defined in our [deployments repository](https://github.com/home-assistant/deployments).
