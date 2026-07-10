import { MapManager } from './map.js';
import { geocodeSearch, getRoute, getWeather } from './api.js';
import { analyzeTerrainRoute } from './calculator.js';

// --- Status Manager ---
function setAppStatus(message, isError = false) {
    const sheet = document.getElementById('bottom-sheet');
    const statusState = document.getElementById('status-state');
    const statusText = document.getElementById('status-text');
    const spinner = document.getElementById('status-spinner');
    
    // Hide the actual content
    document.getElementById('global-context').classList.add('hidden');
    document.getElementById('route-options-container').classList.add('hidden');
    document.getElementById('route-details').classList.add('hidden');

    // Show the status state
    sheet.classList.remove('collapsed');
    statusState.classList.remove('hidden');
    
    statusText.textContent = message;
    spinner.style.display = isError ? 'none' : 'block';
}

// --- Idle Placeholder State ---
function setIdleState() {
    const sheet = document.getElementById('bottom-sheet');
    const statusState = document.getElementById('status-state');
    const statusText = document.getElementById('status-text');
    const spinner = document.getElementById('status-spinner');
    
    // 1. Hide the routing UI
    document.getElementById('global-context').classList.add('hidden');
    document.getElementById('route-options-container').classList.add('hidden');
    document.getElementById('route-details').classList.add('hidden');

    // 2. Show the idle text, hide the spinner
    statusState.classList.remove('hidden');
    spinner.style.display = 'none';
    statusText.textContent = "Set a destination to start your search.";
    
    // 3. REMOVE the collapsed class so the text is actually visible!
    sheet.classList.remove('collapsed');
    
    // (Optional) Remove the hidden class in case it was applied earlier
    sheet.classList.remove('hidden'); 
}

document.body.classList.add('dark-theme'); // Dark mode by default!

// Application State
const state = {
    start: null, // { lat, lng, label }
    end: null
};

