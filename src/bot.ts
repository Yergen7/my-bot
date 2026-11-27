// Логика бота: погода в выбранном городе и курсы валют, примеры всех вариантов работы с Promise.
// Вместо цикла getUpdates здесь одна функция handleUpdate — её вызывает webhook.
import { loadSettings, saveSettings } from "./settings";
import type { Telegram, Update } from "./telegram";
import {
  type City,
  errorMessage,
  findCity,
  getCurrencyRates,
  getWeather,
} from "./weather-currency";

const CITY_PROMPT = "Напиши /city и свой город";

// Отдельный класс ошибки: «город не задан» — это не сбой, а подсказка пользователю.
class CityNotSetError extends Error {
  constructor() {
    super(CITY_PROMPT);
  }
}

// Функция, которая достаёт город текущего чата. KV читается, только когда нужна погода.
type CityProvider = () => Promise<City>;

function cityOfChat(kv: KVNamespace, chatId: number): CityProvider {
  return async () => {
    const settings = await loadSettings(kv, chatId);
    if (!settings) throw new CityNotSetError();

    const city = await findCity(settings.city);
    if (!city) throw new Error(`Город «${settings.city}» не найден`);
    return city;
  };
}

function cityTitle(city: City): string {
  return city.country ? `${city.name}, ${city.country}` : city.name;
}

async function weatherText(getCity: CityProvider): Promise<string> {
  const city = await getCity();
  const weather = await getWeather(city);
  return [
    `${cityTitle(city)}: сейчас ${weather.current.temperature_2m} °C`,
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
async function allText(getCity: CityProvider): Promise<string> {
  const [weather, rates] = await Promise.all([weatherText(getCity), ratesText()]);
  return `Promise.all — оба запроса успешны:\n\n${weather}\n\n${rates}`;
}

// Promise.allSettled сохраняет и успешные результаты, и ошибки.
async function settledText(getCity: CityProvider): Promise<string> {
  const results = await Promise.allSettled([weatherText(getCity), ratesText()]);
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
async function anyText(getCity: CityProvider): Promise<string> {
  const result = await Promise.any([
    weatherText(getCity).then((text) => `Первой пришла погода:\n${text}`),
    ratesText().then((text) => `Первыми пришли курсы:\n${text}`),
  ]);
  return `Promise.any — первый успешный результат:\n\n${result}`;
}

// then/catch/finally: цепочка Promise без async/await.
function chainText(getCity: CityProvider): Promise<string> {
  console.log("Цепочка Promise началась");
  return getCity()
    .then((city) => getWeather(city))
    .then((weather) => weather.current.temperature_2m)
    .then((temperature) => `then получил температуру: ${temperature} °C`)
    .catch((error: unknown) => {
      // Подсказку про /city пробрасываем дальше, чтобы бот ответил именно ею.
      if (error instanceof CityNotSetError) throw error;
      return `catch поймал ошибку: ${errorMessage(error)}`;
    })
    .finally(() => console.log("finally выполнился в любом случае"));
}

const HELP_TEXT = [
  "Я показываю погоду и курсы валют.",
  "",
  "/city Астана — запомнить ваш город",
  "/weather — погода в вашем городе",
  "/rates — курсы валют",
  "/all — Promise.all",
  "/settled — Promise.allSettled",
  "/race — Promise.race",
  "/any — Promise.any",
  "/chain — then/catch/finally",
  "",
  "Можно и без команд написать: «погода», «курс доллара», «всё сразу» или нажать кнопку.",
].join("\n");

async function resultForAction(
  action: string,
  getCity: CityProvider,
): Promise<string> {
  switch (action) {
    case "weather": return await weatherText(getCity);
    case "rates": return await ratesText();
    case "all": return await allText(getCity);
    case "settled": return await settledText(getCity);
    case "race": return await raceText();
    case "any": return await anyText(getCity);
    case "chain": return await chainText(getCity);
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
  kv: KVNamespace,
  chatId: number,
  action: string,
): Promise<void> {
  try {
    const text = await resultForAction(action, cityOfChat(kv, chatId));
    await tg.sendMessage(chatId, text, true);
  } catch (error) {
    const text =
      error instanceof CityNotSetError
        ? error.message
        : `Не удалось получить данные: ${errorMessage(error)}`;
    await tg.sendMessage(chatId, text, true);
  }
}

// /city Астана — проверяем, что город существует, и сохраняем его в KV.
async function cityCommandText(
  kv: KVNamespace,
  chatId: number,
  name: string,
): Promise<string> {
  if (!name) return CITY_PROMPT;

  try {
    const city = await findCity(name);
    if (!city) {
      return `Не нашёл город «${name}». Проверьте название и напишите /city ещё раз.`;
    }
    // Сохраняем название так, как его написал пользователь:
    // при следующем поиске найдётся тот же самый город.
    await saveSettings(kv, chatId, { city: name });
    return `Запомнил город: ${cityTitle(city)}`;
  } catch (error) {
    return `Не удалось сохранить город: ${errorMessage(error)}`;
  }
}

export async function handleUpdate(
  update: Update,
  tg: Telegram,
  kv: KVNamespace,
): Promise<void> {
  // Команды и обычные фразы приходят как message.
  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const firstWord = (text.trim().split(/\s/)[0] ?? "").split("@")[0] ?? "";

    if (firstWord === "/start" || firstWord === "/help") {
      await tg.sendMessage(chatId, HELP_TEXT, true);
      return;
    }

    if (firstWord.toLowerCase() === "/city") {
      // Всё после первого слова — название города (может состоять из нескольких слов).
      const name = text.trim().replace(/^\S+/, "").trim();
      const reply = await cityCommandText(kv, chatId, name);
      await tg.sendMessage(chatId, reply, true);
      return;
    }

    const action = actionFromText(text);
    if (action) {
      await safelySendResult(tg, kv, chatId, action);
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
    await safelySendResult(tg, kv, callback.message.chat.id, callback.data);
  }
}
