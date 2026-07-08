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

/**
 * Fetch up to 3 alternative routes from OpenRouteService with built-in 3D elevation.
 */
export async function getRoute(start, end) {
    // 1. Guard clause: Ensure coordinates are valid before requesting
    if (!start?.lng || !start?.lat || !end?.lng || !end?.lat) {
        throw new Error("Invalid start or end coordinates passed to API.");
    }

    // TODO: Replace with your actual ORS standard token
    const API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImYyNDg5YjJmYTk3ZTQ4YjZhZTUyMGY0Nzc5YjJlOWRiIiwiaCI6Im11cm11cjY0In0='; 
    const url = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';
    
    // ORS requires coordinates explicitly as [longitude, latitude] arrays
    // We removed 'alternative_routes' to prevent the 400 Bad Request error
    const requestBody = {
        coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat]
        ],
        elevation: true 
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': API_KEY,
            'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("ORS API Error Details:", errorData);
        throw new Error(`Routing failed: ${res.status}`);
    }
    
    return await res.json(); 
}