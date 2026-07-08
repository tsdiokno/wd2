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
    // 1. Paste your OpenRouteService API key here
    const ORS_API_KEY = 'YOUR_API_KEY_HERE'; 
    
    // 2. We MUST use the POST endpoint for advanced routing
    const url = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

    // 3. The stripped-down, speed-optimized payload
    const requestBody = {
        coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat]
        ],
        elevation: true,
        instructions: false, 
        // 🚀 THE MOAT: Constrained so the server can actually finish the math
        alternative_routes: { 
            target_count: 3,
            share_factor: 0.8,  // ALLOW 80% overlap (makes finding alternatives much faster)
            weight_factor: 1.1  // ONLY allow routes that are 10% longer than the direct path. 
        }
    };
    
    // 4. Fire the request
    const response = await fetch(url, {
        method: 'POST', // Must be POST
        headers: {
            'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
            'Content-Type': 'application/json',
            'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImYyNDg5YjJmYTk3ZTQ4YjZhZTUyMGY0Nzc5YjJlOWRiIiwiaCI6Im11cm11cjY0In0=' // Authentication goes in the header!
        },
        body: JSON.stringify(requestBody),
        signal: signal // This connects to your AbortController in app.js
    });

    // 5. Catch real API errors so they don't mask as CORS errors
    if (!response.ok) {
        const errorText = await response.text();
        console.error("ORS Server Error:", response.status, errorText);
        throw new Error(`ORS API failed with status ${response.status}`);
    }

    const data = await response.json();
    return data;
}

/**
 * Fetch up to 3 alternative routes from OpenRouteService with built-in 3D elevation.
 */
// export async function getRoute(start, end) {
//     // 1. Guard clause: Ensure coordinates are valid before requesting
//     if (!start?.lng || !start?.lat || !end?.lng || !end?.lat) {
//         throw new Error("Invalid start or end coordinates passed to API.");
//     }

//     // TODO: Replace with your actual ORS standard token
//     const API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImYyNDg5YjJmYTk3ZTQ4YjZhZTUyMGY0Nzc5YjJlOWRiIiwiaCI6Im11cm11cjY0In0='; 
//     const url = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';
    
//     const requestBody = {
//         coordinates: [
//             [start.lng, start.lat],
//             [end.lng, end.lat]
//         ],
//         elevation: true,
//         // 🚀 THE SPEED BOOSTERS:
//         instructions: false, // Cuts download size by ~60%
//         maneuvers: false,    // Removes maneuver metadata
//         geometry_simplify: true, // Smooths micro-curves to reduce coordinate count
//         alternative_routes: {
//             target_count: 2, // Only ask for 2 alternatives instead of 3 or 4
//             weight_factor: 1.2
//         }
//     };

//     const res = await fetch(url, {
//         method: 'POST',
//         headers: {
//             'Authorization': API_KEY,
//             'Content-Type': 'application/json; charset=utf-8'
//         },
//         body: JSON.stringify(requestBody)
//     });

//     if (!res.ok) {
//         const errorData = await res.json().catch(() => ({}));
//         console.error("ORS API Error Details:", errorData);
//         throw new Error(`Routing failed: ${res.status}`);
//     }
    
//     return await res.json(); 
// }