# GravMix — продакшн на VPS

Стек: Caddy (HTTPS Let's Encrypt) → GravMix (Postiz RU) → PostgreSQL 17, Redis 7, Temporal.
Наружу открыты только 80/443. Подписки оплачиваются через ЮKassa в рублях.

## 1. Что купить

| Что | Минимум | Комментарий |
|---|---|---|
| VPS в РФ | 4 vCPU, 8 ГБ ОЗУ, 80 ГБ NVMe, Ubuntu 24.04 | Timeweb Cloud, Selectel, REG.RU, Yandex Cloud. Хранение ПД граждан РФ в РФ — требование 152-ФЗ |
| Домен | `.ru` / `.рф` | REG.RU, RU-CENTER |
| ЮKassa | магазин на ИП/ООО/самозанятого | yookassa.ru → подключение, договор |
| Почта для писем | Яндекс 360 для бизнеса / Mail.ru для бизнеса | SMTP для подтверждения регистрации и сброса пароля |

## 2. DNS

У регистратора домена две записи A на IP сервера:

```
@    A    <IP сервера>
www  A    <IP сервера>
```

Дождаться, пока `nslookup <домен>` вернёт IP сервера (от минут до суток).

## 3. Установка

На своём компьютере (образ собран заранее, `postiz-ru-image.tar.gz` есть в релизе GitHub):

```bash
scp -r deploy/production root@<IP>:/opt/gravmix
scp postiz-ru-image.tar.gz root@<IP>:/opt/gravmix/
```

На сервере:

```bash
cd /opt/gravmix && chmod +x *.sh && ./install.sh <домен> <email-для-сертификата>
```

Скрипт ставит Docker, открывает в ufw порты 22/80/443, делает swap 4 ГБ, создаёт `.env` со случайными
`JWT_SECRET` и `POSTGRES_PASSWORD`, загружает образ (из tar, иначе `docker pull`, иначе сборка из исходников),
запускает стек и ставит ежедневный бэкап на 03:30.

Первый запуск — 3–5 минут. Проверка: `docker compose ps` (все `healthy`), затем `https://<домен>`.
Первый зарегистрированный пользователь — владелец. Регистрация открыта (`DISABLE_REGISTRATION=false`).

## 4. Настройка `.env`

Файл `/opt/gravmix/.env`, шаблон с комментариями — `.env.production.example`. После любой правки:

```bash
cd /opt/gravmix && docker compose up -d
```

### Почта (обязательно для открытой регистрации)

Без почтового провайдера аккаунты активируются без подтверждения адреса. Для Яндекса:
`EMAIL_PROVIDER=nodemailer` (включать только после заполнения логина и пароля), `EMAIL_HOST=smtp.yandex.ru`, `EMAIL_PORT=465`, `EMAIL_SECURE=true`,
`EMAIL_USER`, `EMAIL_PASS` (пароль приложения из id.yandex.ru → Безопасность), `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.

### ЮKassa

1. Личный кабинет ЮKassa → Интеграция → Ключи API: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`.
2. Интеграция → HTTP-уведомления: URL `https://<домен>/api/payment/yookassa`, события `payment.succeeded` и `payment.canceled`.
3. Автоплатежи (`YOOKASSA_AUTOPAY=true`) — только после того, как менеджер ЮKassa включит сохранение карт в магазине.
   Без автоплатежей каждый период оплачивается вручную, по окончании подписка снимается.
4. Чеки 54-ФЗ: если подключена онлайн-касса или «Чеки от ЮKassa» — `YOOKASSA_RECEIPT=true`, `YOOKASSA_VAT_CODE`
   (1 — без НДС, по таблице кодов ЮKassa).

Как только заданы `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`, в приложении появляются страница «Тарифы» и лимиты тарифов.
Без ключей все организации получают максимальный тариф бесплатно.

Тарифы (₽ в месяц / в год): Standard 990 / 9 490, Team 1 990 / 19 090, Pro 2 990 / 28 690, Ultimate 5 990 / 57 490.
Цены — в `libraries/nestjs-libraries/src/database/prisma/subscriptions/pricing.ts`, меняются пересборкой образа.

Проверка оплаты: тестовый магазин ЮKassa (отдельные shop id и ключ) + тестовая карта `5555 5555 5555 4477`,
затем — реальные ключи.

### Каналы

Ключи всех 39 площадок, redirect URI и где их получать — `CHANNELS.md`.
Facebook, Instagram, Threads и X скрыты через `HIDDEN_PROVIDERS`.

### Хранилище файлов

По умолчанию файлы лежат в томе `postiz-uploads` на сервере. Для S3-совместимого хранилища
(Yandex Object Storage, Selectel S3) — `STORAGE_PROVIDER=cloudflare` и переменные `CLOUDFLARE_*` в `.env`.

## 5. Юридические страницы

`legal/offer.html` (публичная оферта) и `legal/privacy.html` (политика ПД по 152-ФЗ) открываются по
`https://<домен>/legal/offer.html` и `https://<домен>/legal/privacy.html`. Перед запуском продаж заменить все
поля `[в квадратных скобках]` реквизитами и подать уведомление об обработке ПД в Роскомнадзор (pd.rkn.gov.ru).
ЮKassa требует ссылку на оферту и контакты на сайте при подключении магазина.

## 6. Бэкапы и восстановление

- `./backup.sh` — дамп всех баз (gzip), архив загруженных файлов, копия `.env` в `backups/<дата>`; хранится 14 дней
  (`KEEP_DAYS`). Cron: каждый день в 03:30, лог `backups/cron.log`.
- Копировать `backups/` за пределы сервера (S3, другой VPS, домашний ПК): `rsync -a root@<IP>:/opt/gravmix/backups/ ./gravmix-backups/`.
- Восстановление: `./restore.sh backups/<дата>` (запросит `YES`, затирает текущие базы).

## 7. Обновление

```bash
cd /opt/gravmix && ./update.sh          # новый tar рядом или docker pull
cd /opt/gravmix && ./update.sh build    # сборка из исходников на сервере (нужно 8 ГБ ОЗУ + swap)
```

Перед обновлением делается бэкап. Схема базы обновляется автоматически при старте (`prisma db push`).

## 8. Безопасность

- Вход на сервер только по SSH-ключу: `PasswordAuthentication no` в `/etc/ssh/sshd_config`.
- `.env` содержит секреты — не коммитить (он в `.gitignore`), права `chmod 600 .env`.
- Порты БД, Redis и Temporal наружу не открыты.
- Обновления Ubuntu: `apt install unattended-upgrades`.
- Мониторинг доступности: внешний пинг `https://<домен>` (UptimeRobot, Яндекс Мониторинг). Ошибки — `SENTRY_*` в `.env`.

## 9. Известные ограничения

- Смена тарифа начинает новый полный период по цене нового тарифа, без пересчёта остатка.
- Список счетов в приложении пуст: чеки и история платежей — в кабинете ЮKassa и письмах 54-ФЗ.
- Если включить Stripe вместо ЮKassa, цены из `pricing.ts` уйдут в Stripe как доллары — для Stripe нужны отдельные цены.
- Публичный вход через Google (YouTube) требует проверки приложения Google; до неё — только тестовые пользователи (до 100).
- VK ID работает только с https-доменом.

## 10. Лицензия

Код основан на Postiz (AGPL-3.0). Коммерческий SaaS разрешён при условии, что исходный код всех доработок открыт
пользователям сервиса: репозиторий https://github.com/MinorTermite/postiz-app (ссылка есть в оферте, п. 8.3).
