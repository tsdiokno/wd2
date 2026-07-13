import { CONFIG } from './config.js';

/**
 * Geocode a query string to coordinates using Nominatim.
 */
export async function geocodeSearch(query) {
    if (!query || query.length < 3) return [];
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        if (!res.ok) throw new Error("Geocoding failed");
        return await res.json();
    } catch (error) {
        console.error("Geocoding Error:", error);
        return [];
    }
}

export async function getRoute(start, end, signal) {
    const ORS_API_KEY = CONFIG.OPENROUTESERVICE_KEY; 
    const url = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

    const requestBody = {
        coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat]
        ],
        elevation: true,
        instructions: false,
        
        alternative_routes: { 
            target_count: 3,
            share_factor: 0.9,
            weight_factor: 1.15  
        }
    };

    // const requestBody = {
    //     coordinates: [
    //         [start.lng, start.lat],
    //         [end.lng, end.lat]
    //     ],
    //     elevation: true,
    //     instructions: false,
        
    //     // NEW: Force the urban profile to ignore surface, greenway, and micro-routing penalties
    //     profile_params: {
    //         weighting: {
    //             steepness_difficulty: 0 // Don't let hill biases warp urban street choice
    //         },
    //         restrictions: {
    //             // If the route has custom access tags, force it to assume pedestrian accessibility
    //             free_accessibility: true 
    //         }
    //     },
        
    //     alternative_routes: { 
    //         target_count: 3,
    //         share_factor: 0.9,  
    //         weight_factor: 1.15  
    //     }
    // };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json, application/geo+json; charset=utf-8',
            'Content-Type': 'application/json',
            'Authorization': ORS_API_KEY
        },
        body: JSON.stringify(requestBody),
        signal: signal
    });

    if (!response.ok) throw new Error(`ORS API failed with status ${response.status}`);
    return await response.json();
}

export async function getWeather(lat, lng) {
    // Added weather_code and timezone=auto for perfect local sync
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,weather_code&timezone=auto`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Weather API failed");
        const data = await response.json();
        
        // WMO Weather codes: 51-67 (Rain/Drizzle), 80-82 (Showers), 95-99 (Thunderstorms)
        // If the code is 50 or higher, water is falling from the sky.
        const wmoCode = data.current.weather_code;
        const isRaining = wmoCode >= 50 || data.current.precipitation > 0;
        
        return {
            temp: Math.round(data.current.temperature_2m),
            feelsLike: Math.round(data.current.apparent_temperature),
            // We pass a 1 if it's raining so your existing app.js logic (weather.rain > 0) still works perfectly
            rain: isRaining ? 1 : 0, 
            rawPrecipMm: data.current.precipitation // Kept just in case you want it later
        };
    } catch (error) {
        console.warn("Could not fetch weather:", error);
        return null;
    }
}