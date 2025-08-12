# Weather Block for AEM EDS with Universal Editor

A comprehensive weather display block that integrates with popular weather APIs to show current conditions and forecasts in your AEM Edge Delivery Services site.

## Available Weather MCP Services

### 1. OpenWeatherMap (Recommended)
- **API Documentation**: https://openweathermap.org/api
- **Free Tier**: 1,000 calls/day
- **Features**: Current weather, 5-day forecast, historical data
- **Signup**: https://openweathermap.org/api

#### API Details:
- **Current Weather**: `GET https://api.openweathermap.org/data/2.5/weather`
- **5-Day Forecast**: `GET https://api.openweathermap.org/data/2.5/forecast`
- **Parameters**: 
  - `q`: City name or zip code
  - `appid`: Your API key
  - `units`: metric, imperial, or standard

### 2. WeatherAPI
- **API Documentation**: https://www.weatherapi.com/docs/
- **Free Tier**: 1 million calls/month
- **Features**: Current weather, forecasts, historical data, astronomy
- **Signup**: https://www.weatherapi.com/signup.aspx

#### API Details:
- **Current Weather**: `GET https://api.weatherapi.com/v1/current.json`
- **Forecast**: `GET https://api.weatherapi.com/v1/forecast.json`
- **Parameters**:
  - `key`: Your API key
  - `q`: City name, zip code, or coordinates
  - `days`: Number of forecast days (up to 10)

### 3. AccuWeather
- **API Documentation**: https://developer.accuweather.com/
- **Free Tier**: 50 calls/day
- **Features**: Current conditions, forecasts, severe weather alerts
- **Signup**: https://developer.accuweather.com/user/register

#### API Details:
- **Location Search**: `GET http://dataservice.accuweather.com/locations/v1/cities/search`
- **Current Conditions**: `GET http://dataservice.accuweather.com/currentconditions/v1/{locationKey}`
- **5-Day Forecast**: `GET http://dataservice.accuweather.com/forecasts/v1/daily/5day/{locationKey}`

## Block Configuration

### Author-Configurable Options

1. **Location** (required)
   - City name (e.g., "New York", "London")
   - Zip code (e.g., "10001", "SW1A 1AA")
   - Coordinates (for WeatherAPI: "40.7128,-74.0060")

2. **Weather Provider**
   - OpenWeatherMap (recommended)
   - WeatherAPI
   - AccuWeather

3. **API Key** (required)
   - Your weather service API key
   - Get from the respective provider's website

4. **Temperature Units**
   - Celsius (metric)
   - Fahrenheit (imperial)
   - Kelvin (standard)

5. **Show 5-Day Forecast**
   - Toggle to show/hide forecast
   - Displays next 5 days

6. **Display Theme**
   - Default: Blue gradient theme
   - Dark: Dark theme with muted colors
   - Minimal: Clean white theme
   - Card: Card-based layout

## Installation & Setup

### 1. API Key Setup

Choose a weather provider and get your API key:

**OpenWeatherMap (Recommended):**
1. Visit https://openweathermap.org/api
2. Sign up for a free account
3. Generate an API key
4. Free tier includes 1,000 calls/day

**WeatherAPI:**
1. Visit https://www.weatherapi.com/signup.aspx
2. Sign up for a free account
3. Get your API key
4. Free tier includes 1 million calls/month

### 2. Block Usage

In the Universal Editor:
1. Add a new block
2. Select "Weather" from the block library
3. Configure the settings:
   - Enter your location
   - Select weather provider
   - Enter your API key
   - Choose temperature units
   - Enable/disable forecast
   - Select display theme

### 3. Example Configurations

**Basic Current Weather:**
```
Location: New York
Provider: OpenWeatherMap
API Key: your-api-key-here
Units: Celsius
Show Forecast: false
Theme: Default
```

**Full Weather with Forecast:**
```
Location: London
Provider: WeatherAPI
API Key: your-api-key-here
Units: Fahrenheit
Show Forecast: true
Theme: Card
```

## Features

### Current Weather Display
- Location name and country
- Current temperature with units
- Weather condition description
- Weather icon
- Feels like temperature
- Humidity percentage
- Wind speed
- Atmospheric pressure

### 5-Day Forecast (Optional)
- Date for each day
- Average temperature
- Weather condition
- Weather icon

### Multiple Themes
- **Default**: Beautiful blue gradient
- **Dark**: Professional dark theme
- **Minimal**: Clean white design
- **Card**: Modern card layout

### Responsive Design
- Mobile-first approach
- Adapts to different screen sizes
- Touch-friendly on mobile devices

## Error Handling

The block includes comprehensive error handling:
- Missing API key validation
- Invalid location handling
- Network connectivity issues
- API rate limit notifications
- Service unavailability messages

## Accessibility Features

- High contrast mode support
- Reduced motion preferences
- Screen reader friendly
- Keyboard navigation support
- Semantic HTML structure

## Performance Considerations

- Efficient API calls
- Caching recommendations
- Lazy loading of forecast data
- Optimized image delivery
- Minimal bundle size

## Browser Support

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+
- iOS Safari 12+
- Android Chrome 60+

## Troubleshooting

### Common Issues

1. **Weather not loading**
   - Check API key validity
   - Verify location spelling
   - Check network connectivity

2. **Forecast not showing**
   - Ensure "Show Forecast" is enabled
   - Verify API plan supports forecasts
   - Check API call limits

3. **Styling issues**
   - Clear browser cache
   - Check CSS file inclusion
   - Verify theme selection

### API Limits

**OpenWeatherMap Free:**
- 1,000 calls/day
- 60 calls/minute

**WeatherAPI Free:**
- 1 million calls/month
- No rate limiting

**AccuWeather Free:**
- 50 calls/day
- Requires location key lookup

## Security Notes

- API keys are required for all services
- Store API keys securely
- Consider server-side proxy for production
- Implement rate limiting if needed
- Monitor API usage

## Development

### File Structure
```
blocks/weather/
├── _weather.json       # Block definition
├── weather.js          # Main functionality
├── weather.css         # Styling
└── README.md          # Documentation
```

### Customization

The block can be extended with:
- Additional weather providers
- Custom themes
- Advanced forecast displays
- Weather alerts/warnings
- Historical data integration

## Support

For issues and feature requests, please refer to the project documentation or create an issue in the project repository.
