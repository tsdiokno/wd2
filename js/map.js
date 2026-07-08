export class MapManager {
    constructor(containerId) {
        this.map = new maplibregl.Map({
            container: containerId,
            // MapTiler's street map
            style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=ohKQ0BopPAxViKTMGueU', 
            center: [120.98, 14.70], // Centered near Valenzuela
            zoom: 15,
            pitch: 0,
            bearing: 0
        });
        
        this.liveMarker = null;
        this.markers = {};

        // 1. Navigation State Variable (2-mode system)
        this.trackingMode = 'free'; // 'free' or 'heading-up'
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

    // Hot-swaps new route data into the existing GPU pipeline
    drawRoute(geometry) {
        const source = this.map.getSource('route-source');
        
        if (source) {
            // 🚀 LIGHTNING FAST: The layer exists, just pipe new data to it
            source.setData(geometry);
        } else {
            // FIRST TIME ONLY: Set up the WebGL source and layer
            this.map.addSource('route-source', {
                'type': 'geojson',
                'data': geometry 
            });

            this.map.addLayer({
                'id': 'route-layer',
                'type': 'line',
                'source': 'route-source',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#007AFF',
                    'line-width': 5,
                    'line-opacity': 0.8
                }
            });
        }
    }

    /**
     * Toggles tracking mechanics, view pitch, and clears streams when dropped
     */
    setTrackingMode(mode) {
        this.trackingMode = mode;

        if (mode === 'heading-up') {
            // Apply a slight tilt for forward perspective visibility
            this.map.easeTo({ pitch: 45, duration: 500 });
        } else if (mode === 'free') {
            // Turn off GPS watch tracker to save battery
            if (this.watchId) {
                navigator.geolocation.clearWatch(this.watchId);
                this.watchId = null;
            }
            // Restore a flat standard 2D perspective
            this.map.easeTo({ pitch: 0, duration: 500 });
        }
    }

    /**
     * Dedicated live tracking target updater. Handles camera focus transitions.
     */
    updateLivePosition(lat, lng) {
        if (!this.liveMarker) {
            // Distinct user localization dot layout
            const el = document.createElement('div');
            el.style.width = '16px';
            el.style.height = '16px';
            el.style.backgroundColor = '#007AFF';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid white';
            el.style.boxShadow = '0 0 6px rgba(0,0,0,0.4)';

            this.liveMarker = new maplibregl.Marker({ element: el })
                .setLngLat([lng, lat])
                .addTo(this.map);
        } else {
            this.liveMarker.setLngLat([lng, lat]);
        }

        // Lock map frame center over coordinates exclusively when Heading-Up tracking is operational
        if (this.trackingMode === 'heading-up') {
            this.map.panTo([lng, lat], { duration: 800 });
        }
    }
}