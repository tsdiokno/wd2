export class MapManager {
    constructor(containerId) {
        this.currentTheme = 'dark'; 
        
        this.map = new maplibregl.Map({
            container: containerId,
            style: this.getStyleUrl(this.currentTheme), 
            center: [120.98, 14.70], 
            zoom: 15,
            pitch: 0,
            bearing: 0
        });
        
        // Keep the standard map controls, but remove 3D pitch visualization
        this.map.addControl(new maplibregl.NavigationControl({
            visualizePitch: false, 
            showZoom: true,
            showCompass: true
        }), 'top-right');

        this.markers = {}; // We only need the standard start/end markers now
    }

    getStyleUrl(theme) {
        const key = 'ohKQ0BopPAxViKTMGueU'; 
        return theme === 'dark' 
            ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${key}`
            : `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
    }

    setTheme(theme) {
        this.currentTheme = theme;
        this.map.setStyle(this.getStyleUrl(theme));
    }

    onClick(callback) {
        this.map.on('click', (e) => {
            callback(e.lngLat.lat, e.lngLat.lng);
        });
    }

    setMarker(type, lat, lng) {
        if (this.markers[type]) {
            this.markers[type].remove();
        }
        
        const color = type === 'start' ? '#2563eb' : '#ef4444';
        this.markers[type] = new maplibregl.Marker({ color })
            .setLngLat([lng, lat])
            .addTo(this.map);
    }

    clearRoute() {
        const source = this.map.getSource('route-source');
        if (source) {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    }

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

        const coords = geometry.coordinates;
        const bounds = coords.reduce((acc, coord) => {
            return [
                [Math.min(acc[0][0], coord[0]), Math.min(acc[0][1], coord[1])], 
                [Math.max(acc[1][0], coord[0]), Math.max(acc[1][1], coord[1])]  
            ];
        }, [[coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]]]);

        this.map.fitBounds(bounds, { padding: 50, duration: 1000 });
    }
}