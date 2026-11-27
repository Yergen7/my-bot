// Настройки чата в KV: ключ — id чата, значение — JSON по интерфейсу ChatSettings.

export interface ChatSettings {
  city: string;
}

export async function loadSettings(
  kv: KVNamespace,
  chatId: number,
): Promise<ChatSettings | null> {
  // "json" — KV сам превратит сохранённую строку обратно в объект.
  return kv.get<ChatSettings>(String(chatId), "json");
}

export async function saveSettings(
  kv: KVNamespace,
  chatId: number,
  settings: ChatSettings,
): Promise<void> {
  await kv.put(String(chatId), JSON.stringify(settings));
}
