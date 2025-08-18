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

  return data.list.slice(0, 5).map((item) => {
    // Create local date to avoid timezone offset issues
    const localDate = new Date(item.dt * 1000);

    return {
      date: `${localDate.toLocaleDateString('en-US', { weekday: 'short' })} ${localDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`,
      temperature: Math.round(item.main.temp),
      tempUnit,
      description: item.weather[0].description,
      icon: `${WEATHER_SERVICES.openweathermap.iconBaseUrl}/${item.weather[0].icon}.png`,
    };
  });
}

/**
 * Normalize WeatherAPI current weather data
 */
function normalizeWeatherApiData(current, location, todayForecast = null, units = 'metric') {
  let tempUnit = '°C';
  let temperature = Math.round(current.temp_c);
  let feelsLike = Math.round(current.feelslike_c);
  let windSpeed = current.wind_kph;
  let pressure = current.pressure_mb;
  let maxTemp = null;
  let minTemp = null;

  if (units === 'imperial') {
    tempUnit = '°F';
    temperature = Math.round(current.temp_f);
    feelsLike = Math.round(current.feelslike_f);
    windSpeed = current.wind_mph;
    pressure = current.pressure_in;
  }

  // Extract today's high/low from forecast if available
  if (todayForecast && todayForecast.day) {
    maxTemp = Math.round(units === 'imperial' ? todayForecast.day.maxtemp_f : todayForecast.day.maxtemp_c);
    minTemp = Math.round(units === 'imperial' ? todayForecast.day.mintemp_f : todayForecast.day.mintemp_c);
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
    maxTemp,
    minTemp,
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

  // Take days 1-5 from the forecast (skipping day 0 which is today)
  const filteredDays = forecast.forecastday.slice(1, 6); // Take next 5 days after today

  return filteredDays.map((day) => {
    // Parse date as local date to avoid timezone offset issues
    const [year, month, dayNum] = day.date.split('-');
    const localDate = new Date(year, month - 1, dayNum);

    return {
      date: `${localDate.toLocaleDateString('en-US', { weekday: 'short' })} ${localDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`,
      maxTemp: Math.round(units === 'imperial' ? day.day.maxtemp_f : day.day.maxtemp_c),
      minTemp: Math.round(units === 'imperial' ? day.day.mintemp_f : day.day.mintemp_c),
      tempUnit,
      description: day.day.condition.text,
      icon: day.day.condition.icon,
    };
  });
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
      if (showForecast) {
        params.days = 6; // Request 6 days to ensure we have today + next 5
        const url = buildUrl(service.baseUrl, service.forecastEndpoint, params);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        // Use units from response if available, otherwise fall back to the requested units
        const responseUnits = data.units || units;

        // Find today's forecast data for high/low temps
        // Use the first day in the forecast array as "today" since the API returns today first
        const todayForecast = data.forecast && data.forecast.forecastday
          && data.forecast.forecastday[0];

        // eslint-disable-next-line no-console
        console.log('Today forecast data:', todayForecast);

        weatherData.current = normalizeWeatherApiData(
          data.current,
          data.location,
          todayForecast,
          responseUnits,
        );
        weatherData.forecast = normalizeWeatherApiForecast(data.forecast, responseUnits);
      } else {
        const url = buildUrl(service.baseUrl, service.currentEndpoint, params);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
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

  // Build high/low display if available
  let highLowHtml = '';
  if (current.maxTemp !== null && current.minTemp !== null) {
    highLowHtml = `
      <div class="weather-today-temps">
        <span class="weather-today-high">H: ${current.maxTemp}${current.tempUnit}</span>
        <span class="weather-today-low">L: ${current.minTemp}${current.tempUnit}</span>
      </div>
    `;
  }

  currentWeather.innerHTML = `
    <div class="weather-header">
      <h3 class="weather-location">${current.location}, ${current.country}</h3>
      <div class="weather-main">
        <img class="weather-icon" src="${current.icon}" alt="${current.description}" />
        <div class="weather-temp-section">
          <div class="weather-temp">${current.temperature}${current.tempUnit}</div>
          ${highLowHtml}
        </div>
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
        <div class="forecast-temps">
          <div class="forecast-temp-high">H: ${day.maxTemp}${day.tempUnit}</div>
          <div class="forecast-temp-low">L: ${day.minTemp}${day.tempUnit}</div>
        </div>
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
  // First try to read from block content (standard AEM approach)
  const blockConfig = readBlockConfig(block);

  // Debug: Log which config method is being used
  // eslint-disable-next-line no-console
  console.log('readBlockConfig result:', blockConfig);

  // If readBlockConfig didn't work, try to extract values by position
  // based on the field order in _weather.json
  const extractedConfig = {};
  if (Object.keys(blockConfig).length === 0 && block.children.length > 0) {
    const rows = [...block.children];

    // Handle nested structure where all values might be in a single row
    let values = [];
    if (rows.length === 1 && rows[0].querySelector('div')) {
      // Nested structure: all <p> elements are inside a single row's div
      const nestedDiv = rows[0].querySelector('div');
      values = [...nestedDiv.querySelectorAll('p')].map((p) => p.textContent.trim());
    } else {
      // Flat structure: each row contains one value
      values = rows.map((row) => {
        const cell = row.querySelector('p');
        return cell ? cell.textContent.trim() : '';
      });
    }

    // eslint-disable-next-line no-console
    console.log('Extracted values:', values);

    // Map values by position - Universal Editor outputs values in _weather.json field order
    // Current observed order: location, units, showForecast, theme (provider missing)
    // But let's map all possible positions defensively
    if (values.length > 0) {
      [extractedConfig.location] = values;
    }
    if (values.length > 1) {
      // Second value could be provider or units, check if it's a unit value
      if (['metric', 'imperial', 'standard'].includes(values[1])) {
        [, extractedConfig.units] = values;
      } else {
        [, extractedConfig.provider] = values;
      }
    }
    if (values.length > 2) {
      // Third value could be units or showForecast
      if (['metric', 'imperial', 'standard'].includes(values[2])) {
        [, , extractedConfig.units] = values;
      } else if (['true', 'false'].includes(values[2])) {
        [, , extractedConfig.showForecast] = values;
      }
    }
    if (values.length > 3) {
      // Fourth value could be showForecast or theme
      if (['true', 'false'].includes(values[3])) {
        [, , , extractedConfig.showForecast] = values;
      } else {
        [, , , extractedConfig.theme] = values;
      }
    }
    if (values.length > 4) {
      [, , , , extractedConfig.theme] = values;
    }

    // eslint-disable-next-line no-console
    console.log('Extracted config:', extractedConfig);
  }

  // Map the configuration values with fallbacks
  // Support both grouped (weatherData_*) and ungrouped field names for backward compatibility
  const config = {
    location: blockConfig.weatherData_location || blockConfig.location || extractedConfig.location || block.getAttribute('data-location') || 'New York',
    provider: blockConfig.weatherData_provider || blockConfig.provider || extractedConfig.provider || block.getAttribute('data-provider') || 'weatherapi',
    // apiKey is no longer required from Universal Editor or block attributes
    apiKey: '',
    // Support units selection (C/F) from Universal Editor or block attributes
    units: blockConfig.weatherData_units || blockConfig.units || extractedConfig.units || block.getAttribute('data-units') || 'metric',
    showForecast: (blockConfig.weatherData_showForecast || blockConfig.showforecast || blockConfig.showForecast || extractedConfig.showForecast || block.getAttribute('data-show-forecast')) === 'true',
    theme: blockConfig.weatherData_theme || blockConfig.theme || extractedConfig.theme || block.getAttribute('data-theme') || 'default',
  };

  // eslint-disable-next-line no-console
  console.log('Final config:', config);

  return config;
}

/**
 * Main decoration function
 */
export default async function decorate(block) {
  // Read config first, before clearing content
  const config = getBlockConfig(block);

  // Immediately clear content after reading config to prevent flash of raw values
  block.innerHTML = '';

  // Show loading state immediately
  const loadingDisplay = createLoadingDisplay();
  block.appendChild(loadingDisplay);

  try {
    if (!config.location) {
      throw new Error('Location is required. Please specify a city or zip code.');
    }

    // Fetch weather data
    const weatherData = await fetchWeatherData(
      config.provider,
      config.location,
      config.apiKey,
      config.units,
      config.showForecast,
    );

    // Remove loading display
    if (loadingDisplay.parentNode) {
      block.removeChild(loadingDisplay);
    }

    // Create and append weather display
    const weatherDisplay = createWeatherDisplay(weatherData, config.theme);
    moveInstrumentation(block, weatherDisplay);
    block.appendChild(weatherDisplay);
  } catch (error) {
    // eslint-disable-next-line no-console
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
