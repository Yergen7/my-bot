// Cloudflare Worker: Telegram сам присылает обновления сюда (POST /webhook).
import { handleUpdate } from "./bot";
import { createTelegram, type Update } from "./telegram";
import { errorMessage } from "./weather-currency";

interface Env {
  // Секреты: добавляются в dash.cloudflare.com (Workers → my-bot → Settings → Variables and Secrets)
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET?: string; // тот же, что передан в setWebhook как secret_token
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("my-bot работает", { status: 200 });
    }

    // Telegram добавляет этот заголовок к каждому запросу, если при setWebhook задан secret_token.
    // Так мы отсекаем чужие POST-запросы на адрес Worker.
    if (
      env.WEBHOOK_SECRET &&
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET
    ) {
      return new Response("forbidden", { status: 403 });
    }

    if (!env.TELEGRAM_BOT_TOKEN) {
      console.error("Не задан секрет TELEGRAM_BOT_TOKEN");
      return new Response("misconfigured", { status: 500 });
    }

    let update: Update;
    try {
      update = (await request.json()) as Update;
    } catch {
      return new Response("bad request", { status: 400 });
    }

    // Сразу отвечаем Telegram «200 OK», а обработку (запросы к API, отправка ответа)
    // продолжаем в фоне: так Telegram не будет повторно слать то же сообщение.
    const tg = createTelegram(env.TELEGRAM_BOT_TOKEN);
    ctx.waitUntil(
      handleUpdate(update, tg).catch((error) => {
        console.error("Не удалось обработать сообщение:", errorMessage(error));
      }),
    );

    return new Response("ok");
  },
} satisfies ExportedHandler<Env>;
