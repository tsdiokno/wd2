### Pedestrian Decision Engine

A mobile-first web tool built to answer one question: **Should I walk this route right now, or should I take a ride?**

It evaluates 3D terrain and real-time weather to estimate the physical toll of a walk.

## What It Does

* **Calculates Physical Impact:** Uses Tobler's Hiking Function and Naismith's Rule to factor slopes and the WMO weather index (heat/rain) into estimated travel time and METs (calories burned).
* **Filters Route Alternatives:** Displays up to three route archetypes (Fastest vs. Flattest). It automatically filters out detours that exceed the fastest route by more than 40% or 1.0 km.
* **Provides a Decision Threshold:** If a routed path is more than 3x longer than the straight-line physical distance (and over 1.5 km), it halts calculation and suggests getting a ride.

## Limitations

* **No Turn-by-Turn Navigation:** It does not track location live or give voice prompts. It passes coordinates to Google Maps via a "Start Walking" button for actual navigation. *(Honestly, this handoff is our best feature anyway because Google's street data handles broken local intersections better than we can).*
* **No Live Flood Tracking:** It reads live rainfall volume and weather codes, but cannot detect standing water on the ground.
* **OpenStreetMap Dependency:** Relies on OpenRouteService (OSM data). If a local alleyway (*esquinita*) or gate is tagged as an impassable barrier in OSM, the engine will route around it. *(If the app gives you a wildly winding detour for a street you know is open, this is usually why).*

## The Code

This project is completely vibe-coded. It wasn't built from a strict architectural blueprint; it was written conversationally—tweaking parameters on the fly, fixing quirks as they broke, and handling map API limitations manually until the outputs felt right for an actual walk. It is vanilla HTML, CSS, and JS held together by utilitarian intent.

## Tech Stack

* **Map Canvas:** MapLibre GL JS + MapTiler (Styles)
* **Routing Brain:** OpenRouteService API (`foot-walking` profile with relaxed `share_factor` constraints)
* **Weather Brain:** Open-Meteo API (`weather_code` categorical tracking)

## Setup

1. Clone the repo.
2. Create a `js/config.js` file based on the template below to securely store your credentials:
```javascript
export const CONFIG = {
    MAPTILER_KEY: "YOUR_MAPTILER_API_KEY",
    OPENROUTESERVICE_KEY: "YOUR_OPENROUTESERVICE_API_KEY"
};

```


3. Run a local server (`python3 -m http.server 8000`) and open it in your browser.