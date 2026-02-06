import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WeatherData {
  date: string;
  temp_c: number;
  condition: {
    text: string;
    icon: string;
    code: number;
  };
  chance_of_rain: number;
  wind_kph: number;
}

export interface HourlyWeather {
  time: string;
  temp_c: number;
  condition: { text: string; icon: string };
  chance_of_rain: number;
}

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_KEY_PREFIX = '@weather_cache_';

export class WeatherService {
  private static apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
  private static baseUrl = 'https://api.weatherapi.com/v1';

  /**
   * Fetch 7-day weather forecast for location
   */
  static async getForecast(latitude: number, longitude: number): Promise<WeatherData[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}${latitude}_${longitude}`;

    // Check cache first
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(
        `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${latitude},${longitude}&days=7&aqi=no`
      );

      if (!response.ok) throw new Error('Weather API request failed');

      const data = await response.json();
      const forecast = data.forecast.forecastday.map((day: any) => ({
        date: day.date,
        temp_c: day.day.avgtemp_c,
        condition: day.day.condition,
        chance_of_rain: day.day.daily_chance_of_rain,
        wind_kph: day.day.maxwind_kph
      }));

      // Cache for 6 hours
      await this.setCached(cacheKey, forecast);
      return forecast;
    } catch (error) {
      console.error('Error fetching weather:', error);
      return [];
    }
  }

  /**
   * Get hourly forecast for specific day
   */
  static async getHourlyForecast(
    latitude: number,
    longitude: number,
    date: string
  ): Promise<HourlyWeather[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${latitude},${longitude}&dt=${date}&aqi=no`
      );

      if (!response.ok) throw new Error('Weather API request failed');

      const data = await response.json();
      return data.forecast.forecastday[0].hour.map((hour: any) => ({
        time: hour.time,
        temp_c: hour.temp_c,
        condition: hour.condition,
        chance_of_rain: hour.chance_of_rain
      }));
    } catch (error) {
      console.error('Error fetching hourly weather:', error);
      return [];
    }
  }

  /**
   * Check for severe weather conditions
   */
  static isSevereWeather(weather: WeatherData): boolean {
    return (
      weather.temp_c < 0 || // Freezing
      weather.temp_c > 35 || // Extreme heat
      weather.chance_of_rain > 80 || // Heavy rain likely
      weather.wind_kph > 50 || // Strong winds
      weather.condition.text.toLowerCase().includes('storm') ||
      weather.condition.text.toLowerCase().includes('snow')
    );
  }

  /**
   * Get weather icon URL
   */
  static getIconUrl(iconPath: string): string {
    // WeatherAPI returns icon paths without https:
    return `https:${iconPath}`;
  }

  private static async getCached(key: string): Promise<any | null> {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      if (age > CACHE_DURATION_MS) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  private static async setCached(key: string, data: any): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (error) {
      console.error('Error caching weather data:', error);
    }
  }
}
