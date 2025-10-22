import AsyncStorage from '@react-native-async-storage/async-storage';

interface Coordinates {
  latitude: number;
  longitude: number;
}

const GEOCODE_CACHE_KEY = '@geocode_cache_';

export class GeocodingService {
  private static apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

  /**
   * Convert address to coordinates using WeatherAPI.com's search
   */
  static async getCoordinates(address: string): Promise<Coordinates | null> {
    if (!address || address.trim().length === 0) {
      return null;
    }

    const cacheKey = `${GEOCODE_CACHE_KEY}${address}`;

    // Check cache (geocodes rarely change)
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/search.json?key=${this.apiKey}&q=${encodeURIComponent(address)}`
      );

      if (!response.ok) throw new Error('Geocoding failed');

      const results = await response.json();
      if (results.length === 0) return null;

      const coords = {
        latitude: results[0].lat,
        longitude: results[0].lon,
      };

      // Cache permanently (addresses don't move)
      await this.setCached(cacheKey, coords);
      return coords;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  private static async getCached(key: string): Promise<Coordinates | null> {
    try {
      const cached = await AsyncStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private static async setCached(key: string, coords: Coordinates): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(coords));
    } catch (error) {
      console.error('Error caching coordinates:', error);
    }
  }
}
