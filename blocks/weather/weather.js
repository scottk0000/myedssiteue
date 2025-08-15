import { moveInstrumentation } from '../../scripts/scripts.js';
import { readBlockConfig } from '../../scripts/aem.js';

// Weather service configurations
const WEATHER_SERVICES = {
  openweathermap: {
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    currentEndpoint: '/weather',
    forecastEndpoint: '/forecast',
    iconBaseUrl: 'https://openweathermap.org/img/wn',
    getParams: (location, apiKey, units) => {
      const params = {
        appid: apiKey,
        units,
      };

      // Check if location is a zip code pattern (5 digits or zip,country)
      if (/^\d{5}(,\w{2})?$/.test(location.trim())) {
        params.zip = location;
      } else {
        params.q = location;
      }

      return params;
    },
  },
  weatherapi: {
    baseUrl: 'https://258616-skweatherproxy-stage.adobeioruntime.net/api/v1/web/weather-proxy/get-weather',
    currentEndpoint: '/current.json',
    forecastEndpoint: '/forecast.json',
    getParams: (location, units) => ({
      q: location,
      units,
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
  // For weatherapi proxy, append the endpoint to the baseUrl
  const fullUrl = baseUrl.endsWith('/') ? baseUrl + endpoint.substring(1) : baseUrl + endpoint;
  const url = new URL(fullUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
}

/**
 * Normalize OpenWeatherMap current weather data
 */
function normalizeOpenWeatherMapData(data, units) {
  let tempUnit = '°C';
  if (units === 'imperial') {
    tempUnit = '°F';
  } else if (units === 'standard') {
    tempUnit = 'K';
  }

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
  let tempUnit = '°C';
  if (units === 'imperial') {
    tempUnit = '°F';
  } else if (units === 'standard') {
    tempUnit = 'K';
  }

  return data.list.slice(0, 5).map((item) => ({
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
function normalizeWeatherApiData(current, location, units = 'metric') {
  let tempUnit = '°C';
  let temperature = Math.round(current.temp_c);
  let feelsLike = Math.round(current.feelslike_c);
  let windSpeed = current.wind_kph;
  let pressure = current.pressure_mb;

  if (units === 'imperial') {
    tempUnit = '°F';
    temperature = Math.round(current.temp_f);
    feelsLike = Math.round(current.feelslike_f);
    windSpeed = current.wind_mph;
    pressure = current.pressure_in;
  }

  return {
    location: location.name,
    country: location.country,
    temperature,
    tempUnit,
    description: current.condition.text,
    icon: current.condition.icon,
    humidity: current.humidity,
    windSpeed,
    pressure,
    feelsLike,
  };
}

/**
 * Normalize WeatherAPI forecast data
 */
function normalizeWeatherApiForecast(forecast, units = 'metric') {
  let tempUnit = '°C';

  if (units === 'imperial') {
    tempUnit = '°F';
  }

  return forecast.forecastday.map((day) => ({
    date: new Date(day.date).toLocaleDateString(),
    temperature: Math.round(units === 'imperial' ? day.day.avgtemp_f : day.day.avgtemp_c),
    tempUnit,
    description: day.day.condition.text,
    icon: day.day.condition.icon,
  }));
}

/**
 * Fetch weather data from the selected provider
 */
async function fetchWeatherData(provider, location, apiKey, units, showForecast = false) {
  // Debug: Log function entry
  // eslint-disable-next-line no-console
  console.log('fetchWeatherData called with:', { provider, location, units, showForecast });
  
  const service = WEATHER_SERVICES[provider];
  if (!service) {
    throw new Error(`Unsupported weather provider: ${provider}`);
  }

  try {
    const weatherData = {};

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
      const params = service.getParams(location, units);
      // Debug: Log API parameters
      // eslint-disable-next-line no-console
      console.log('WeatherAPI params:', params);
      
      if (showForecast) {
        params.days = 5;
        const url = buildUrl(service.baseUrl, service.forecastEndpoint, params);
        // Debug: Log API URL
        // eslint-disable-next-line no-console
        console.log('WeatherAPI forecast URL:', url);
        
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        // Debug: Log API response
        // eslint-disable-next-line no-console
        console.log('WeatherAPI forecast response:', data);
        
        // Use units from response if available, otherwise fall back to the requested units
        const responseUnits = data.units || units;
        weatherData.current = normalizeWeatherApiData(data.current, data.location, responseUnits);
        weatherData.forecast = normalizeWeatherApiForecast(data.forecast, responseUnits);
      } else {
        const url = buildUrl(service.baseUrl, service.currentEndpoint, params);
        // Debug: Log API URL
        // eslint-disable-next-line no-console
        console.log('WeatherAPI current URL:', url);
        
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        // Debug: Log API response
        // eslint-disable-next-line no-console
        console.log('WeatherAPI current response:', data);
        
        // Use units from response if available, otherwise fall back to the requested units
        const responseUnits = data.units || units;
        weatherData.current = normalizeWeatherApiData(data.current, data.location, responseUnits);
      }
    }

    return weatherData;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching weather data:', error);
    throw error;
  }
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

    forecast.forEach((day) => {
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
 * Get configuration from block content or attributes
 */
function getBlockConfig(block) {
  // Debug logging - see the block structure
  // eslint-disable-next-line no-console
  console.log('Block element:', block);
  // eslint-disable-next-line no-console
  console.log('Block innerHTML:', block.innerHTML);
  // eslint-disable-next-line no-console
  console.log('Block children:', block.children);
  // eslint-disable-next-line no-console
  console.log('Block attributes:', [...block.attributes].map((attr) => `${attr.name}="${attr.value}"`));

  // First try to read from block content (standard AEM approach)
  const blockConfig = readBlockConfig(block);

  // Debug logging - remove in production
  // eslint-disable-next-line no-console
  console.log('Raw blockConfig:', blockConfig);

  // If readBlockConfig didn't work, try to extract values by position
  // based on the field order in _weather.json
  const extractedConfig = {};
  if (Object.keys(blockConfig).length === 0 && block.children.length > 0) {
    const rows = [...block.children];
    const values = rows.map((row) => {
      const cell = row.querySelector('p');
      return cell ? cell.textContent.trim() : '';
    });

    // Map values by position - Universal Editor seems to only output configured fields
    // Based on your configuration: location, provider, units, showForecast
    if (values.length > 0) extractedConfig.location = values[0] || '';
    if (values.length > 1) extractedConfig.provider = values[1] || '';
    if (values.length > 2) extractedConfig.units = values[2] || '';
    if (values.length > 3) extractedConfig.showForecast = values[3] || '';
    // Note: units and theme may not be present if not explicitly configured

    // eslint-disable-next-line no-console
    console.log('Extracted config by position:', extractedConfig);
  }

  // Map the configuration values with fallbacks
  const config = {
    location: blockConfig.location || extractedConfig.location || block.getAttribute('data-location') || 'New York',
    provider: blockConfig.provider || extractedConfig.provider || block.getAttribute('data-provider') || 'openweathermap',
    // apiKey is no longer required from Universal Editor or block attributes
    apiKey: '',
    // Support units selection (C/F) from Universal Editor or block attributes
    units: blockConfig.units || extractedConfig.units || block.getAttribute('data-units') || 'metric',
    showForecast: (blockConfig.showforecast || blockConfig.showForecast || extractedConfig.showForecast || block.getAttribute('data-show-forecast')) === 'true',
    theme: blockConfig.theme || extractedConfig.theme || block.getAttribute('data-theme') || 'default',
  };

  return config;
}

/**
 * Main decoration function
 */
export default async function decorate(block) {
  // Debug logging - check if decoration is being called
  // eslint-disable-next-line no-console
  console.log('Weather block decorate() called', block);
  // eslint-disable-next-line no-console
  console.log('Block status:', block.dataset.blockStatus);
  // eslint-disable-next-line no-console
  console.log('Block innerHTML before config read:', block.innerHTML);

  // Read config first, before clearing content
  const config = getBlockConfig(block);

  // Debug logging - remove in production
  // eslint-disable-next-line no-console
  console.log('Weather block config:', config);

  // Immediately clear content after reading config to prevent flash of raw values
  block.innerHTML = '';

  // Show loading state immediately
  const loadingDisplay = createLoadingDisplay();
  block.appendChild(loadingDisplay);

  try {
    if (!config.location) {
      throw new Error('Location is required. Please specify a city or zip code.');
    }

    // Debug: Log API call parameters
    // eslint-disable-next-line no-console
    console.log('About to call fetchWeatherData with:', {
      provider: config.provider,
      location: config.location,
      apiKey: config.apiKey ? 'SET' : 'NOT SET',
      units: config.units,
      showForecast: config.showForecast,
    });

    // Fetch weather data
    const weatherData = await fetchWeatherData(
      config.provider,
      config.location,
      config.apiKey,
      config.units,
      config.showForecast,
    );

    // Debug: Log API response
    // eslint-disable-next-line no-console
    console.log('Weather data received:', weatherData);

    // Debug: Log before removing loading display
    // eslint-disable-next-line no-console
    console.log('About to remove loading display and create weather display');

    // Remove loading display
    if (loadingDisplay.parentNode) {
      block.removeChild(loadingDisplay);
    }

    // Create and append weather display
    const weatherDisplay = createWeatherDisplay(weatherData, config.theme);
    
    // Debug: Log weather display creation
    // eslint-disable-next-line no-console
    console.log('Weather display created:', weatherDisplay);
    
    moveInstrumentation(block, weatherDisplay);
    block.appendChild(weatherDisplay);
    
    // Debug: Log final block content
    // eslint-disable-next-line no-console
    console.log('Weather block final content:', block.innerHTML);
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Weather block error:', error);
    // eslint-disable-next-line no-console
    console.error('Error stack:', error.stack);

    // Remove loading display
    if (loadingDisplay.parentNode) {
      block.removeChild(loadingDisplay);
    }

    // Show error display
    const errorDisplay = createErrorDisplay(error.message);
    block.appendChild(errorDisplay);
    
    // Debug: Log error display
    // eslint-disable-next-line no-console
    console.log('Error display created:', errorDisplay);
  }
}
