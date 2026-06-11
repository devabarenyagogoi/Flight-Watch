const map = L.map('map', {
    minZoom: 2,
    maxZoom: 20,
    worldCopyJump: true,
    maxBounds: [[-90, -260], [90, 260]],
    maxBoundsViscosity: 0.8
}).setView([20, 0], 3);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
}).addTo(map);

// Day/Night Terminator

let nightOverlay = null;
let twilightOverlays = [];
let currentTrack = null;

function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date - start) / (1000 * 60 * 60 * 24));
}

function getTerminatorPoints(now, offsetDeg) {
    const declination = Math.asin(
        Math.sin(-23.45 * Math.PI / 180) *
        Math.cos(2 * Math.PI * getDayOfYear(now) / 365.25 + 2 * Math.PI * 10 / 365.25)
    );
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const sunLng = -(utcHours - 12) * 15 + offsetDeg;

    const points = [];
    for (let lng = -360; lng <= 360; lng += 1) {
        const lngRad = (lng - sunLng) * Math.PI / 180;
        const lat = Math.atan2(
            -Math.cos(lngRad),
            Math.tan(declination)
        ) * 180 / Math.PI;
        points.push([lat, lng]);
    }

    const nightPole = declination * 180 / Math.PI > 0 ? -90 : 90;
    points.push([nightPole, 360]);
    points.push([nightPole, -360]);

    return points;
}

function updateTerminator() {
    const now = new Date();

    if (nightOverlay) map.removeLayer(nightOverlay);
    twilightOverlays.forEach(l => map.removeLayer(l));
    twilightOverlays = [];

    nightOverlay = L.polygon(getTerminatorPoints(now, 0), {
        color: 'transparent',
        fillColor: '#000033',
        fillOpacity: 0.30,
        interactive: false,
        smoothFactor: 3
    }).addTo(map);

    const twilightLayers = [
        { offset: 3, opacity: 0.25 },
        { offset: 6, opacity: 0.19 },
        { offset: 9, opacity: 0.13 },
        { offset: 12, opacity: 0.07 },
    ];

    twilightLayers.forEach(({ offset, opacity }) => {
        const layer = L.polygon(getTerminatorPoints(now, offset), {
            color: 'transparent',
            fillColor: '#000033',
            fillOpacity: opacity,
            interactive: false,
            smoothFactor: 3
        }).addTo(map);
        twilightOverlays.push(layer);
    });
}

updateTerminator();
setInterval(updateTerminator, 30000);

// Plane Icons

const planeIcon = (heading) => L.divIcon({
    html: `<i class="bi bi-airplane-fill" style="
                font-size: 16px;
                color: #64b5f6;
                -webkit-text-stroke: 1px black;
                display: block;
                transform: rotate(${heading}deg);
            "></i>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    className: ''
});

// Sidebar

const positionSources = { 0: 'ADS-B', 1: 'ASTERIX', 2: 'MLAT', 3: 'FLARM' };
const categories = {
    0: 'No Info', 1: 'No ADS-B Info', 2: 'Light', 3: 'Small', 4: 'Large',
    5: 'High Vortex Large', 6: 'Heavy', 7: 'High Performance', 8: 'Rotorcraft',
    9: 'Glider', 10: 'Lighter-than-air', 11: 'Parachutist', 12: 'Ultralight',
    13: 'Reserved', 14: 'UAV', 15: 'Space Vehicle', 16: 'Emergency Vehicle',
    17: 'Service Vehicle', 18: 'Point Obstacle', 19: 'Cluster Obstacle', 20: 'Line Obstacle'
};

async function openSidebar(f) {
    document.getElementById('sidebar-callsign').textContent = f.callsign ?? 'Unknown';
    document.getElementById('sb-country').textContent = f.originCountry ?? 'N/A';
    document.getElementById('sb-altitude').textContent = f.baroAltitude ? (f.baroAltitude / 1000).toFixed(1) + ' km' : 'N/A';
    document.getElementById('sb-geo-altitude').textContent = f.geoAltitude ? (f.geoAltitude / 1000).toFixed(1) + ' km' : 'N/A';
    document.getElementById('sb-speed').textContent = f.velocity ? (f.velocity * 3.6).toFixed(0) + ' km/h' : 'N/A';
    document.getElementById('sb-heading').textContent = f.trueTrack ? f.trueTrack.toFixed(1) + '°' : 'N/A';
    document.getElementById('sb-vrate').textContent = f.verticalRate ? f.verticalRate.toFixed(1) + ' m/s' : 'N/A';
    document.getElementById('sb-ground').textContent = f.onGround ? 'Yes' : 'No';
    document.getElementById('sb-squawk').textContent = f.squawk ?? 'N/A';
    document.getElementById('sb-icao').textContent = f.icao24 ?? 'N/A';
    document.getElementById('sb-source').textContent = positionSources[f.positionSource] ?? 'N/A';
    document.getElementById('sb-category').textContent = categories[f.category] ?? 'N/A';
    document.getElementById('sb-spi').textContent = f.spi ? 'Yes' : 'No';
    document.getElementById('sb-contact').textContent = f.lastContact ? new Date(f.lastContact * 1000).toUTCString() : 'N/A';

    document.getElementById('sidebar').style.display = 'block';

    // Clear old track
    if (currentTrack) {
        map.removeLayer(currentTrack);
        currentTrack = null;
    }

    // Fetch and draw new track
    try {
        const res = await fetch(`/api/flight/track/${f.icao24}`);
        const waypoints = await res.json();

        if (waypoints.length > 1) {
            currentTrack = L.polyline(waypoints, {
                color: '#64b5f6',
                weight: 2,
                opacity: 0.8,
                dashArray: '6, 6'
            }).addTo(map);
        }
    } catch (err) {
        console.error('Failed to fetch track:', err);
    }
}

function closeSidebar() {
    document.getElementById('sidebar').style.display = 'none';
    if (currentTrack) {
        map.removeLayer(currentTrack);
        currentTrack = null;
    }
}

// SignalR Connection

let markers = {};

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/flightHub")
    .withAutomaticReconnect()
    .build();

connection.on("ReceiveFlights", (flights) => {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    flights.forEach(f => {
        if (!f.latitude || !f.longitude) return;

        const marker = L.marker([f.latitude, f.longitude], {
            icon: planeIcon(f.trueTrack ?? 0),
        }).addTo(map);

        marker.on('click', () => openSidebar(f));

        markers[f.icao24] = marker;
    });

    document.getElementById('count').textContent = flights.length.toLocaleString();
});

connection.start().catch(err => console.error('SignalR connection error:', err));