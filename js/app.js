import { MapManager } from './map.js';
import { geocodeSearch, getRoute } from './api.js';
import { analyzeTerrainRoute } from './calculator.js';

// Application State
const state = {
    start: null, // { lat, lng, label }
    end: null
};

// UI Elements
const els = {
    inputStart: document.getElementById('input-start'),
    inputEnd: document.getElementById('input-end'),
    autoStart: document.getElementById('autocomplete-start'),
    autoEnd: document.getElementById('autocomplete-end'),
    btnSwap: document.getElementById('btn-swap'),
    btnMyLoc: document.getElementById('btn-my-location'),
    bottomSheet: document.getElementById('bottom-sheet'),
    loadingState: document.getElementById('loading-state'),
    routeDetails: document.getElementById('route-details'),
    errorState: document.getElementById('error-state'),
    errorMsg: document.getElementById('ui-error-message'),
    sheetToggle: document.getElementById('sheet-toggle')
};

const mapManager = new MapManager('map');

function init() {
    setupEventListeners();
    
    // Map tap assignment (sets start if empty, else end)
    mapManager.onClick((e) => {
        const { lat, lng } = e.latlng;
        if (!state.start) {
            updateLocation('start', { lat, lng, label: 'Dropped Pin (Start)' });
        } else if (!state.end) {
            updateLocation('end', { lat, lng, label: 'Dropped Pin (End)' });
        }
    });
}

function setupEventListeners() {
    els.btnSwap.addEventListener('click', () => {
        const temp = state.start;
        updateLocation('start', state.end);
        updateLocation('end', temp);
    });

    els.btnMyLoc.addEventListener('click', () => {
        if (navigator.geolocation) {
            els.inputStart.value = "Locating...";
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    updateLocation('start', {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        label: 'My Location'
                    });
                },
                (err) => {
                    console.warn("Geolocation denied or failed.", err);
                    alert("Unable to retrieve location. Please check your browser permissions.");
                    els.inputStart.value = state.start ? state.start.label : "";
                }
            );
        }
    });

    // Toggle the bottom sheet up and down
    els.sheetToggle.addEventListener('click', () => {
        // Only toggle if the sheet isn't completely hidden
        if (!els.bottomSheet.classList.contains('hidden')) {
            els.bottomSheet.classList.toggle('collapsed');
        }
    });

    setupAutocomplete(els.inputStart, els.autoStart, 'start');
    setupAutocomplete(els.inputEnd, els.autoEnd, 'end');
}

