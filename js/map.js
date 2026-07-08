export class MapManager {
    constructor(containerId) {
        this.map = new maplibregl.Map({
            container: containerId,
            // Swap the demo tiles for MapTiler's gorgeous street map
            style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=ohKQ0BopPAxViKTMGueU', 
            center: [120.98, 14.70], // Centered near Valenzuela
            zoom: 15,
            pitch: 0,
            bearing: 0
        });
        
        this.liveMarker = null;
        this.markers = {};
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

    // Clears the current route line from the map
    clearRoute() {
        if (this.map.getSource('route-source')) {
            this.map.removeLayer('route-layer');
            this.map.removeSource('route-source');
        }
    }

    // Draws the new route line and zooms the map to fit it
    drawRoute(geometry) {
        this.clearRoute(); // Always clear the old route first

        // 1. Add the raw coordinate data to the map
        this.map.addSource('route-source', {
            'type': 'geojson',
            'data': geometry 
        });

        // 2. Tell the map how to visually style that data
        this.map.addLayer({
            'id': 'route-layer',
            'type': 'line',
            'source': 'route-source',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-color': '#007AFF', // iOS Blue
                'line-width': 5,
                'line-opacity': 0.8
            }
        });

        // Optional: Zoom map to fit route in MapLibre
        // Note: Requires turf.js or calculating bounding box manually for MapLibre
    }

    /**
     * Updates the map tracking perspective smoothly using the device compass
     */
    updateNavigationPerspective(lat, lng, heading) {
        // Move the marker location
        if (!this.liveMarker) {
            this.liveMarker = new maplibregl.Marker()
                .setLngLat([lng, lat])
                .addTo(this.map);
        } else {
            this.liveMarker.setLngLat([lng, lat]);
        }

        // The core navigation magic:
        // Automatically smoothly spins the entire map grid underneath the user 
        // while the engine dynamically forces all street text to stay right-side up.
        this.map.easeTo({
            center: [lng, lat],
            bearing: heading, // Set the map rotation to match user heading
            duration: 200,    // Smooth out micro-jitters over 200ms
            easing: (t) => t  // Linear easing for fluid real-time movement
        });
    }
}