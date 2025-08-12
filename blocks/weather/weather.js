import { moveInstrumentation } from '../../scripts/scripts.js';

// Weather service configurations
const WEATHER_SERVICES = {
  openweathermap: {
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    currentEndpoint: '/weather',
    forecastEndpoint: '/forecast',
    iconBaseUrl: 'https://openweathermap.org/img/wn',
    getParams: (location, apiKey, units) => ({
      q: location,
      appid: apiKey,
      units: units,
    }),
  },
  weatherapi: {
    baseUrl: 'https://api.weatherapi.com/v1',
    currentEndpoint: '/current.json',
    forecastEndpoint: '/forecast.json',
    getParams: (location, apiKey, units) => ({
      key: apiKey,
      q: location,
      aqi: 'no',
    }),
  },
  accuweather: {
    baseUrl: 'https://dataservice.accuweather.com',
    locationEndpoint: '/locations/v1/cities/search',
    currentEndpoint: '/currentconditions/v1',
    forecastEndpoint: '/forecasts/v1/daily/5day',
    getParams: (location, apiKey) => ({
      apikey: apiKey,
      q: location,
    }),
  },
};

/**
 * Build URL with query parameters
 */
function buildUrl(baseUrl, endpoint, params) {
  const url = new URL(endpoint, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
}

/**
 * Fetch weather data from the selected provider
 */
async function fetchWeatherData(provider, location, apiKey, units, showForecast = false) {
  const service = WEATHER_SERVICES[provider];
  if (!service) {
    throw new Error(`Unsupported weather provider: ${provider}`);
  }

  try {
    let weatherData = {};

    if (provider === 'openweathermap') {
      const currentParams = service.getParams(location, apiKey, units);
      const currentUrl = buildUrl(service.baseUrl, service.currentEndpoint, currentParams);
      const currentResponse = await fetch(currentUrl);
      
      if (!currentResponse.ok) {
        throw new Error(`Weather API error: ${currentResponse.status} ${currentResponse.statusText}`);
      }
      
      const currentData = await currentResponse.json();
      weatherData.current = normalizeOpenWeatherMapData(currentData, units);

      if (showForecast) {
        const forecastUrl = buildUrl(service.baseUrl, service.forecastEndpoint, currentParams);
        const forecastResponse = await fetch(forecastUrl);
        
        if (forecastResponse.ok) {
          const forecastData = await forecastResponse.json();
          weatherData.forecast = normalizeOpenWeatherMapForecast(forecastData, units);
        }
      }
    } else if (provider === 'weatherapi') {
      const params = service.getParams(location, apiKey, units);
      if (showForecast) {
        params.days = 5;
        const url = buildUrl(service.baseUrl, service.forecastEndpoint, params);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        weatherData.current = normalizeWeatherApiData(data.current, data.location);
        weatherData.forecast = normalizeWeatherApiForecast(data.forecast);
      } else {
        const url = buildUrl(service.baseUrl, service.currentEndpoint, params);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        weatherData.current = normalizeWeatherApiData(data.current, data.location);
      }
    }

    return weatherData;
  } catch (error) {
    console.error('Error fetching weather data:', error);
    throw error;
  }
}

/**
 * Normalize OpenWeatherMap current weather data
 */
function normalizeOpenWeatherMapData(data, units) {
  const tempUnit = units === 'imperial' ? '°F' : units === 'metric' ? '°C' : 'K';
  
  return {
    location: data.name,
    country: data.sys.country,
    temperature: Math.round(data.main.temp),
    tempUnit,
    description: data.weather[0].description,
    icon: `${WEATHER_SERVICES.openweathermap.iconBaseUrl}/${data.weather[0].icon}@2x.png`,
    humidity: data.main.humidity,
    windSpeed: data.wind.speed,
    pressure: data.main.pressure,
    feelsLike: Math.round(data.main.feels_like),
  };
}

/**
 * Normalize OpenWeatherMap forecast data
 */
function normalizeOpenWeatherMapForecast(data, units) {
  const tempUnit = units === 'imperial' ? '°F' : units === 'metric' ? '°C' : 'K';
  
  return data.list.slice(0, 5).map(item => ({
    date: new Date(item.dt * 1000).toLocaleDateString(),
    temperature: Math.round(item.main.temp),
    tempUnit,
    description: item.weather[0].description,
    icon: `${WEATHER_SERVICES.openweathermap.iconBaseUrl}/${item.weather[0].icon}.png`,
  }));
}

/**
 * Normalize WeatherAPI current weather data
 */
function normalizeWeatherApiData(current, location) {
  return {
    location: location.name,
    country: location.country,
    temperature: Math.round(current.temp_c),
    tempUnit: '°C',
    description: current.condition.text,
    icon: current.condition.icon,
    humidity: current.humidity,
    windSpeed: current.wind_kph,
    pressure: current.pressure_mb,
    feelsLike: Math.round(current.feelslike_c),
  };
}

/**
 * Normalize WeatherAPI forecast data
 */
function normalizeWeatherApiForecast(forecast) {
  return forecast.forecastday.map(day => ({
    date: new Date(day.date).toLocaleDateString(),
    temperature: Math.round(day.day.avgtemp_c),
    tempUnit: '°C',
    description: day.day.condition.text,
    icon: day.day.condition.icon,
  }));
}

/**
 * Create weather display HTML
 */
function createWeatherDisplay(weatherData, theme) {
  const { current, forecast } = weatherData;
  
  const weatherContainer = document.createElement('div');
  weatherContainer.className = `weather-container weather-theme-${theme}`;

  // Current weather
  const currentWeather = document.createElement('div');
  currentWeather.className = 'weather-current';
  currentWeather.innerHTML = `
    <div class="weather-header">
      <h3 class="weather-location">${current.location}, ${current.country}</h3>
      <div class="weather-main">
        <img class="weather-icon" src="${current.icon}" alt="${current.description}" />
        <div class="weather-temp">${current.temperature}${current.tempUnit}</div>
      </div>
      <div class="weather-description">${current.description}</div>
    </div>
    
    <div class="weather-details">
      <div class="weather-detail">
        <span class="weather-detail-label">Feels like</span>
        <span class="weather-detail-value">${current.feelsLike}${current.tempUnit}</span>
      </div>
      <div class="weather-detail">
        <span class="weather-detail-label">Humidity</span>
        <span class="weather-detail-value">${current.humidity}%</span>
      </div>
      <div class="weather-detail">
        <span class="weather-detail-label">Wind</span>
        <span class="weather-detail-value">${current.windSpeed} ${current.tempUnit === '°F' ? 'mph' : 'km/h'}</span>
      </div>
      <div class="weather-detail">
        <span class="weather-detail-label">Pressure</span>
        <span class="weather-detail-value">${current.pressure} ${current.tempUnit === '°F' ? 'inHg' : 'mb'}</span>
      </div>
    </div>
  `;

  weatherContainer.appendChild(currentWeather);

  // Forecast
  if (forecast && forecast.length > 0) {
    const forecastContainer = document.createElement('div');
    forecastContainer.className = 'weather-forecast';
    
    const forecastTitle = document.createElement('h4');
    forecastTitle.textContent = '5-Day Forecast';
    forecastContainer.appendChild(forecastTitle);

    const forecastList = document.createElement('div');
    forecastList.className = 'weather-forecast-list';

    forecast.forEach(day => {
      const dayElement = document.createElement('div');
      dayElement.className = 'weather-forecast-day';
      dayElement.innerHTML = `
        <div class="forecast-date">${day.date}</div>
        <img class="forecast-icon" src="${day.icon}" alt="${day.description}" />
        <div class="forecast-temp">${day.temperature}${day.tempUnit}</div>
        <div class="forecast-desc">${day.description}</div>
      `;
      forecastList.appendChild(dayElement);
    });

    forecastContainer.appendChild(forecastList);
    weatherContainer.appendChild(forecastContainer);
  }

  return weatherContainer;
}

/**
 * Create error display
 */
function createErrorDisplay(message) {
  const errorContainer = document.createElement('div');
  errorContainer.className = 'weather-error';
  errorContainer.innerHTML = `
    <div class="weather-error-icon">⚠️</div>
    <div class="weather-error-message">${message}</div>
    <div class="weather-error-help">Please check your location and API key settings.</div>
  `;
  return errorContainer;
}

/**
 * Create loading display
 */
function createLoadingDisplay() {
  const loadingContainer = document.createElement('div');
  loadingContainer.className = 'weather-loading';
  loadingContainer.innerHTML = `
    <div class="weather-loading-spinner"></div>
    <div class="weather-loading-text">Loading weather data...</div>
  `;
  return loadingContainer;
}

/**
 * Get configuration from block attributes
 */
function getBlockConfig(block) {
  return {
    location: block.getAttribute('data-location') || 'New York',
    provider: block.getAttribute('data-provider') || 'openweathermap',
    apiKey: block.getAttribute('data-api-key') || '',
    units: block.getAttribute('data-units') || 'metric',
    showForecast: block.getAttribute('data-show-forecast') === 'true',
    theme: block.getAttribute('data-theme') || 'default',
  };
}

/**
 * Main decoration function
 */
export default async function decorate(block) {
  const config = getBlockConfig(block);
  
  // Clear existing content
  block.textContent = '';
  
  // Show loading state
  const loadingDisplay = createLoadingDisplay();
  block.appendChild(loadingDisplay);

  try {
    // Validate configuration
    if (!config.apiKey) {
      throw new Error('API key is required. Please configure your weather service API key.');
    }

    if (!config.location) {
      throw new Error('Location is required. Please specify a city or zip code.');
    }

    // Fetch weather data
    const weatherData = await fetchWeatherData(
      config.provider,
      config.location,
      config.apiKey,
      config.units,
      config.showForecast
    );

    // Remove loading display
    block.removeChild(loadingDisplay);

    // Create and append weather display
    const weatherDisplay = createWeatherDisplay(weatherData, config.theme);
    moveInstrumentation(block, weatherDisplay);
    block.appendChild(weatherDisplay);

  } catch (error) {
    console.error('Weather block error:', error);
    
    // Remove loading display
    if (loadingDisplay.parentNode) {
      block.removeChild(loadingDisplay);
    }

    // Show error display
    const errorDisplay = createErrorDisplay(error.message);
    block.appendChild(errorDisplay);
  }
}