// Debounce utility for autocomplete
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function setupAutocomplete(inputEl, listEl, type) {
    const handleInput = debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 3) {
            listEl.classList.remove('active');
            return;
        }

        // --- NEW: Coordinate Interceptor ---
        // Checks if the string looks like "lat, lng" (e.g., 14.6760, 121.0437)
        const coordRegex = /^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/;
        const match = query.match(coordRegex);

        if (match) {
            // If it's a coordinate, bypass the API and drop the pin immediately
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            
            updateLocation(type, {
                lat: lat,
                lng: lng,
                label: `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
            });
            
            listEl.classList.remove('active');
            return; // Stop here, don't call Nominatim
        }
        // -----------------------------------

        // If it's not a coordinate, proceed with normal address search
        const results = await geocodeSearch(query);
        listEl.innerHTML = '';
        
        if (results.length > 0) {
            results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.textContent = item.display_name;
                div.addEventListener('click', () => {
                    updateLocation(type, {
                        lat: parseFloat(item.lat),
                        lng: parseFloat(item.lon),
                        label: item.display_name.split(',')[0]
                    });
                    listEl.classList.remove('active');
                });
                listEl.appendChild(div);
            });
            listEl.classList.add('active');
        } else {
            listEl.classList.remove('active');
        }
    }, 500);

    inputEl.addEventListener('input', handleInput);
    
    document.addEventListener('click', (e) => {
        if (e.target !== inputEl && e.target !== listEl) {
            listEl.classList.remove('active');
        }
    });
}

function updateLocation(type, data) {
    // 1. Save the new location to our application state
    state[type] = data;
    
    // 2. Figure out which text box to update
    const inputEl = type === 'start' ? els.inputStart : els.inputEnd;
    
    if (data) {
        // 3. Update the text box with the location name
        inputEl.value = data.label;
        
        // 4. Safely pass the coordinates to map.js to draw the pin
        mapManager.setMarker(type, data.lat, data.lng);
    } else {
        // If data is null (e.g., clearing the input), empty the text box
        inputEl.value = '';
    }

    // 5. Run the routing engine
    calculateRoute();
}

function handleMarkerDrag(type, latLng) {
    state[type] = {
        lat: latLng.lat,
        lng: latLng.lng,
        label: 'Dropped Pin'
    };
    const inputEl = type === 'start' ? els.inputStart : els.inputEnd;
    inputEl.value = 'Dropped Pin';
    calculateRoute();
}

async function calculateRoute() {
    // Guard clause: Prevent running if either point is missing
    if (!state.start?.lat || !state.end?.lat) {
        els.bottomSheet.classList.add('hidden');
        mapManager.clearRoute();
        return; 
    }

    showSheetState('loading');
    
    try {
        // 1. Get multiple route options from ORS
        const data = await getRoute(state.start, state.end);
        
        if (!data.features || data.features.length === 0) {
            throw new Error("No viable routes found.");
        }

        let bestRouteGeometry = null;
        let bestStats = null;
        let lowestTime = Infinity;

        // 2. Evaluate every route feature returned by ORS
        for (const feature of data.features) {
            const coordinates = feature.geometry.coordinates; 
            const distanceMeters = feature.properties.summary.distance;

            // Map ORS 3D coordinate arrays [lng, lat, elev] into our required object structure
            const elevationData = coordinates.map(coord => ({
                lng: coord[0],
                lat: coord[1],
                // If ORS drops elevation data for any reason, safely default to 0 (flat)
                elevation: coord.length > 2 ? coord[2] : 0 
            }));

            // 3. Run the physiological model
            const stats = analyzeTerrainRoute(elevationData, distanceMeters);

            // 4. Optimization: Keep only the physically fastest path
            if (stats.finalTimeMin < lowestTime) {
                lowestTime = stats.finalTimeMin;
                bestStats = stats;
                bestRouteGeometry = feature.geometry;
            }
        }

        if (!bestRouteGeometry) {
            throw new Error("Failed to evaluate route paths.");
        }

        // 5. Draw the most efficient route & Update UI
        mapManager.drawRoute(bestRouteGeometry);
        updateRouteUI(bestStats);
        showSheetState('details');

        // --- NEW GMAPS INTEGRATION ---
        const gmapsBtn = document.getElementById('btn-gmaps');
        if (gmapsBtn) {
            // Remove any old event listeners by cloning the button (cleanest vanilla JS approach)
            const newBtn = gmapsBtn.cloneNode(true);
            gmapsBtn.parentNode.replaceChild(newBtn, gmapsBtn);
            
            // Add the fresh listener with the current route's geometry
            newBtn.addEventListener('click', () => {
                openInGoogleMaps(state.start, state.end, bestRouteGeometry);
            });
        }

    } catch (error) {
        console.error("Routing Error:", error);
        if (els.errorMsg) {
            // Check if the error message contains our specific ORS limit error
            if (error.message.includes("2004") || error.message.includes("exceed the limits")) {
                els.errorMsg.textContent = "These locations are too far apart to calculate a walking route.";
            } else {
                els.errorMsg.textContent = "Route not found or unable to cross terrain.";
            }
        }
        showSheetState('error');
    }
}

function showSheetState(view) {
    // 1. Force the sheet to pop up immediately by removing both restrictor classes
    els.bottomSheet.classList.remove('hidden');
    els.bottomSheet.classList.remove('collapsed');

    // 2. Hide all internal content first
    els.loadingState.classList.add('hidden');
    els.routeDetails.classList.add('hidden');
    els.errorState.classList.add('hidden');

    // 3. Show only the specific view requested
    if (view === 'loading') {
        els.loadingState.classList.remove('hidden');
    } else if (view === 'details') {
        els.routeDetails.classList.remove('hidden');
    } else if (view === 'error') {
        els.errorState.classList.remove('hidden');
    }
}

function updateRouteUI(stats) {
    const formatTime = (min) => {
        if (min < 60) return `${Math.round(min)} min`;
        const h = Math.floor(min / 60);
        const m = Math.round(min % 60);
        return `${h} hr ${m} min`;
    };

    // Helper to prevent null reference crashes if HTML is modified
    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
        else console.warn(`UI Element missing in DOM: ${id}`);
    };

    // Update Primary UI
    safeSetText('ui-time', formatTime(stats.finalTimeMin));
    safeSetText('ui-distance', `${stats.distanceKm.toFixed(2)} km`);
    safeSetText('ui-difficulty', stats.difficulty);
    safeSetText('ui-speed', `${stats.averageSpeedKmh.toFixed(1)} km/h`);
    safeSetText('ui-ascent', `↗ ${Math.round(stats.ascentMeters)} m`);
    safeSetText('ui-descent', `↘ ${Math.round(stats.descentMeters)} m`);
    safeSetText('ui-about-route', stats.summary);
    safeSetText('ui-calories', Math.round(stats.calories));

    // Update Mathematical Breakdown
    const b = stats.breakdown;
    safeSetText('bd-base', `${Math.round(b.baseTimeMin)} min`);
    safeSetText('bd-elev', `+${Math.round(b.elevPenaltyMin)} min`);
    safeSetText('bd-climb', `+${Math.round(b.climbPenaltyMin)} min`);
    safeSetText('bd-recovery', `-${Math.round(b.recoveryMin)} min`);
    safeSetText('bd-fatigue', `+${Math.round(b.fatigueMin)} min`);
    safeSetText('bd-total', `${Math.round(stats.finalTimeMin)} min`);
}

// Boot up the application
document.addEventListener('DOMContentLoaded', init);

/**
 * Generates a Google Maps Directions URL using the official API schema.
 */
function openInGoogleMaps(start, end, geometry) {
    const coords = geometry.coordinates; // Array of [lng, lat]
    const waypoints = [];
    
    // REDUCE to 2 waypoints. This is usually enough to "bend" Google's route 
    // to match ours, while drastically reducing the chance of snapping to a POI.
    const waypointCount = 2; 
    
    if (coords.length > 10) {
        const step = Math.floor(coords.length / (waypointCount + 1));
        for(let i = 1; i <= waypointCount; i++) {
            const pt = coords[i * step];
            // Google Maps format: lat,lng
            waypoints.push(`${pt[1]},${pt[0]}`);
        }
    }

    const wpString = waypoints.length > 0 ? `&waypoints=${waypoints.join('|')}` : '';
    
    // Use the official cross-platform Google Maps intent URL
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}${wpString}&travelmode=walking`;
    
    // Open in new tab (triggers native app)
    window.open(gmapsUrl, '_blank');
}