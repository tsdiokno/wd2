import { MapManager } from './map.js';
import { geocodeSearch, getRoute } from './api.js';
import { analyzeTerrainRoute } from './calculator.js';

document.body.classList.add('dark-theme'); // Dark mode by default!

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
    sheetToggle: document.getElementById('sheet-toggle'),
    btnTheme: document.getElementById('btn-theme'),
    btnOrientation: document.getElementById('btn-orientation')
};

// Native-looking SVG icons for the 3 navigation states
const navIcons = {
    free: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
    tracking: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
    compass: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>`
};

// Compass Smoothing Variables
let smoothedHeading = 0;
const COMPASS_ALPHA = 0.15; // Low-pass filter factor (lower = smoother but slightly delayed)
const COMPASS_THRESHOLD = 1.0; // Minimum degree change to trigger a screen update

// 1. Add this variable near the top of app.js (under state and els)
let currentRouteController = null;

async function calculateRoute() {
    if (!state.start?.lat || !state.end?.lat) {
        els.bottomSheet.classList.add('hidden');
        mapManager.clearRoute();
        return; 
    }

    // 2. Kill the previous API request if it's still running
    if (currentRouteController) {
        currentRouteController.abort(); 
    }
    // Create a new kill-switch for THIS specific request
    currentRouteController = new AbortController();

    showSheetState('loading');
    
    try {
        // 3. Pass the signal to your API function 
        // (You will need to update api.js to accept this signal in its fetch call!)
        const data = await getRoute(state.start, state.end, currentRouteController.signal);
        
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
        // 4. Ignore errors that were caused by us intentionally aborting the fetch
        if (error.name === 'AbortError') {
            console.log("Previous route calculation cancelled.");
            return; 
        }

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

const mapManager = new MapManager('map');

// --- 1. Compass State & SVG Icons ---
let compassInitialized = false;

const iconNorthUp = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
const iconHeadingUp = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>`;

// --- 2. Safari iOS 13+ Permission Flow ---
async function requestAndStartCompass() {
    if (compassInitialized) return true;

    // Check if we are on an Apple device requiring explicit permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                compassInitialized = true;
                return true;
            } else {
                alert("Compass access denied. Check your Safari settings.");
                return false;
            }
        } catch (error) {
            console.error("Compass permission error:", error);
            return false;
        }
    } else {
        // Non-iOS devices (Android/Desktop) don't require the permission prompt
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        compassInitialized = true;
        return true;
    }
}

// --- 3. The Filtered Compass Engine ---
function handleDeviceOrientation(e) {
    let rawHeading = e.webkitCompassHeading;
    if (rawHeading === undefined && e.alpha !== null) {
        rawHeading = Math.abs(e.alpha - 360);
    }

    if (rawHeading !== undefined) {
        // Shortest path calculation to prevent 360-degree snap spins
        let diff = (rawHeading - smoothedHeading + 180) % 360 - 180;
        diff = diff < -180 ? diff + 360 : diff;

        if (Math.abs(diff) > COMPASS_THRESHOLD) {
            // Apply Low-Pass Filter
            smoothedHeading = (smoothedHeading + diff * COMPASS_ALPHA + 360) % 360;

            // Always rotate the blue marker cone
            mapManager.updateUserHeading(smoothedHeading);

            // If active, dynamically rotate the entire map canvas
            if (mapManager.trackingMode === 'heading-up') {
                mapManager.map.jumpTo({ bearing: smoothedHeading });
            }
        }
    }
}

