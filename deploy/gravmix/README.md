# Postiz RU для GravMix и проекта «Слава»

Форк: https://github.com/MinorTermite/postiz-app, рабочая ветка `gravmix`, upstream — `gitroomhq/postiz-app`.
Лицензия AGPL-3.0: при доработке кода и открытии сервиса другим людям исходники изменений должны быть доступны.

## Состав (облегчённый стек, 4 контейнера)

| Сервис | Назначение | Доступ |
|---|---|---|
| postiz (образ `postiz-ru:latest` из этого форка) | веб-интерфейс + API + воркеры | http://localhost:4007 |
| postiz-postgres | данные Postiz и Temporal (базы `postiz`, `temporal`, `temporal_visibility`) | только внутри Docker |
| postiz-redis | кэш и очереди | только внутри Docker |
| temporal | очередь отложенных публикаций | только внутри Docker |
| temporal-ui (профиль `debug`) | отладка очереди | http://localhost:8088 |

Elasticsearch и отдельный Postgres для Temporal убраны: Temporal хранит visibility в общем Postgres.
Порты привязаны к 127.0.0.1. Данные в Docker-томах `postiz-gravmix_*`.

## Сборка образа и запуск

```powershell
cd C:\GravMix\postiz-app
docker build -f Dockerfile.dev --build-arg NEXT_PUBLIC_VERSION=v2.25.3-ru -t postiz-ru:latest .
cd deploy\gravmix
powershell -ExecutionPolicy Bypass -File setup.ps1   # первый запуск: .env + секреты + старт
docker compose up -d                                 # старт
docker compose --profile debug up -d temporal-ui     # Temporal UI при необходимости
docker compose stop                                  # стоп без потери данных
docker compose logs -f postiz                        # логи
```

Синхронизация форка с upstream: `git fetch upstream; git merge upstream/main` в ветке `gravmix`, затем пересборка образа.

## Установщик для Windows

`installer/windows/build.ps1` собирает папку `installer/windows/dist/PostizRU-Setup`:
`Setup.exe` + `payload\` (compose, шаблон .env, конфиг Temporal, трей-программа `PostizRU.exe`,
образ `postiz-ru-image.tar.gz`). Компилируется штатным `csc.exe` из .NET Framework, сторонние сборщики не нужны.

Setup.exe ставит программу в `%LOCALAPPDATA%\PostizRU` без прав администратора: проверяет Docker Desktop
(при отсутствии предлагает установить через winget или с docker.com), генерирует `.env` с паролями,
выбирает свободный порт с 4007, загружает образ, поднимает стек, создаёт ярлыки, автозапуск
и запись в «Приложения». `Setup.exe --uninstall` удаляет программу; данные можно оставить.
Проект Docker установленной копии — `postiz-ru`, он не пересекается с `deploy/gravmix`.

## Первый вход

1. Открыть http://localhost:4007, зарегистрировать аккаунт владельца.
2. В `.env` поставить `DISABLE_REGISTRATION=true`, выполнить `docker compose up -d`.

## Подключение каналов

Ключи OAuth-площадок — в `.env`, после правки `docker compose up -d`. Каналы с токенами (MAX, OK, Rutube)
настраиваются в интерфейсе: «Добавить канал» → площадка → форма с полями.

| Канал | Что нужно | Работает с localhost |
|---|---|---|
| Telegram (@gravmixtt и каналы «Слава») | бот от @BotFather → `TELEGRAM_TOKEN`, `TELEGRAM_BOT_NAME`; бот — админ канала | да |
| YouTube (@gorodaskvozveka и др.) | OAuth-клиент Google Cloud, YouTube Data API v3 | да, redirect `http://localhost:4007/integrations/social/youtube` |
| VK (личная стена) | приложение VK ID → `VK_ID`, redirect `<FRONTEND_URL>/integrations/social/vk` | да, через redirectmeto.com |
| VK Community (стена сообщества) | то же приложение VK ID, второй redirect `<FRONTEND_URL>/integrations/social/vk-group`; после входа выбрать сообщество, где вы админ/редактор | да, через redirectmeto.com |
| MAX (каналы) | бот на business.max.ru → токен; бот — администратор канала; chat_id можно не указывать — возьмётся первый канал бота | да |
| Одноклассники (группы) | OK-приложение: Application key, Secret key, вечный access_token, id группы; права GROUP_CONTENT, PHOTO_CONTENT, VIDEO_CONTENT выдаёт api-support@ok.ru | да |
| Rutube | логин и пароль канала, категория | вход — да; публикация — только с публичным `FRONTEND_URL` или S3: Rutube скачивает видео по ссылке |
| Дзен | API публикации у Дзена нет. Подключите в Дзене импорт из Telegram-канала (бот Дзена) и публикуйте в этот Telegram-канал через Postiz | через Telegram |
| Instagram / Threads / Facebook | приложение Meta | нужен публичный HTTPS-адрес |
| TikTok, Pinterest | приложения разработчика | нужен публичный HTTPS-адрес |

Ограничения площадок, которые кодом не обходятся:

- **VK Клипы** — публичного API публикации клипов нет (`shortVideo.*` закрыт). Вертикальное видео уходит
  в сообщество как обычное видео во вложении поста.
- **VK видео и фото** — методы `video.save`/`photos.*` для новых приложений VK ID выдаются по заявке
  в devsupport@corp.vk.com. Без них проходят только текстовые посты.
- **Одноклассники** — создание новых приложений в интерфейсе OK закрыто, работают существующие приложения
  и выданные поддержкой права.
- **MAX** — API подписан корневым сертификатом Минцифры; сертификат встроен в код и применяется только
  к запросам MAX.

## Публичный доступ (когда понадобится)

Для VK, Meta, TikTok площадки требуют HTTPS-домен для OAuth. Варианты: VPS с доменом и reverse proxy,
либо Cloudflare Tunnel до этого компьютера. После выбора домена:

- `MAIN_URL`, `FRONTEND_URL` = `https://домен`, `NEXT_PUBLIC_BACKEND_URL` = `https://домен/api`;
- строку `NOT_SECURED` удалить целиком (любое значение, включая `false`, отключает защиту cookie);
- `POSTIZ_BIND` оставить `127.0.0.1`, наружу выпускать только через прокси/туннель.

## Публичный API и автоматизация

Postiz → Settings → Public API даёт ключ для `http://localhost:4007/api/public/v1/...` — через него
скрипты GravMix и контент-завод могут ставить посты в расписание без ручного ввода.
