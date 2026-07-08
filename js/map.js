export class MapManager {
    constructor(containerId) {
        this.map = L.map(containerId, { zoomControl: false }).setView([14.6760, 121.0437], 13); // Default QC, Metro Manila

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors & CARTO',
            maxZoom: 19
        }).addTo(this.map);

        this.routeLayer = null;
        this.markers = {
            start: null,
            end: null
        };
        
        // Define icons
        this.startIcon = L.divIcon({ className: 'custom-icon start-icon', iconSize: [16, 16] });
        this.endIcon = L.divIcon({
            className: 'custom-icon', 
            html: '<div style="width:16px;height:16px;background:#ef4444;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
            iconSize: [16, 16]
        });
    }

    setMarker(type, latLng, dragCallback) {
        if (this.markers[type]) {
            this.markers[type].setLatLng(latLng);
        } else {
            const icon = type === 'start' ? this.startIcon : this.endIcon;
            this.markers[type] = L.marker(latLng, { 
                icon, 
                draggable: true 
            }).addTo(this.map);
            
            this.markers[type].on('dragend', (e) => {
                dragCallback(type, e.target.getLatLng());
            });
        }
    }

    getMarkerCoords(type) {
        if (!this.markers[type]) return null;
        return this.markers[type].getLatLng();
    }

    drawRoute(geoJsonData) {
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
        }

        this.routeLayer = L.geoJSON(geoJsonData, {
            style: {
                color: '#2563eb',
                weight: 5,
                opacity: 0.8
            }
        }).addTo(this.map);

        // Fit map bounds to the route
        this.map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });
    }

    clearRoute() {
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }
    }

    onClick(callback) {
        this.map.on('click', callback);
    }
}