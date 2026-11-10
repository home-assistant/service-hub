# service-hub

> [!IMPORTANT]
> **The Home Assistant bots moved to [OpenHomeFoundation/bots](https://github.com/OpenHomeFoundation/bots).**
>
> The Home Assistant GitHub webhooks, the CLA sign flow and the bot on the Home Assistant Discord
> server are now built from that repository, and the Home Assistant deployment of this code was
> shut down. All CLA signatures were carried over, so nobody needs to sign again.
>
> Report issues and send changes to
> [OpenHomeFoundation/bots](https://github.com/OpenHomeFoundation/bots).

This is an all-purpose monorepo to handle our service needs.

## Services

### Bots

#### [cla-sign](https://github.com/home-assistant/service-hub/tree/main/services/bots/src/cla-sign)

Receiver to handle CLA sign requests for the [Home Assistant GitHub organization](https://github.com/orgs/home-assistant).

#### [discord](https://github.com/home-assistant/service-hub/tree/main/services/bots/src/discord)

- Bot for the [Home Assistant Discord server](https://www.home-assistant.io/join-chat)
- Bot for the [ESPHome Discord server](https://discord.gg/KhAMKrd)

#### [github-webhook](https://github.com/home-assistant/service-hub/tree/main/services/bots/src/github-webhook)

- Webhook handler for all [Home Assistant GitHub repositories](https://github.com/orgs/home-assistant/repositories)
- Webhook handler for all [ESPHome GitHub repositories](https://github.com/orgs/esphome/repositories)

## Deployments

When a new release is created, a new container image is created and pushed to [ghcr.io](https://github.com/home-assistant/service-hub/pkgs/container/service-hub).

All deployments are defined in our [deployments repository](https://github.com/home-assistant/deployments).
