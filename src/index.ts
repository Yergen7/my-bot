// Подключаем функцию, которая обрабатывает сообщения от Telegram.
import { handleUpdate } from "./bot";

// Подключаем функцию для работы с Telegram и тип входящего обновления.
import { createTelegram, type Update } from "./telegram";

// Подключаем функцию, которая превращает ошибку в понятный текст.
import { errorMessage } from "./weather-currency";

// Описываем переменные и секреты, доступные внутри Worker.
interface Env {
  // Здесь хранится секретный токен Telegram-бота.
  TELEGRAM_BOT_TOKEN: string;

  // Здесь может храниться секрет для проверки запросов от Telegram.
  WEBHOOK_SECRET?: string;

  // KV-хранилище, в котором бот запоминает город каждого чата.
  CITY_KV: KVNamespace;
}

// Экспортируем основной обработчик Cloudflare Worker.
export default {
  // Эта функция запускается каждый раз, когда Worker получает запрос.
  async fetch(
    // В request находится информация о полученном запросе.
    request: Request,

    // В env находятся секреты и переменные Worker.
    env: Env,

    // ctx позволяет продолжить выполнение кода после отправки ответа.
    ctx: ExecutionContext,
  // Указываем, что функция должна вернуть HTTP-ответ.
  ): Promise<Response> {
    // Получаем адрес запроса и разбираем его на части.
    const url = new URL(request.url);

    // Проверяем, что это POST-запрос именно на адрес /webhook.
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      // Для остальных запросов просто сообщаем, что бот работает.
      return new Response("my-bot работает", { status: 200 });
    }

    // Проверяем секрет, только если WEBHOOK_SECRET был добавлен в настройках.
    if (
      // Узнаём, существует ли секрет в переменных Worker.
      env.WEBHOOK_SECRET &&

      // Сравниваем секрет из заголовка запроса с нашим секретом.
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !==
        // Берём правильный секрет из настроек Worker.
        env.WEBHOOK_SECRET
    ) {
      // Если секреты не совпали, запрещаем доступ.
      return new Response("forbidden", { status: 403 });
    }

    // Проверяем, добавлен ли токен Telegram-бота.
    if (!env.TELEGRAM_BOT_TOKEN) {
      // Записываем информацию об ошибке в журнал Worker.
      console.error("Не задан секрет TELEGRAM_BOT_TOKEN");

      // Возвращаем ошибку сервера из-за неправильной настройки.
      return new Response("misconfigured", { status: 500 });
    }

    // Создаём переменную для входящего обновления от Telegram.
    let update: Update;

    // Начинаем обработку JSON и возможной ошибки.
    try {
      // Читаем тело запроса и считаем его обновлением Telegram.
      update = (await request.json()) as Update;

      // Если JSON прочитать не получилось, выполняется этот блок.
    } catch {
      // Сообщаем, что Telegram прислал неправильный запрос.
      return new Response("bad request", { status: 400 });
    }

    // Создаём объект для отправки запросов в Telegram.
    const tg = createTelegram(env.TELEGRAM_BOT_TOKEN);

    // Просим Cloudflare продолжить обработку после отправки ответа.
    ctx.waitUntil(
      // Передаём обновление в функцию, которая обрабатывает сообщения бота.
      handleUpdate(update, tg, env.CITY_KV).catch((error) => {
        // Выводим понятное описание ошибки в журнал Worker.
        console.error(
          // Добавляем пояснение перед текстом ошибки.
          "Не удалось обработать сообщение:",

          // Преобразуем полученную ошибку в понятный текст.
          errorMessage(error),
        );
      }),
    );

    // Сразу отвечаем Telegram, что запрос успешно принят.
    return new Response("ok");
  },
  // Проверяем, что объект подходит под формат обработчика Cloudflare Worker.
} satisfies ExportedHandler<Env>;