// Global time formatter
function formatTime(totalMin) {
    if (totalMin < 60) return `${Math.round(totalMin)}m`;
    const h = Math.floor(totalMin / 60);
    const m = Math.round(totalMin % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

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
    btnTheme: document.getElementById('btn-theme')
};

// 1. Add this variable near the top of app.js (under state and els)
let currentRouteController = null;

// Data-driven, concise insights
function generateSmartImpact(route, fastestRoute, weather) {
    const timeDiff = Math.round(route.stats.finalTimeMin - fastestRoute.stats.finalTimeMin);
    const savedClimb = Math.round(fastestRoute.stats.ascentMeters - route.stats.ascentMeters);
    const penalties = Math.round(route.stats.breakdown.elevPenaltyMin + route.stats.breakdown.climbPenaltyMin);
    
    const isRain = weather && weather.rain > 0;
    const isHot = weather && weather.feelsLike > 33;
    const hasHills = route.stats.ascentMeters > 15;

    // --- RAIN LOGIC (Exposure is the only thing that matters) ---
    if (isRain) {
        if (route.label === "Fastest") {
            return hasHills 
                ? `Shortest exposure to the rain. The ${Math.round(route.stats.ascentMeters)}m climb is worth it to get to shelter faster.`
                : `Quickest direct path. Minimizes your time out in the rain.`;
        }
        return `Not recommended. Bypasses some terrain, but keeps you in the rain for an extra ${timeDiff} minutes.`;
    }

    // --- HEAT LOGIC (Effort = Sweat) ---
    if (isHot) {
        if (route.label === "Fastest") {
            return hasHills 
                ? `Quickest, but tackling a ${Math.round(route.stats.ascentMeters)}m climb in ${weather.feelsLike}°C heat requires serious effort. You will sweat.`
                : `Quickest direct path to get out of the heat. Mostly flat.`;
        }
        if (route.label === "Flattest" && savedClimb > 10) {
            return `Adds ${timeDiff} mins, but saving ${savedClimb}m of climbing keeps your heart rate down in this heat.`;
        }
        return `Adds ${timeDiff} mins to your walk with no significant elevation relief.`;
    }

    // --- NORMAL WEATHER LOGIC (Focus on physical penalties) ---
    if (route.label === "Fastest") {
        return penalties > 1
            ? `Most direct route, though steep grades will add ~${penalties} minutes of fatigue penalty to your pace.`
            : `Quickest route. Relatively flat with minimal terrain slowing you down.`;
    }
    
    if (route.label === "Flattest") {
        return `Takes ${timeDiff} mins longer, but avoiding the hills allows for a much more relaxed, steady baseline pace.`;
    }

    return `Secondary route. Adds ${timeDiff} mins and ${Math.round(route.stats.ascentMeters)}m of climbing compared to the fastest path.`;
}

async function calculateRoute() {
    if (
        !state.start || 
        !state.end || 
        typeof state.start.lat !== 'number' || 
        typeof state.start.lng !== 'number' || 
        typeof state.end.lat !== 'number' || 
        typeof state.end.lng !== 'number'
    ) {
        return; 
    }

    // 1. Check for basic internet connection first
    if (!navigator.onLine) {
        setAppStatus("No network connection. Please check your data.", true);
        return;
    }

    // 2. Take over the UI immediately
    setAppStatus("Fetching route geometry and weather...");

    try {
        const [routeData, weatherData] = await Promise.all([
            getRoute(state.start, state.end),
            getWeather(state.start.lat, state.start.lng)
        ]);
        
        if (!routeData || !routeData.features || routeData.features.length === 0) {
            setAppStatus("No pedestrian routes found for this area.", true);
            return;
        }

        // Optional UX trick: If you want to show that it's doing math, you can update the text here 
        // setAppStatus("Analyzing 3D terrain...");

        let processedRoutes = routeData.features.map(feature => {
            const elevationData = feature.geometry.coordinates.map(c => ({
                lng: c[0],
                lat: c[1],
                elevation: c[2] || 0 
            }));
            const totalDistanceMeters = feature.properties.summary.distance;

            return {
                geometry: feature.geometry,
                stats: analyzeTerrainRoute(elevationData, totalDistanceMeters)
            };
        });

        processedRoutes.sort((a, b) => a.stats.finalTimeMin - b.stats.finalTimeMin);
        processedRoutes[0].label = "Fastest";

        if (processedRoutes.length > 1) {
            const remaining = processedRoutes.slice(1);
            remaining.sort((a, b) => a.stats.ascentMeters - b.stats.ascentMeters);
            
            if (remaining[0].stats.ascentMeters < processedRoutes[0].stats.ascentMeters - 10) {
                remaining[0].label = "Flattest";
                if (remaining[1]) remaining[1].label = "Alternative";
            } else {
                remaining[0].label = "Alternative 1";
                if (remaining[1]) remaining[1].label = "Alternative 2";
            }
        }

        // 3. Clear the loading state and render the actual UI
        document.getElementById('status-state').classList.add('hidden');
        document.getElementById('route-options-container').classList.remove('hidden');
        
        renderRouteUI(processedRoutes, weatherData);
        mapManager.drawRoute(processedRoutes[0].geometry);

    } catch (err) {
        console.error("Routing error:", err);
        setAppStatus("Unable to calculate route. Try dropping a closer pin.", true);
    }
}

// 7. Render the UI
function renderRouteUI(routes, weather) {
    const sheet = document.getElementById('bottom-sheet');
    const container = document.getElementById('route-options-container');
    const contextBar = document.getElementById('global-context');
    const weatherText = document.getElementById('weather-text');
    const weatherIcon = document.getElementById('weather-icon');

    // Update Weather Bar
    if (weather) {
        contextBar.classList.remove('hidden');
        if (weather.rain > 0) {
            weatherIcon.textContent = "🌧";
            weatherText.textContent = `Heavy Rain • ${weather.temp}°C`;
        } else if (weather.feelsLike > 33) {
            weatherIcon.textContent = "☀️";
            weatherText.textContent = `${weather.temp}°C (Feels like ${weather.feelsLike}°C) • Hot`;
        } else {
            weatherIcon.textContent = "⛅️";
            weatherText.textContent = `${weather.temp}°C • Comfortable`;
        }
    }

    // Render Route Cards
    container.innerHTML = "";
    const fastestRoute = routes[0];

    let activeRouteCoords = routes[0].geometry.coordinates;

    routes.forEach((route, index) => {
        const card = document.createElement('div');
        card.className = `route-card ${index === 0 ? 'selected' : ''}`;
        
        const timeStr = formatTime(route.stats.finalTimeMin);
        const distStr = `${route.stats.distanceKm.toFixed(2)} km`;
        const ascStr = `↗ ${Math.round(route.stats.ascentMeters)}m`;
        
        // NEW: Grab the calories directly from your advanced calculator
        const calStr = `🔥 ${Math.round(route.stats.calories)} kcal`; 
        
        const icon = route.label === "Fastest" ? "⚡️ " : (route.label === "Flattest" ? "😌 " : "🔀 ");
        let diffColor = "#10b981"; // Easy (Green)
        if (route.stats.difficulty === "Moderate") diffColor = "#f59e0b"; // Orange
        if (route.stats.difficulty === "Hard") diffColor = "#ef4444"; // Red

        const impact = generateSmartImpact(route, fastestRoute, weather);

        // Inject the calories into the metrics line
        card.innerHTML = `
            <div class="route-header">
                <span class="route-title">${icon}${route.label}</span>
                <span class="badge" style="background-color: ${diffColor}20; color: ${diffColor};">${route.stats.difficulty}</span>
            </div>
            <div class="route-metrics" style="margin-bottom: 6px;">
                ${timeStr} • ${distStr} • ${ascStr} • ${calStr}
            </div>
            <div class="route-impact">${impact}</div>
        `;

        // Add Click Listener
        card.addEventListener('click', () => {
            document.querySelectorAll('.route-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            
            mapManager.drawRoute(route.geometry);
            activeRouteCoords = route.geometry.coordinates;
            
            // Note: We deleted the ui-ascent/ui-descent DOM updates from here!
            document.getElementById('route-details').classList.remove('hidden');
        });

        container.appendChild(card);
    });

    // Note: Also delete the ui-ascent/ui-descent DOM updates that were sitting outside the loop!

    const btnStartNav = document.getElementById('btn-start-nav');

    btnStartNav.onclick = () => {
        openInGoogleMaps(activeRouteCoords);
    };

    // Populate initial nerd stats for the default route
    // document.getElementById('ui-ascent').textContent = `${Math.round(routes[0].stats.ascentMeters)} m`;
    // document.getElementById('ui-descent').textContent = `${Math.round(routes[0].stats.descentMeters)} m`;
    document.getElementById('route-details').classList.remove('hidden');

    sheet.classList.remove('collapsed');
}

const mapManager = new MapManager('map');

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

    // Initialize the app state
    setIdleState();
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

    els.inputEnd.addEventListener('input', (e) => {
        if (e.target.value.trim() === '') {
            state.end = null;
            mapManager.clearMarker('end');
            mapManager.clearRoute();
            setIdleState(); // Revert to the placeholder!
        }
    });

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

    // CLEANED: Single-use GPS fetch to populate the Start field
    els.btnMyLoc.addEventListener('click', () => {
        els.inputStart.value = "Locating...";
        
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                
                // This drops the standard blue Start pin and calculates if an End pin exists
                updateLocation('start', { lat, lng, label: 'Current Location' });
                
                // Gently pan the map to their location
                mapManager.map.flyTo({ center: [lng, lat], zoom: 16 });
            },
            (err) => {
                console.warn("Location error:", err);
                els.inputStart.value = state.start ? state.start.label : "";
                alert("Unable to retrieve location. Please check your browser permissions.");
            },
            { enableHighAccuracy: true }
        );
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

// Forces Google Maps to follow our exact route by dropping breadcrumbs
function openInGoogleMaps(coords) {
    // GeoJSON is [lng, lat], Google Maps expects [lat, lng]
    const origin = `${coords[0][1]},${coords[0][0]}`;
    const dest = `${coords[coords.length - 1][1]},${coords[coords.length - 1][0]}`;

    // Sample exactly 5 intermediate waypoints evenly spaced along the route
    const waypoints = [];
    const numWaypoints = 5;
    
    if (coords.length > 10) {
        const step = Math.floor(coords.length / (numWaypoints + 1));
        for (let i = 1; i <= numWaypoints; i++) {
            const pt = coords[i * step];
            waypoints.push(`${pt[1]},${pt[0]}`); // Flip to lat,lng
        }
    }
    
    // Construct the universal Google Maps Intent URL
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=walking&dir_action=navigate`;
    
    if (waypoints.length > 0) {
        // Waypoints must be separated by the | character
        url += `&waypoints=${waypoints.join('|')}`;
    }
    
    // Opens the Google Maps App on mobile, or a new tab on desktop
    window.open(url, '_blank');
}