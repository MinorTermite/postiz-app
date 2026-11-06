# GravMix — все каналы и их настройка

В приложении 39 площадок. Ключи площадок с OAuth вписываются в `.env` на сервере (после правки `docker compose up -d`),
ключи остальных каждый пользователь вводит сам в форме «Добавить канал».

**Redirect URI любого OAuth-приложения:** `https://<DOMAIN>/integrations/social/<идентификатор>`
(пример: `https://gravmix.ru/integrations/social/youtube`). Для Google, VK, TikTok и других нужен именно https.

`HIDDEN_PROVIDERS` убирает площадку из списка «Добавить канал». В продакшне по умолчанию скрыты
Facebook, Instagram, Threads (Meta признана в РФ экстремистской) и X (заблокирован в РФ).

## Россия

| Площадка | Идентификатор | Ключи в `.env` | Где получить |
|---|---|---|---|
| ВКонтакте (личная стена) | `vk` | `VK_ID` | https://id.vk.com/about/business/go → «Создать приложение» → Web. Доверенные redirect URL: `.../vk` и `.../vk-group`, базовый домен = `DOMAIN` |
| ВКонтакте (сообщество) | `vk-group` | `VK_ID` (то же приложение) | |
| Telegram | `telegram` | `TELEGRAM_TOKEN`, `TELEGRAM_BOT_NAME` | @BotFather → `/newbot`. `/setdomain` → `DOMAIN` (для входа через Telegram). Бот — администратор канала |
| MAX | `max` | — | форма в приложении: токен бота MAX (business.max.ru → чат-боты) |
| Одноклассники | `ok` | — | форма: ключи приложения ok.ru/dk (application id, public/secret key, access token группы) |
| Rutube | `rutube` | — | форма: логин/токен Rutube Studio. Видео Rutube забирает по публичной ссылке, поэтому нужен домен |

## Google

| Площадка | Идентификатор | Ключи | Где получить |
|---|---|---|---|
| YouTube + «Войти через Google» | `youtube` | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | console.cloud.google.com → проект → включить YouTube Data API v3 → OAuth consent screen (External, для всех пользователей — «Publish app» и проверка Google) → Credentials → OAuth client ID → Web application. Redirect: `.../youtube`. Authorized JavaScript origins: `https://<DOMAIN>` |
| Google Business Profile | `gmb` | `GOOGLE_GMB_CLIENT_ID`, `GOOGLE_GMB_CLIENT_SECRET` (если пусто — берутся ключи YouTube) | тот же проект: включить Business Profile APIs (доступ выдаётся по заявке). Redirect: `.../gmb` |

## Видео и изображения

| Площадка | Идентификатор | Ключи | Где получить |
|---|---|---|---|
| TikTok | `tiktok` | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` | developers.tiktok.com → приложение → Login Kit + Content Posting API. Redirect: `.../tiktok`. До аудита TikTok посты только приватные |
| TikTok for Business | `tiktok-business` | `TIKTOK_BUSINESS_CLIENT_ID`, `TIKTOK_BUSINESS_CLIENT_SECRET` | business-api.tiktok.com → приложение. Redirect: `.../tiktok-business` |
| Pinterest | `pinterest` | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | developers.pinterest.com → Apps. Redirect: `.../pinterest`. Standard access по заявке |
| Dribbble | `dribbble` | `DRIBBBLE_CLIENT_ID`, `DRIBBBLE_CLIENT_SECRET` | dribbble.com/account/applications. Redirect: `.../dribbble` |
| Twitch | `twitch` | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | dev.twitch.tv/console/apps. Redirect: `.../twitch` |
| Kick | `kick` | `KICK_CLIENT_ID`, `KICK_SECRET` | kick.com → Settings → Developer. Redirect: `.../kick` |

## Деловые сети и сообщества

| Площадка | Идентификатор | Ключи | Где получить |
|---|---|---|---|
| LinkedIn (профиль) | `linkedin` | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | linkedin.com/developers → приложение (нужна страница компании) → продукты Share on LinkedIn, Sign In with LinkedIn (OpenID). Redirect: `.../linkedin` и `.../linkedin-page`. В РФ LinkedIn заблокирован — работает, если сервер вне РФ |
| LinkedIn (страница) | `linkedin-page` | те же | продукт Community Management API (по заявке) |
| Reddit | `reddit` | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | reddit.com/prefs/apps → web app. Redirect: `.../reddit` |
| Discord | `discord` | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN_ID` | discord.com/developers → Application → OAuth2 (redirect `.../discord`) + Bot (токен) |
| Slack | `slack` | `SLACK_ID`, `SLACK_SECRET` | api.slack.com/apps → OAuth & Permissions. Redirect: `.../slack` |
| Tumblr | `tumblr` | `TUMBLR_CLIENT_ID`, `TUMBLR_CLIENT_SECRET` | tumblr.com/oauth/apps. Redirect: `.../tumblr` |
| Whop | `whop` | `WHOP_CLIENT_ID` | whop.com/dashboard/developer |
| MeWe | `mewe` | `MEWE_APP_ID`, `MEWE_API_KEY`, `MEWE_HOST` | по заявке MeWe |
| Skool | `skool` | — | вход в аккаунт Skool в форме |

## Федеративные и децентрализованные

| Площадка | Идентификатор | Ключи | Где получить |
|---|---|---|---|
| Mastodon | `mastodon` | `MASTODON_URL`, `MASTODON_CLIENT_ID`, `MASTODON_CLIENT_SECRET` | <instance>/settings/applications, scopes read write. Redirect: `.../mastodon` |
| Bluesky | `bluesky` | — | форма: handle + App Password (bsky.app → Settings → App passwords) |
| Farcaster | `wrapcast` | `NEYNAR_CLIENT_ID`, `NEYNAR_SECRET_KEY`, `NEYNAR_APP_FID`, `NEYNAR_APP_MNEMONIC` | dev.neynar.com |
| Nostr | `nostr` | — | форма: приватный ключ nsec |
| Lemmy | `lemmy` | — | форма: инстанс, логин, пароль |

## Блоги и рассылки

| Площадка | Идентификатор | Ключи | Где получить |
|---|---|---|---|
| WordPress | `wordpress` | — | форма: адрес сайта, логин, Application Password (Пользователи → Профиль) |
| Medium | `medium` | — | форма: integration token |
| Dev.to | `devto` | — | форма: API key (dev.to/settings/extensions) |
| Hashnode | `hashnode` | — | форма: Personal Access Token |
| Listmonk | `listmonk` | — | форма: адрес Listmonk, логин API, токен |
| Moltbook | `moltbook` | — | форма в приложении |

## Скрыты в РФ (`HIDDEN_PROVIDERS`)

| Площадка | Идентификатор | Ключи |
|---|---|---|
| Facebook Page | `facebook` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| Instagram (через Facebook) | `instagram` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| Instagram (отдельный) | `instagram-standalone` | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` |
| Threads | `threads` | `THREADS_APP_ID`, `THREADS_APP_SECRET` |
| X | `x` | `X_API_KEY`, `X_API_SECRET` |

Чтобы вернуть площадку, убрать её идентификатор из `HIDDEN_PROVIDERS`.

## Проверка

1. `docker compose up -d` после правки `.env`.
2. «Добавить канал» → площадка → вход в аккаунт площадки → канал появляется в списке.
3. Тестовый пост «Опубликовать сейчас». Ошибки: `docker compose logs postiz | grep -i <площадка>`.
