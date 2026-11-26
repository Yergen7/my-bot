# my-bot

Telegram-бот на **Cloudflare Worker**, работающий через **webhook**: Telegram сам присылает сообщения на адрес Worker (`POST /webhook`), вместо того чтобы бот постоянно опрашивал сервер (`getUpdates`).

Бот показывает погоду в Алматы ([Open-Meteo](https://open-meteo.com/)) и курсы USD/EUR к тенге ([Frankfurter](https://frankfurter.dev/)), а заодно демонстрирует все основные способы работы с `Promise`: `async/await`, `Promise.all`, `allSettled`, `race`, `any` и `then/catch/finally`.

Это перенос бота из учебного проекта `newlesson` (`src/bot.ts`, long polling) на Worker.

## Как это работает

```
Telegram ──POST /webhook──▶ Cloudflare Worker (src/index.ts)
                                │  проверяет заголовок X-Telegram-Bot-Api-Secret-Token
                                │  сразу отвечает 200 OK
                                └─ в фоне: handleUpdate (src/bot.ts) ──▶ Telegram Bot API (sendMessage)
```

| Файл | Назначение |
| --- | --- |
| `src/index.ts` | Точка входа Worker: проверка секрета, разбор Update, ответ Telegram `200 OK` |
| `src/bot.ts` | Логика бота: команды, кнопки, примеры с Promise |
| `src/telegram.ts` | Обёртка над Telegram Bot API и inline-меню |
| `src/weather-currency.ts` | Запросы к API погоды и курсов валют |
| `scripts/webhook.mjs` | Установка, просмотр и удаление webhook |
| `wrangler.jsonc` | Конфигурация Worker (имя `my-bot`) |

## Команды бота

`/start`, `/help` — справка · `/weather` — погода · `/rates` — курсы · `/all` · `/settled` · `/race` · `/any` · `/chain` — примеры с Promise.
Можно писать и обычными словами («погода», «курс доллара», «всё сразу») или нажимать кнопки.

## Секреты

Токен бота **не хранится в коде**. Он задаётся секретом Worker:

| Имя | Обязательный | Что это |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | да | токен от [@BotFather](https://t.me/BotFather) |
| `WEBHOOK_SECRET` | нет, но рекомендуется | случайная строка; Telegram присылает её в заголовке, Worker отклоняет (403) запросы без неё |

Добавить: [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → my-bot → Settings → Variables and Secrets → Add** (тип **Secret**), затем **Deploy**.
Или из консоли: `npx wrangler secret put TELEGRAM_BOT_TOKEN`.

## Развёртывание

```powershell
npm install
npm run typecheck
npx wrangler login      # один раз
npm run deploy
```

## Подключение webhook

Токен и секрет передаются через переменные окружения (в файлах их нет):

```powershell
$env:TELEGRAM_BOT_TOKEN = "<токен>"
$env:WORKER_URL = "https://my-bot.<ваш-поддомен>.workers.dev"
$env:WEBHOOK_SECRET = "<тот же секрет, что в Worker>"   # если используется
npm run set-webhook
npm run webhook-info      # проверить: url, pending_update_count, last_error_message
```

Отключить webhook (например, чтобы вернуться к polling): `npm run delete-webhook`.
Webhook и `getUpdates` одновременно работать не могут.

## Локальная проверка

Создайте файл `.dev.vars` (он в `.gitignore`) с тестовыми значениями и запустите `npm run dev`:

```
TELEGRAM_BOT_TOKEN=000:test
WEBHOOK_SECRET=local-test
```

```powershell
curl -X POST http://127.0.0.1:8787/webhook -H "X-Telegram-Bot-Api-Secret-Token: local-test" -H "Content-Type: application/json" -d '{"update_id":1,"message":{"chat":{"id":1},"text":"/help"}}'
```

Без заголовка с секретом Worker вернёт `403`, с битым JSON — `400`.
