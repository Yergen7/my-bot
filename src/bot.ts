// Логика бота: погода в Алматы и курсы валют, примеры всех вариантов работы с Promise.
// Вместо цикла getUpdates здесь одна функция handleUpdate — её вызывает webhook.
import type { Telegram, Update } from "./telegram";
import { errorMessage, getCurrencyRates, getWeather } from "./weather-currency";

async function weatherText(): Promise<string> {
  const weather = await getWeather();
  return [
    `В Алматы сейчас ${weather.current.temperature_2m} °C`,
    `Ветер: ${weather.current.wind_speed_10m} км/ч`,
    `Время измерения: ${weather.current.time}`,
  ].join("\n");
}

async function ratesText(): Promise<string> {
  const { usd, eur, eurInUsd } = await getCurrencyRates();
  return [
    `Курс на ${usd.date}:`,
    `1 USD = ${usd.rate} KZT`,
    `1 EUR = ${eur.rate} KZT`,
    `1 EUR = ${eurInUsd.toFixed(4)} USD`,
    `1 USD = ${(1 / eurInUsd).toFixed(4)} EUR`,
  ].join("\n");
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Превышено время ${ms} мс`)), ms);
  });
}

// Promise.all: если ошибётся один запрос, весь Promise.all даст ошибку.
async function allText(): Promise<string> {
  const [weather, rates] = await Promise.all([weatherText(), ratesText()]);
  return `Promise.all — оба запроса успешны:\n\n${weather}\n\n${rates}`;
}

// Promise.allSettled сохраняет и успешные результаты, и ошибки.
async function settledText(): Promise<string> {
  const results = await Promise.allSettled([weatherText(), ratesText()]);
  const parts = results.map((result, index) => {
    const name = index === 0 ? "Погода" : "Курсы";
    return result.status === "fulfilled"
      ? `✅ ${name}:\n${result.value}`
      : `❌ ${name}: ${errorMessage(result.reason)}`;
  });
  return `Promise.allSettled — дождались всех:\n\n${parts.join("\n\n")}`;
}

// Promise.race: победит первый завершившийся Promise — успех или ошибка.
async function raceText(): Promise<string> {
  const result = await Promise.race([ratesText(), timeout(3000)]);
  return `Promise.race — данные пришли раньше тайм-аута:\n\n${result}`;
}

// Promise.any: победит первый успешный Promise.
async function anyText(): Promise<string> {
  const result = await Promise.any([
    weatherText().then((text) => `Первой пришла погода:\n${text}`),
    ratesText().then((text) => `Первыми пришли курсы:\n${text}`),
  ]);
  return `Promise.any — первый успешный результат:\n\n${result}`;
}

// then/catch/finally: цепочка Promise без async/await.
function chainText(): Promise<string> {
  console.log("Цепочка Promise началась");
  return getWeather()
    .then((weather) => weather.current.temperature_2m)
    .then((temperature) => `then получил температуру: ${temperature} °C`)
    .catch((error: unknown) => `catch поймал ошибку: ${errorMessage(error)}`)
    .finally(() => console.log("finally выполнился в любом случае"));
}

const HELP_TEXT = [
  "Я показываю погоду и курсы валют.",
  "",
  "/weather — погода",
  "/rates — курсы валют",
  "/all — Promise.all",
  "/settled — Promise.allSettled",
  "/race — Promise.race",
  "/any — Promise.any",
  "/chain — then/catch/finally",
  "",
  "Можно и без команд написать: «погода», «курс доллара», «всё сразу» или нажать кнопку.",
].join("\n");

async function resultForAction(action: string): Promise<string> {
  switch (action) {
    case "weather": return await weatherText();
    case "rates": return await ratesText();
    case "all": return await allText();
    case "settled": return await settledText();
    case "race": return await raceText();
    case "any": return await anyText();
    case "chain": return await chainText();
    default: return HELP_TEXT;
  }
}

function actionFromText(originalText: string): string | undefined {
  const text = originalText.trim().toLowerCase();
  const firstWord = (text.split(/\s/)[0] ?? "").split("@")[0] ?? "";
  const commands: Record<string, string> = {
    "/weather": "weather",
    "/rates": "rates",
    "/all": "all",
    "/settled": "settled",
    "/race": "race",
    "/any": "any",
    "/chain": "chain",
  };

  if (commands[firstWord]) return commands[firstWord];
  if (text.includes("погод")) return "weather";
  if (text.includes("курс") || text.includes("доллар") || text.includes("евро")) {
    return "rates";
  }
  if (text.includes("всё") || text.includes("все сразу")) return "settled";
  return undefined;
}

async function safelySendResult(
  tg: Telegram,
  chatId: number,
  action: string,
): Promise<void> {
  try {
    const text = await resultForAction(action);
    await tg.sendMessage(chatId, text, true);
  } catch (error) {
    await tg.sendMessage(
      chatId,
      `Не удалось получить данные: ${errorMessage(error)}`,
      true,
    );
  }
}

export async function handleUpdate(update: Update, tg: Telegram): Promise<void> {
  // Команды и обычные фразы приходят как message.
  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const firstWord = (text.trim().split(/\s/)[0] ?? "").split("@")[0] ?? "";

    if (firstWord === "/start" || firstWord === "/help") {
      await tg.sendMessage(chatId, HELP_TEXT, true);
      return;
    }

    const action = actionFromText(text);
    if (action) {
      await safelySendResult(tg, chatId, action);
    } else {
      await tg.sendMessage(
        chatId,
        "Попробуйте написать «Какая погода?», «Покажи курс доллара» или нажмите кнопку.",
        true,
      );
    }
    return;
  }

  // Нажатие inline-кнопки приходит как callback_query.
  const callback = update.callback_query;
  if (callback?.message && callback.data) {
    await tg.answerButton(callback.id);
    await safelySendResult(tg, callback.message.chat.id, callback.data);
  }
}
