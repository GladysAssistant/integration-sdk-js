## [0.13.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.12.0...v0.13.0) (2026-08-27)

### Features

* extend the pivot weather conditions with six distinct phenomena (spec B.18) ([#30](https://github.com/GladysAssistant/integration-sdk-js/issues/30)) ([22388e7](https://github.com/GladysAssistant/integration-sdk-js/commit/22388e7cd824dd3ac7acce443235599c1c2f7b2f))
* resync with Gladys master (camera enabled, siren alarm modes, battery charging, scan result shapes) ([#31](https://github.com/GladysAssistant/integration-sdk-js/issues/31)) ([f46d7e8](https://github.com/GladysAssistant/integration-sdk-js/commit/f46d7e87c32cd461dfd861c1ca131b436868dec2))
## [0.12.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.11.0...v0.12.0) (2026-08-14)

### Features

* resync with Gladys 4.86 (grid/home-output/gas sensors, camera PTZ, wake-on-lan, account_link) ([#28](https://github.com/GladysAssistant/integration-sdk-js/issues/28)) ([9555c5e](https://github.com/GladysAssistant/integration-sdk-js/commit/9555c5e5f23852b7067f6102fe83577a274b29e9))
## [0.11.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.10.0...v0.11.0) (2026-08-07)

### Features

* named container ports and section text placeholders (spec C.1 update) ([#25](https://github.com/GladysAssistant/integration-sdk-js/issues/25)) ([6a15242](https://github.com/GladysAssistant/integration-sdk-js/commit/6a15242f7b1dbdf0202113ee4599fc779129f592))
* resync device constants with Gladys (charging station, water heater, thermostat) ([#26](https://github.com/GladysAssistant/integration-sdk-js/issues/26)) ([3a60fda](https://github.com/GladysAssistant/integration-sdk-js/commit/3a60fda1a2acc36414e68659a2ecb876b8b953a6))
* weather integration type, onWeatherGet handler and pivot format (spec B.18) ([#19](https://github.com/GladysAssistant/integration-sdk-js/issues/19)) ([c29defe](https://github.com/GladysAssistant/integration-sdk-js/commit/c29defe06ab2e0374faa2ac05eaa628a6062cbb9)), closes [GladysAssistant/Gladys#2738](https://github.com/GladysAssistant/Gladys/issues/2738) [GladysAssistant/Gladys#2738](https://github.com/GladysAssistant/Gladys/issues/2738)
## [0.10.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.9.0...v0.10.0) (2026-08-02)

### Features

* resync device constants with Gladys (battery-storage, water-valve) ([#18](https://github.com/GladysAssistant/integration-sdk-js/issues/18)) ([88de117](https://github.com/GladysAssistant/integration-sdk-js/commit/88de1170a7e5f87be660727fde9914fe94338644))
* resync device constants with Gladys (doorbell, AC fan speed and swing) ([#20](https://github.com/GladysAssistant/integration-sdk-js/issues/20)) ([313d44a](https://github.com/GladysAssistant/integration-sdk-js/commit/313d44aec4a3ba3cc81cb5ec8915f898009c0feb))
## [0.9.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.8.0...v0.9.0) (2026-07-23)

### Features

* Gladys Plus webhooks and send-only communication channels (spec B.17 + B.15 update) ([#17](https://github.com/GladysAssistant/integration-sdk-js/issues/17)) ([5fc661b](https://github.com/GladysAssistant/integration-sdk-js/commit/5fc661bded588ac3fa2f0aaf5996650254006959))

### Bug Fixes

* **ci:** full-history checkout and visible docs/refactor commits for the changelog ([#16](https://github.com/GladysAssistant/integration-sdk-js/issues/16)) ([3c89065](https://github.com/GladysAssistant/integration-sdk-js/commit/3c89065e4beaaf26d11bed9f6b6038433be15184))

## [0.8.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.7.0...v0.8.0) (2026-07-23)

### Documentation

* config form section intro blocks and permanent Documentation link (spec update) ([#15](https://github.com/GladysAssistant/integration-sdk-js/issues/15)) ([d6894ac](https://github.com/GladysAssistant/integration-sdk-js/commit/d6894ac10372e089678e555d53346ab949f3c62e))

## [0.7.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.6.1...v0.7.0) (2026-07-23)

## [0.6.1](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.6.0...v0.6.1) (2026-07-23)

### Features

* active broadcast network scan `udp-active-broadcast` (spec B.16 update) ([#12](https://github.com/GladysAssistant/integration-sdk-js/issues/12)) ([aa34429](https://github.com/GladysAssistant/integration-sdk-js/commit/aa34429c4900e80de31a909d159fe05f10e12656))
* degraded transport state and dynamic select source "devices" (spec update) ([#11](https://github.com/GladysAssistant/integration-sdk-js/issues/11)) ([f35e4f3](https://github.com/GladysAssistant/integration-sdk-js/commit/f35e4f36b5ca2118751d4e81bff3f7982e09dc2d))

## [0.6.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.5.0...v0.6.0) (2026-07-20)

### Features

* communication integrations support (spec B.15) ([#9](https://github.com/GladysAssistant/integration-sdk-js/issues/9)) ([848634d](https://github.com/GladysAssistant/integration-sdk-js/commit/848634d8a64413fb46016f75476dbd24c03b1138))

## [0.5.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.4.0...v0.5.0) (2026-07-20)

### Features

* camera image support and per-device cloud/local transport badge (spec update) ([#7](https://github.com/GladysAssistant/integration-sdk-js/issues/7)) ([7c724dd](https://github.com/GladysAssistant/integration-sdk-js/commit/7c724dd19db168853e348a725eaefe4e7c459bea))

## [0.4.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.3.0...v0.4.0) (2026-07-20)

### Features

* add OAuth2 relay, connection status and sub-container lifecycle (spec C.8 update) ([#5](https://github.com/GladysAssistant/integration-sdk-js/issues/5)) ([bc1c085](https://github.com/GladysAssistant/integration-sdk-js/commit/bc1c085b6170c7a712786b114448cfb199154174))

## [0.3.0](https://github.com/GladysAssistant/integration-sdk-js/compare/v0.2.0...v0.3.0) (2026-07-17)

### Features

* log connection lifecycle by default to diagnose connectivity issues ([#4](https://github.com/GladysAssistant/integration-sdk-js/issues/4)) ([481710b](https://github.com/GladysAssistant/integration-sdk-js/commit/481710bf1fc6c729bb0aa1e271620a4795ac8b09))

## [0.2.0](https://github.com/GladysAssistant/integration-sdk-js/compare/5acc3a363f7600454b98dbc4a91bc6568f68c6bb...v0.2.0) (2026-07-16)

### Features

* add standard logger, device constants, externalIds() and handleShutdown() ([#3](https://github.com/GladysAssistant/integration-sdk-js/issues/3)) ([3fe1eb1](https://github.com/GladysAssistant/integration-sdk-js/commit/3fe1eb1f935995f3ead3c189e87a12472920ad73))
* add standard logger, device constants, externalIds() and handleShutdown() ([#3](https://github.com/GladysAssistant/integration-sdk-js/issues/3)) ([836c75a](https://github.com/GladysAssistant/integration-sdk-js/commit/836c75a5da34bb9cda56837b45937bb9dd8189f1))

### Documentation

* use a realistic unique external_id in the README example ([#2](https://github.com/GladysAssistant/integration-sdk-js/issues/2)) ([5acc3a3](https://github.com/GladysAssistant/integration-sdk-js/commit/5acc3a363f7600454b98dbc4a91bc6568f68c6bb))
