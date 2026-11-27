// Настройки чата в KV: ключ — id чата, значение — JSON по интерфейсу ChatSettings.

export interface ChatSettings {
  city: string;
}

// TypeScript проверяет типы только при написании кода, а в KV может лежать что угодно.
// Поэтому проверяем сами: это объект, и в нём есть непустая строка city.
function isChatSettings(value: unknown): value is ChatSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "city" in value &&
    typeof value.city === "string" &&
    value.city.trim() !== ""
  );
}

// Превращает текст в объект. Если это не JSON, возвращает undefined вместо ошибки.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Возвращает null, если настроек нет или они испорчены.
// Ошибки самого KV не перехватываем: «хранилище недоступно» — это не «город не задан».
export async function loadSettings(
  kv: KVNamespace,
  chatId: number,
): Promise<ChatSettings | null> {
  const text = await kv.get(String(chatId));
  if (text === null) return null;

  const value = parseJson(text);
  if (!isChatSettings(value)) {
    console.warn(`Неверные настройки в KV для чата ${chatId}`);
    return null;
  }
  return value;
}

export async function saveSettings(
  kv: KVNamespace,
  chatId: number,
  settings: ChatSettings,
): Promise<void> {
  await kv.put(String(chatId), JSON.stringify(settings));
}
