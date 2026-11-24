// Управление webhook Telegram. Токен берётся из окружения, в файле его нет.
//
//   $env:TELEGRAM_BOT_TOKEN = "..."          # PowerShell
//   $env:WORKER_URL = "https://my-bot.<ваш-поддомен>.workers.dev"
//   $env:WEBHOOK_SECRET = "..."              # тот же, что в секретах Worker
//   npm run set-webhook | webhook-info | delete-webhook
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Нет TELEGRAM_BOT_TOKEN в окружении");
  process.exit(1);
}

const command = process.argv[2];
const api = `https://api.telegram.org/bot${token}`;

async function call(method, params) {
  const response = await fetch(`${api}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  return response.json();
}

if (command === "set") {
  const base = process.env.WORKER_URL?.replace(/\/+$/, "");
  if (!base) {
    console.error("Нет WORKER_URL, например https://my-bot.example.workers.dev");
    process.exit(1);
  }
  const result = await call("setWebhook", {
    url: `${base}/webhook`,
    secret_token: process.env.WEBHOOK_SECRET || undefined,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log(result);
} else if (command === "info") {
  console.log(await call("getWebhookInfo"));
} else if (command === "delete") {
  console.log(await call("deleteWebhook", { drop_pending_updates: false }));
} else {
  console.error("Использование: node scripts/webhook.mjs set|info|delete");
  process.exit(1);
}
