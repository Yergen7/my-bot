// Запросы к API погоды и курсов валют (то же, что в newlesson, без запуска из консоли).

export interface Weather {
  current: {
    time: string;
    temperature_2m: number;
    wind_speed_10m: number;
  };
}

export interface CurrencyRate {
  base: string;
  quote: string;
  date: string;
  rate: number;
}

export interface CurrencyRates {
  usd: CurrencyRate;
  eur: CurrencyRate;
  eurInUsd: number; // сколько долларов стоит 1 евро
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ошибка API: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function getWeather(): Promise<Weather> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=43.24&longitude=76.89&current=temperature_2m,wind_speed_10m&timezone=auto";
  return getJson<Weather>(url);
}

async function getCurrencyRate(base: string): Promise<CurrencyRate> {
  return getJson<CurrencyRate>(`https://api.frankfurter.dev/v2/rate/${base}/KZT`);
}

export async function getCurrencyRates(): Promise<CurrencyRates> {
  const [usd, eur] = await Promise.all([
    getCurrencyRate("USD"),
    getCurrencyRate("EUR"),
  ]);
  return { usd, eur, eurInUsd: eur.rate / usd.rate };
}

export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
