// Тонкая обёртка над Telegram Bot API. Токен приходит из секрета Worker (env), не из кода.

export interface Message {
  chat: { id: number };
  text?: string;
}

export interface CallbackQuery {
  id: string;
  data?: string;
  message?: Message;
}

export interface Update {
  update_id: number;
  message?: Message;
  callback_query?: CallbackQuery;
}

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

const MENU = {
  inline_keyboard: [
    [
      { text: "🌤 Погода", callback_data: "weather" },
      { text: "💱 Курсы", callback_data: "rates" },
    ],
    [
      { text: "👨‍👩‍👧 Promise.all", callback_data: "all" },
      { text: "📋 allSettled", callback_data: "settled" },
    ],
    [
      { text: "🏁 Promise.race", callback_data: "race" },
      { text: "🥇 Promise.any", callback_data: "any" },
    ],
    [{ text: "🔗 then/catch/finally", callback_data: "chain" }],
  ],
};

export interface Telegram {
  sendMessage(chatId: number, text: string, showMenu?: boolean): Promise<unknown>;
  answerButton(callbackQueryId: string): Promise<unknown>;
}

export function createTelegram(token: string): Telegram {
  const api = `https://api.telegram.org/bot${token}`;

  async function call<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await fetch(`${api}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = (await response.json()) as TelegramResponse<T>;
    if (!data.ok) {
      throw new Error(`Telegram ${method}: ${data.description ?? response.status}`);
    }
    return data.result;
  }

  return {
    sendMessage: (chatId, text, showMenu = false) =>
      call("sendMessage", {
        chat_id: chatId,
        text,
        reply_markup: showMenu ? MENU : undefined,
      }),
    answerButton: (callbackQueryId) =>
      call("answerCallbackQuery", { callback_query_id: callbackQueryId }),
  };
}
