export class MapManager {
    constructor(containerId) {
        this.currentTheme = 'dark'; // Dark mode by default
        
        this.map = new maplibregl.Map({
            container: containerId,
            style: this.getStyleUrl(this.currentTheme), 
            center: [120.98, 14.70], 
            zoom: 15,
            pitch: 0,
            bearing: 0
        });

        // QUALITY OF LIFE: Add Compass (click to snap North) and Zoom controls
        this.map.addControl(new maplibregl.NavigationControl({
            visualizePitch: true, // Compass icon tilts when the map is in 3D mode
            showZoom: true,
            showCompass: true
        }), 'top-right');

        this.liveMarker = null;
        this.markers = {};
        this.trackingMode = 'free'; 
        this.watchId = null;

        // 2. Compass Device Orientation Listener
        window.addEventListener('deviceorientation', (e) => {
            if (this.trackingMode !== 'heading-up') return;

            let heading = e.webkitCompassHeading;
            if (heading === undefined && e.alpha !== null) {
                heading = Math.abs(e.alpha - 360);
            }

            if (heading !== undefined) {
                this.map.easeTo({
                    bearing: heading,
                    duration: 100, // Short duration for responsive real-time turning
                    easing: (t) => t
                });
            }
        });

        // 3. Gesture Interceptors: Drops lock back to 'free' if user drags or spins map manually
        const breakLock = () => {
            if (this.trackingMode === 'heading-up') {
                this.setTrackingMode('free');
                window.dispatchEvent(new Event('tracking-broken')); 
            }
        };

        this.map.on('dragstart', breakLock);
        this.map.on('rotatestart', breakLock);
    }

    // Helper to switch MapTiler styles
    getStyleUrl(theme) {
        const key = 'ohKQ0BopPAxViKTMGueU'; 
        return theme === 'dark' 
            ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${key}`
            : `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
    }

    setTheme(theme) {
        this.currentTheme = theme;
        this.map.setStyle(this.getStyleUrl(theme));
        // Note: MapLibre wipes custom route layers when changing base styles. 
        // We will tell app.js to re-draw the pins/route after the style updates!
    }

    onClick(callback) {
        this.map.on('click', (e) => {
            callback(e.lngLat.lat, e.lngLat.lng);
        });
    }

    setMarker(type, lat, lng) {
        // 1. Force the inputs to be true numbers
        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);

        // 2. Shield: If they aren't valid numbers, stop immediately
        if (isNaN(numLat) || isNaN(numLng)) {
            console.warn(`Attempted to set ${type} marker with invalid coordinates:`, lat, lng);
            return; 
        }

        if (this.markers[type]) {
            this.markers[type].remove();
        }

        // 3. MapLibre requires Lng, Lat order!
        this.markers[type] = new maplibregl.Marker()
            .setLngLat([numLng, numLat]) 
            .addTo(this.map);
    }

    // Clears the route by emptying the data, rather than destroying the WebGL layer
    clearRoute() {
        const source = this.map.getSource('route-source');
        if (source) {
            // Feed it an empty GeoJSON object to make the line instantly disappear
            source.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
    }

    // UPDATED: Now automatically pans and zooms to fit the whole route
    drawRoute(geometry) {
        const source = this.map.getSource('route-source');
        
        if (source) {
            source.setData(geometry);
        } else {
            this.map.addSource('route-source', { 'type': 'geojson', 'data': geometry });
            this.map.addLayer({
                'id': 'route-layer',
                'type': 'line',
                'source': 'route-source',
                'layout': { 'line-join': 'round', 'line-cap': 'round' },
                'paint': { 'line-color': '#007AFF', 'line-width': 5, 'line-opacity': 0.8 }
            });
        }

        // AUTO-FIT: Calculate bounding box of the entire route
        const coords = geometry.coordinates;
        const bounds = coords.reduce((acc, coord) => {
            return [
                [Math.min(acc[0][0], coord[0]), Math.min(acc[0][1], coord[1])], // Southwest
                [Math.max(acc[1][0], coord[0]), Math.max(acc[1][1], coord[1])]  // Northeast
            ];
        }, [[coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]]]);

        // Smoothly fly to the route bounds, leaving 50px of padding from the screen edges
        this.map.fitBounds(bounds, { padding: 50, duration: 1000 });
    }

    // 1. Update the tracking state manager
    setTrackingMode(mode) {
        this.trackingMode = mode;
        if (mode === 'heading-up') {
            // Compass Mode: Tilt for 3D perspective
            this.map.easeTo({ pitch: 45, duration: 500 });
        } else if (mode === 'north-up') {
            // Standard Mode: Snap back to flat, North-Up
            this.map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
        }
    }

    // 2. Build the live marker with the compass cone
    updateLivePosition(lat, lng) {
        if (!this.liveMarker) {
            const el = document.createElement('div');
            el.className = 'live-tracker-dot';
            
            const headingArrow = document.createElement('div');
            headingArrow.className = 'live-tracker-heading';
            headingArrow.id = 'heading-arrow';
            el.appendChild(headingArrow);

            this.liveMarker = new maplibregl.Marker({ 
                element: el,
                rotationAlignment: 'map' // Glues the arrow rotation to Map North
            })
            .setLngLat([lng, lat])
            .addTo(this.map);
        } else {
            this.liveMarker.setLngLat([lng, lat]);
        }

        // Only lock the camera if we are in one of the active tracking modes
        if (this.trackingMode === 'tracking' || this.trackingMode === 'heading-up') {
            this.map.panTo([lng, lat], { duration: 800 });
        }
    }

    // 3. New Function: Rotates the arrow when the phone spins
    updateUserHeading(heading) {
        if (this.liveMarker) {
            const arrow = this.liveMarker.getElement().querySelector('#heading-arrow');
            if (arrow) arrow.style.display = 'block'; // Show the cone now that we have data
            
            this.liveMarker.setRotation(heading); // Point it at true heading
        }
    }
}