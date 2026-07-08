// Haversine formula to calculate distance in meters
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Advanced Terrain & Fatigue Routing Model
 */
export function analyzeTerrainRoute(elevationData, totalDistanceMeters) {
    // Model Constants
    const BASE_SPEED_KMH = 5.0; // Standard flat walking speed
    const BASE_SPEED_MS = BASE_SPEED_KMH * (1000 / 3600);
    const FATIGUE_THRESHOLD_M = 5000; // Begin fatigue after 5km
    const CLIMB_FATIGUE_THRESHOLD = 50; // Begin continuous climb penalty after 50m of uninterrupted ascent

    // Accumulators
    let totalAscent = 0;
    let totalDescent = 0;
    
    // Time Breakdown (in minutes)
    let baseTimeMin = 0;
    let elevPenaltyMin = 0;
    let climbPenaltyMin = 0;
    let recoveryMin = 0;
    let fatigueMin = 0;

    // State Trackers
    let continuousClimbMeters = 0;
    let cumulativeDistance = 0;

    for (let i = 1; i < elevationData.length; i++) {
        const p1 = elevationData[i-1];
        const p2 = elevationData[i];
        
        const dist = getDistance(p1.lat, p1.lng, p2.lat, p2.lng);
        if (dist === 0) continue;

        const elevDiff = p2.elevation - p1.elevation;
        const slope = elevDiff / dist;

        // 1. Base Metrics
        if (elevDiff > 0) totalAscent += elevDiff;
        else totalDescent += Math.abs(elevDiff);
        
        cumulativeDistance += dist;

        // 2. Flat-ground base estimate for this segment
        const segmentBaseTime = (dist / BASE_SPEED_MS) / 60;
        baseTimeMin += segmentBaseTime;

        // 3. Terrain Speed (Modified Tobler's Hiking Function)
        // Standard Tobler: W = 6 * exp(-3.5 * abs(slope + 0.05))
        // This naturally peaks at a gentle downhill (s = -0.05) and slows down on steep downhills and uphills.
        let toblerSpeedKmh = 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
        
        // Cap extreme speeds to remain realistic for walking (not running)
        toblerSpeedKmh = Math.max(1.5, Math.min(toblerSpeedKmh, 6.5));
        const toblerSpeedMs = toblerSpeedKmh * (1000 / 3600);
        
        const segmentTerrainTime = (dist / toblerSpeedMs) / 60;
        
        // Calculate the difference terrain made compared to flat ground
        const timeDiff = segmentTerrainTime - segmentBaseTime;

        if (timeDiff > 0) {
            // Uphills and steep downhills slow us down
            elevPenaltyMin += timeDiff;
        } else {
            // Gentle downhills speed us up (timeDiff is negative, so we subtract to add to recovery)
            recoveryMin -= timeDiff; 
        }

        // 4. Sustained Climbing Penalty (Naismith/Langmuir inspiration)
        if (slope > 0.02) {
            continuousClimbMeters += elevDiff;
        } else if (slope < -0.02) {
            // Downhills break the continuous climb fatigue
            continuousClimbMeters = Math.max(0, continuousClimbMeters - Math.abs(elevDiff));
        }

        if (continuousClimbMeters > CLIMB_FATIGUE_THRESHOLD) {
            // Add a 10% time penalty to this segment due to lactic acid/heavy breathing
            climbPenaltyMin += (segmentTerrainTime * 0.10);
        }

        // 5. Distance Fatigue Penalty
        if (cumulativeDistance > FATIGUE_THRESHOLD_M) {
            // E.g., for every km past 5km, pace slows by 1.5%
            const extraKm = (cumulativeDistance - FATIGUE_THRESHOLD_M) / 1000;
            const fatigueMultiplier = extraKm * 0.015; 
            fatigueMin += (segmentTerrainTime * fatigueMultiplier);
        }
    }

    const finalTimeMin = baseTimeMin + elevPenaltyMin + climbPenaltyMin + fatigueMin - recoveryMin;
    const totalDistanceKm = totalDistanceMeters / 1000;

    // Difficulty heuristic
    let difficulty = "Easy";
    if (totalDistanceKm > 10 || totalAscent > 200 || finalTimeMin > 120) difficulty = "Hard";
    else if (totalDistanceKm > 3 || totalAscent > 50) difficulty = "Moderate";

    // METs calculation based on average incline
    const averageIncline = totalDistanceMeters > 0 ? (totalAscent / totalDistanceMeters) : 0;
    let met = 3.5; // Base flat walk
    if (averageIncline > 0.02) met = 5.0; 
    if (averageIncline > 0.05) met = 7.0; 
    const calories = met * 70 * (finalTimeMin / 60); 

    return {
        distanceKm: totalDistanceKm,
        finalTimeMin,
        breakdown: {
            baseTimeMin,
            elevPenaltyMin,
            climbPenaltyMin,
            recoveryMin,
            fatigueMin
        },
        ascentMeters: totalAscent,
        descentMeters: totalDescent,
        averageSpeedKmh: totalDistanceKm / (finalTimeMin / 60),
        difficulty,
        calories: calories,
        summary: generateScientificSummary(totalDistanceKm, totalAscent, elevPenaltyMin, climbPenaltyMin, recoveryMin, fatigueMin)
    };
}

function generateScientificSummary(dist, ascent, elev, climb, recovery, fatigue) {
    let summary = [];

    if (elev > 2) {
        summary.push(`Approximately ${Math.round(ascent)} meters of cumulative climbing increases the estimated walking time by about ${Math.round(elev)} minutes compared with a flat route.`);
    }

    if (climb > 1) {
        summary.push(`Sustained uphill sections are present, which are modeled to progressively reduce your pace as effort accumulates.`);
    }

    if (recovery > 1) {
        summary.push(`Gentle downhill sections allow for near-optimal walking mechanics, offsetting earlier time losses by roughly ${Math.round(recovery)} minutes.`);
    }

    if (fatigue > 2) {
        summary.push(`The total route length introduces modeled mild fatigue, slightly reducing the average pace in the later stages of the walk.`);
    }

    if (summary.length === 0) {
        summary.push(`This route is primarily flat and short. The estimate assumes a consistent baseline walking speed with minimal terrain interference or fatigue.`);
    }

    return summary.join(" ");
}