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
    const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImYyNDg5YjJmYTk3ZTQ4YjZhZTUyMGY0Nzc5YjJlOWRiIiwiaCI6Im11cm11cjY0In0='; 
    const url = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

    const requestBody = {
        coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat]
        ],
        elevation: true,
        instructions: false, // Keep text directions off to save bandwidth
        // THE MOAT: Get 3 paths, allowing 80% overlap and slightly longer alternatives
        alternative_routes: { 
            target_count: 3,
            share_factor: 0.8,  
            weight_factor: 1.2  
        }
    };

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
    // Open-Meteo is free and requires no API key!
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Weather API failed");
        const data = await response.json();
        
        return {
            temp: Math.round(data.current.temperature_2m),
            feelsLike: Math.round(data.current.apparent_temperature),
            rain: data.current.precipitation // in millimeters
        };
    } catch (error) {
        console.warn("Could not fetch weather:", error);
        return null;
    }
}