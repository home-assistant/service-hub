export type Repository = HomeAssistantRepository | ESPHomeRepository;

export enum Organization {
  ESPHOME = "esphome",
  HOME_ASSISTANT = "home-assistant",
}

export enum ESPHomeRepository {
  ESPHOME = "esphome/esphome",
}

export enum HomeAssistantRepository {
  ADDONS = "home-assistant/addons",
  ANDROID = "home-assistant/android",
  BRANDS = "home-assistant/brands",
  CLI = "home-assistant/cli",
  COMPANION_HOME_ASSISTANT = "home-assistant/companion.home-assistant",
  CORE = "home-assistant/core",
  DEVELOPERS_HOME_ASSISTANT = "home-assistant/developers.home-assistant",
  FRONTEND = "home-assistant/frontend",
  HOME_ASSISTANT_IO = "home-assistant/home-assistant.io",
  INTENTS = "home-assistant/intents",
  IOS = "home-assistant/iOS",
  OPERATING_SYSTEM = "home-assistant/operating-system",
  SUPERVISED_INSTALLER = "home-assistant/supervised-installer",
  SUPERVISOR = "home-assistant/supervisor",
}
