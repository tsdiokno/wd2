# Pedestrian Decision Engine

A mobile-first, highly utilitarian web application that calculates the physical toll of walking. 

Unlike standard car-centric navigation apps, this engine treats the user as a human who feels gravity and heat. It evaluates 3D terrain and real-time weather to answer one simple question: *"Should I walk this, or should I get a ride?"*

## ⚡️ The Philosophy: "The Casio Watch"
This app is built for speed, objectivity, and zero bloat. No live-tracking background processes, no forced account creation, and no gimmicky social features. It does exactly one thing: calculates the reality of the walk you are about to take.

## 🌟 Core Features

* **Physiological Routing:** Calculates walking time and calorie burn (METs) using a 3D Haversine distance formula, modified **Tobler's Hiking Function**, and Naismith’s Rule for sustained climbs.
* **Environmental Context:** Fetches hyper-local, real-time weather (precipitation and "feels like" heat index) to generate a "Smart Impact" verdict on how the weather multiplies the physical effort.
* **Objective Route Archetypes:** Forces the routing engine to compare up to 3 paths, automatically identifying the absolute *Fastest* and the *Flattest* options to give the user physical autonomy.
* **Seamless Google Maps Handoff:** Extracts geographic waypoints from the chosen route and seamlessly passes them into the native Google Maps app for reliable turn-by-turn voice navigation.

## 🛠 Tech Stack

* **Frontend:** Pure Vanilla HTML / CSS / JavaScript (Zero framework bloat)
* **Map Renderer:** [MapLibre GL JS](https://maplibre.org/)
* **Map Tiles:** [MapTiler](https://www.maptiler.com/) (Dark/Light mode streets)
* **Routing Engine:** [OpenRouteService API](https://openrouteservice.org/) (Foot-walking profile with GeoJSON elevation geometry)
* **Weather Data:** [Open-Meteo API](https://open-meteo.com/) (No API key required)
