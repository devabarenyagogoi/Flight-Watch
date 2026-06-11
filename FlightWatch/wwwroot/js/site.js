const map = L.map('map', {
    minZoom: 2,
    maxZoom: 20,
    worldCopyJump: true,
    maxBounds: [[-90, -180], [90, 180]], // allows bleed on each side
    maxBoundsViscosity: 0.8  // soft resistance at edges, not a hard stop
}).setView([20, 0], 3);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
}).addTo(map);

// Day/Night Terminator

let nightOverlay = null;
let twilightOverlays = [];

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

    // Remove old overlays
    if (nightOverlay) map.removeLayer(nightOverlay);
    twilightOverlays.forEach(l => map.removeLayer(l));
    twilightOverlays = [];

    // Core night (darkest)
    nightOverlay = L.polygon(getTerminatorPoints(now, 0), {
        color: 'transparent',
        fillColor: '#000033',
        fillOpacity: 0.30,
        interactive: false,
        smoothFactor: 3
    }).addTo(map);

    // Twilight gradient layers
    const twilightLayers = [
        { offset: 3, opacity: 0.25 }, // civil twilight
        { offset: 6, opacity: 0.19 }, // nautical twilight
        { offset: 9, opacity: 0.13 }, // astronomical twilight
        { offset: 12, opacity: 0.07 }, // outer glow
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

        marker.bindPopup(`
            <b>${f.callsign ?? 'Unknown'}</b><br>
            Country: ${f.originCountry}<br>
            Altitude: ${f.baroAltitude ? (f.baroAltitude / 1000).toFixed(1) + ' km' : 'N/A'}<br>
            Speed: ${f.velocity ? (f.velocity * 3.6).toFixed(0) + ' km/h' : 'N/A'}<br>
            Heading: ${f.trueTrack ? f.trueTrack.toFixed(1) + '°' : 'N/A'}<br>
            On Ground: ${f.onGround ? 'Yes' : 'No'}
        `);

        markers[f.icao24] = marker;
    });

    document.getElementById('count').textContent = flights.length.toLocaleString();
});

connection.start().catch(err => console.error('SignalR connection error:', err));