function init() {
    setupEventListeners();

    // Device Compass Tracker with Low-Pass Filter
    window.addEventListener('deviceorientation', (e) => {
        let rawHeading = e.webkitCompassHeading;
        if (rawHeading === undefined && e.alpha !== null) {
            rawHeading = Math.abs(e.alpha - 360);
        }

        if (rawHeading !== undefined) {
            // 1. Calculate the shortest path difference to prevent 359° -> 1° wild spinning
            let diff = (rawHeading - smoothedHeading + 180) % 360 - 180;
            diff = diff < -180 ? diff + 360 : diff;

            // 2. Deadzone Threshold: Ignore micro-jitters
            if (Math.abs(diff) > COMPASS_THRESHOLD) {
                // 3. Apply Low-Pass Filter to smooth out sudden sensor spikes
                smoothedHeading = (smoothedHeading + diff * COMPASS_ALPHA + 360) % 360;

                // ALWAYS rotate the blue cone on the map
                mapManager.updateUserHeading(smoothedHeading);

                // ONLY rotate the entire map if they explicitly clicked into Compass mode
                if (mapManager.trackingMode === 'heading-up') {
                    // Use jumpTo instead of easeTo because our math is already handling the smoothing.
                    // Using easeTo on top of a filtered sensor causes "rubber-banding" lag.
                    mapManager.map.jumpTo({
                        bearing: smoothedHeading
                    });
                }
            }
        }
    });
    
    // Map tap assignment (sets start if empty, else end)
    mapManager.onClick((lat, lng) => {
        if (!state.start) {
            updateLocation('start', { lat, lng, label: 'Dropped Pin (Start)' });
        } else if (!state.end) {
            updateLocation('end', { lat, lng, label: 'Dropped Pin (End)' });
        }
    });

    // 🚀 NEW: Auto-center on the user's real location on boot
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                
                // 1. Drop the blue dot on their current location
                mapManager.updateLivePosition(lat, lng);
                
                // 2. Fly the camera smoothly to their location
                mapManager.map.flyTo({
                    center: [lng, lat],
                    zoom: 16, // A nice, tight neighborhood zoom level
                    duration: 2000, // 2-second cinematic sweep
                    essential: true
                });
            },
            (err) => {
                console.warn("Initial location fetch denied or failed:", err);
                // If they deny GPS permissions, it just stays safely at the default coordinates
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
}

// Helper function for iOS Compass Permission
async function requestCompassPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            return permission === 'granted';
        } catch (error) {
            console.error("Compass tracking error:", error);
            return false;
        }
    }
    return true; // Android/Desktop doesn't require explicit popup
}

function setupEventListeners() {

    // Toggle Light/Dark Mode
    if (els.btnTheme) {
        els.btnTheme.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark-theme');
            const newTheme = isDark ? 'light' : 'dark';
            
            // 1. Toggle CSS on the page
            document.body.classList.toggle('dark-theme');
            
            // 2. Change the map tiles
            mapManager.setTheme(newTheme);
            
            // 3. Wait for the new map tiles to load, then quickly re-draw pins and route
            mapManager.map.once('styledata', () => {
                if (state.start) mapManager.setMarker('start', state.start.lat, state.start.lng);
                if (state.end) mapManager.setMarker('end', state.end.lat, state.end.lng);
                if (state.end && state.start) calculateRoute(); 
            });
        });
    }

    els.btnSwap.addEventListener('click', () => {
        const temp = state.start;
        updateLocation('start', state.end);
        updateLocation('end', temp);
    });

    // Set the initial icon
    els.btnMyLoc.innerHTML = '📍';
    
    // Reset UI if user manually drags map
    window.addEventListener('tracking-broken', () => {
        els.btnMyLoc.innerHTML = navIcons.free;
        els.btnMyLoc.style.color = "var(--text-primary)";
    });

    // BUTTON A: GPS Location (Only handles centering the user)
els.btnMyLoc.addEventListener('click', () => {
    // Start GPS if it isn't running
    if (!state.start || state.start.label !== "Live Tracking...") {
        els.inputStart.value = "Locating...";
        navigator.geolocation.getCurrentPosition(
            (pos) => updateLocation('start', { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Live Tracking...' }),
            (err) => { els.inputStart.value = state.start ? state.start.label : ""; },
            { enableHighAccuracy: true }
        );
    }

    if (!mapManager.watchId && navigator.geolocation) {
        mapManager.watchId = navigator.geolocation.watchPosition(
            (pos) => mapManager.updateLivePosition(pos.coords.latitude, pos.coords.longitude),
            (err) => console.warn(err),
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    }

    // Force map to pan to the current known location
    if (mapManager.liveMarker) {
        const lngLat = mapManager.liveMarker.getLngLat();
        mapManager.map.panTo(lngLat, { duration: 800 });
    }
});

// BUTTON B: Orientation Toggle (Only handles map rotation & permissions)
if (els.btnOrientation) {
    // Default MapLibre to standard North-Up internally
    mapManager.setTrackingMode('north-up'); 
    
    els.btnOrientation.addEventListener('click', async () => {
        const hasAccess = await requestAndStartCompass();
        if (!hasAccess) return;

        if (mapManager.trackingMode === 'north-up') {
            // Switch to Heading-Up
            mapManager.setTrackingMode('heading-up');
            els.btnOrientation.innerHTML = iconHeadingUp;
            els.btnOrientation.style.color = "#ff9500"; // Orange active state
        } else {
            // Switch to North-Up
            mapManager.setTrackingMode('north-up');
            els.btnOrientation.innerHTML = iconNorthUp;
            els.btnOrientation.style.color = "var(--text-primary)"; // Reset color
        }
    });
}

    // Reset UI if user manually drags map
    window.addEventListener('tracking-broken', () => {
        els.btnMyLoc.innerHTML = '📍';
        els.btnMyLoc.style.backgroundColor = ""; 
        els.btnMyLoc.style.color = "";
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

function showSheetState(view) {
    // 1. Unhide the sheet container, but DO NOT automatically remove 'collapsed'
    els.bottomSheet.classList.remove('hidden');

    // 2. Hide all internal content first
    els.loadingState.classList.add('hidden');
    els.routeDetails.classList.add('hidden');
    els.errorState.classList.add('hidden');

    // 3. Show only the specific view requested
    if (view === 'loading') {
        els.loadingState.classList.remove('hidden');
        
        // Only force the sheet to pop up if it's a completely NEW search
        // (meaning route details aren't actively populated yet)
        if (!state.end) {
            els.bottomSheet.classList.remove('collapsed');
        }
    } 
    else if (view === 'details') {
        els.routeDetails.classList.remove('hidden');
    } 
    else if (view === 'error') {
        els.errorState.classList.remove('hidden');
        // Always force the sheet open to show an error so the user isn't confused
        els.bottomSheet.classList.remove('collapsed'); 
    }
}

function updateRouteUI(stats) {
    // Correctly turns 74 into 1h 14m
    const formatTime = (totalMin) => {
        if (totalMin < 60) return `${Math.round(totalMin)}m`;
        const h = Math.floor(totalMin / 60);
        const m = Math.round(totalMin % 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    safeSetText('ui-time', formatTime(stats.finalTimeMin));
    safeSetText('ui-distance', `${stats.distanceKm.toFixed(2)} km`);
    safeSetText('ui-difficulty', stats.difficulty);
    safeSetText('ui-speed', `${stats.averageSpeedKmh.toFixed(1)} km/h`);
    safeSetText('ui-ascent', `↗ ${Math.round(stats.ascentMeters)} m`);
    safeSetText('ui-descent', `↘ ${Math.round(stats.descentMeters)} m`);
    safeSetText('ui-about-route', stats.summary);
    safeSetText('ui-calories', Math.round(stats.calories));

    // Universal application for the breakdown list
    const b = stats.breakdown;
    safeSetText('bd-base', formatTime(b.baseTimeMin));
    safeSetText('bd-elev', `+${formatTime(b.elevPenaltyMin)}`);
    safeSetText('bd-climb', `+${formatTime(b.climbPenaltyMin)}`);
    safeSetText('bd-recovery', `-${formatTime(b.recoveryMin)}`);
    safeSetText('bd-fatigue', `+${formatTime(b.fatigueMin)}`);
    safeSetText('bd-total', formatTime(stats.finalTimeMin));
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