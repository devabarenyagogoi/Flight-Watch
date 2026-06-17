// ─── Map Init ──────────────────────────────────────────

const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {
            'carto-voyager': {
                type: 'raster',
                tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors © CARTO'
            }
        },
        layers: [{
            id: 'carto-voyager-layer',
            type: 'raster',
            source: 'carto-voyager'
        }]
    },
    center: [0, 20],
    zoom: 2,
    minZoom: 2,
    maxZoom: 20,
    renderWorldCopies: false
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

// ─── Globals ───────────────────────────────────────────

let allFlights = [];
let selectedCountries = new Set();
let currentTrack = null;
let flightsReady = false;

// ─── Day/Night Terminator ──────────────────────────────

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
        const lat = Math.atan2(-Math.cos(lngRad), Math.tan(declination)) * 180 / Math.PI;
        points.push([lng, lat]);
    }

    const nightPole = declination * 180 / Math.PI > 0 ? -90 : 90;
    points.push([360, nightPole]);
    points.push([-360, nightPole]);
    points.push(points[0]);

    return points;
}

function buildTerminatorGeoJSON(now, offsetDeg) {
    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [getTerminatorPoints(now, offsetDeg)]
        }
    };
}

function updateTerminator() {
    const now = new Date();
    const layers = [
        { id: 'terminator-night', offset: 0 },
        { id: 'terminator-twilight-1', offset: 3 },
        { id: 'terminator-twilight-2', offset: 6 },
        { id: 'terminator-twilight-3', offset: 9 },
        { id: 'terminator-twilight-4', offset: 12 },
    ];
    layers.forEach(({ id, offset }) => {
        if (map.getSource(id)) {
            map.getSource(id).setData(buildTerminatorGeoJSON(now, offset));
        }
    });
}

// ─── Altitude Color ────────────────────────────────────

function altitudeToColor(baroAltitude) {
    if (baroAltitude == null || baroAltitude <= 0) return '#ff0000';
    const t = Math.min(baroAltitude / 13000, 1.0);
    return hslToHex(t * 300, 100, 50);
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// ─── Map Load ──────────────────────────────────────────

map.on('load', () => {

    // ─── Terminator ────────────────────────────────────
    const terminatorLayers = [
        { id: 'terminator-night', offset: 0, opacity: 0.18 },
        { id: 'terminator-twilight-1', offset: 3, opacity: 0.14 },
        { id: 'terminator-twilight-2', offset: 6, opacity: 0.10 },
        { id: 'terminator-twilight-3', offset: 9, opacity: 0.07 },
        { id: 'terminator-twilight-4', offset: 12, opacity: 0.04 },
    ];

    terminatorLayers.forEach(({ id, offset, opacity }) => {
        map.addSource(id, {
            type: 'geojson',
            data: buildTerminatorGeoJSON(new Date(), offset)
        });
        map.addLayer({
            id: `${id}-layer`,
            type: 'fill',
            source: id,
            paint: {
                'fill-color': '#000033',
                'fill-opacity': opacity,
                'fill-antialias': false,
                'fill-outline-color': 'rgba(0,0,0,0)'
            }
        });
    });

    updateTerminator();
    setInterval(updateTerminator, 30000);

    // ─── Plane Icon ────────────────────────────────────
    const svgStr = `<svg fill="#ffffff" width="800" height="800" viewBox="-2.5 0 19 19" xmlns="http://www.w3.org/2000/svg"><path d="M12.382 5.304 10.096 7.59l.006.02L11.838 14a.908.908 0 0 1-.211.794l-.573.573a.339.339 0 0 1-.566-.08l-2.348-4.25-.745-.746-1.97 1.97a3.311 3.311 0 0 1-.75.504l.44 1.447a.875.875 0 0 1-.199.79l-.175.176a.477.477 0 0 1-.672 0l-1.04-1.039-.018-.02-.788-.786-.02-.02-1.038-1.039a.477.477 0 0 1 0-.672l.176-.176a.875.875 0 0 1 .79-.197l1.447.438a3.322 3.322 0 0 1 .504-.75l1.97-1.97-.746-.744-4.25-2.348a.339.339 0 0 1-.08-.566l.573-.573a.909.909 0 0 1 .794-.211l6.39 1.736.02.006 2.286-2.286c.37-.372 1.621-1.02 1.993-.65.37.372-.279 1.622-.65 1.993z"/></svg>`;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const svgImage = new Image(64, 64);
    svgImage.onload = () => {
        // Black outline: stamp shifted in 8 directions
        const blackCanvas = document.createElement('canvas');
        blackCanvas.width = 64;
        blackCanvas.height = 64;
        const bCtx = blackCanvas.getContext('2d');
        bCtx.drawImage(svgImage, 0, 0);
        bCtx.globalCompositeOperation = 'source-in';
        bCtx.fillStyle = '#000000';
        bCtx.fillRect(0, 0, 64, 64);

        const offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
        offsets.forEach(([dx, dy]) => ctx.drawImage(blackCanvas, dx * 1.5, dy * 1.5));

        // White plane on top (SDF will recolor it)
        ctx.drawImage(svgImage, 0, 0);
        map.addImage('plane-icon', ctx.getImageData(0, 0, 64, 64), { sdf: true });

        // ─── Flights Source & Layer ────────────────────
        map.addSource('flights', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        map.addLayer({
            id: 'flights-layer',
            type: 'symbol',
            source: 'flights',
            layout: {
                'icon-image': 'plane-icon',
                'icon-size': 0.5,
                'icon-rotate': ['get', 'heading'],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true
            },
            paint: {
                'icon-color': ['get', 'color']
            }
        });

        // ─── Click & Hover ─────────────────────────────
        map.on('click', 'flights-layer', (e) => {
            const props = e.features[0].properties;
            const flight = allFlights.find(f => f.icao24 === props.icao24);
            if (flight) openRightSidebar(flight);
        });

        map.on('mouseenter', 'flights-layer', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'flights-layer', () => {
            map.getCanvas().style.cursor = '';
        });

        // Flush any data that arrived before the layer was ready
        flightsReady = true;
        if (allFlights.length > 0) applyFilter();
    };
    svgImage.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
});

// ─── Markers ───────────────────────────────────────────

function renderMarkers(flights) {
    if (!flightsReady || !map.getSource('flights')) return;

    const features = flights
        .filter(f => f.latitude != null && f.longitude != null)
        .map(f => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [f.longitude, f.latitude]
            },
            properties: {
                icao24: f.icao24,
                callsign: f.callsign,
                heading: f.trueTrack ?? 0,
                color: altitudeToColor(f.baroAltitude)
            }
        }));

    map.getSource('flights').setData({ type: 'FeatureCollection', features });
    document.getElementById('count').textContent = allFlights.length.toLocaleString();
}

// ─── Filter ────────────────────────────────────────────

function applyFilter() {
    let filtered;
    if (selectedCountries.size === 0) {
        filtered = [];
    } else if (selectedCountries.has('World')) {
        filtered = allFlights;
    } else {
        filtered = allFlights.filter(f => selectedCountries.has(f.originCountry ?? 'Unknown'));
    }
    renderMarkers(filtered);
    document.getElementById('count').textContent = allFlights.length.toLocaleString();
}

// ─── Left Sidebar ──────────────────────────────────────

function toggleLeftSidebar() {
    const sidebar = document.getElementById('left-sidebar');
    const toggle = document.getElementById('left-sidebar-toggle');
    const isOpen = sidebar.style.display === 'block';
    sidebar.style.display = isOpen ? 'none' : 'block';
    toggle.style.left = isOpen ? '0' : '260px';
}

function closeLeftSidebar() {
    document.getElementById('left-sidebar').style.display = 'none';
    document.getElementById('left-sidebar-toggle').style.left = '0';
}

function buildCountryList(flights) {
    const counts = {};
    flights.forEach(f => {
        const c = f.originCountry ?? 'Unknown';
        counts[c] = (counts[c] ?? 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    renderCountryList(sorted);

    document.getElementById('country-search').oninput = (e) => {
        const q = e.target.value.toLowerCase();
        renderCountryList(sorted.filter(([c]) => c.toLowerCase().includes(q)));
    };
}

function renderCountryList(entries) {
    const container = document.getElementById('country-list');
    container.innerHTML = '';

    const worldItem = document.createElement('div');
    worldItem.className = 'country-item';

    const worldCb = document.createElement('input');
    worldCb.type = 'checkbox';
    worldCb.id = 'cb-World';
    worldCb.checked = selectedCountries.has('World');
    worldCb.onchange = () => {
        if (worldCb.checked) selectedCountries.add('World');
        else selectedCountries.delete('World');
        applyFilter();
    };

    const worldLabel = document.createElement('label');
    worldLabel.htmlFor = 'cb-World';
    worldLabel.textContent = 'World';

    const worldCount = document.createElement('span');
    worldCount.className = 'country-count';
    worldCount.textContent = allFlights.length;

    worldItem.appendChild(worldCb);
    worldItem.appendChild(worldLabel);
    worldItem.appendChild(worldCount);
    container.appendChild(worldItem);

    const divider = document.createElement('hr');
    divider.style.cssText = 'border: none; border-top: 1px solid #eee; margin: 6px 0;';
    container.appendChild(divider);

    entries.forEach(([country, count]) => {
        const item = document.createElement('div');
        item.className = 'country-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `cb-${country}`;
        cb.checked = selectedCountries.has(country);
        cb.onchange = () => {
            if (cb.checked) selectedCountries.add(country);
            else selectedCountries.delete(country);
            applyFilter();
        };

        const label = document.createElement('label');
        label.htmlFor = `cb-${country}`;
        label.textContent = country;

        const countSpan = document.createElement('span');
        countSpan.className = 'country-count';
        countSpan.textContent = count;

        item.appendChild(cb);
        item.appendChild(label);
        item.appendChild(countSpan);
        container.appendChild(item);
    });
}

// ─── Right Sidebar ─────────────────────────────────────

const positionSources = { 0: 'ADS-B', 1: 'ASTERIX', 2: 'MLAT', 3: 'FLARM' };
const categories = {
    0: 'No Info', 1: 'No ADS-B Info', 2: 'Light', 3: 'Small', 4: 'Large',
    5: 'High Vortex Large', 6: 'Heavy', 7: 'High Performance', 8: 'Rotorcraft',
    9: 'Glider', 10: 'Lighter-than-air', 11: 'Parachutist', 12: 'Ultralight',
    13: 'Reserved', 14: 'UAV', 15: 'Space Vehicle', 16: 'Emergency Vehicle',
    17: 'Service Vehicle', 18: 'Point Obstacle', 19: 'Cluster Obstacle', 20: 'Line Obstacle'
};

async function openRightSidebar(f) {
    document.getElementById('right-sidebar-callsign').textContent = f.callsign ?? 'Unknown';
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

    const enrichedIds = ['sb-type', 'sb-icao-type', 'sb-manufacturer', 'sb-registration',
        'sb-owner', 'sb-origin', 'sb-origin-iata', 'sb-origin-country',
        'sb-destination', 'sb-dest-iata', 'sb-dest-country', 'sb-airline'];
    enrichedIds.forEach(id => document.getElementById(id).textContent = 'Loading...');

    const photo = document.getElementById('sb-photo');
    photo.style.display = 'none';
    photo.src = '';

    document.getElementById('right-sidebar').style.display = 'block';

    if (currentTrack) {
        if (map.getLayer('track-layer')) map.removeLayer('track-layer');
        if (map.getSource('track')) map.removeSource('track');
        currentTrack = null;
    }

    const callsign = f.callsign ?? '';
    const [trackRes, infoRes] = await Promise.allSettled([
        fetch(`/api/flight/track/${f.icao24}`),
        callsign ? fetch(`/api/flight/info/${f.icao24}/${callsign}`) : Promise.resolve(null)
    ]);

    try {
        if (trackRes.status === 'fulfilled') {
            const waypoints = await trackRes.value.json();
            if (waypoints.length > 1) {
                if (map.getLayer('track-layer')) map.removeLayer('track-layer');
                if (map.getSource('track')) map.removeSource('track');

                map.addSource('track', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: waypoints.map(([lat, lng]) => [lng, lat])
                        }
                    }
                });

                map.addLayer({
                    id: 'track-layer',
                    type: 'line',
                    source: 'track',
                    paint: {
                        'line-color': '#64b5f6',
                        'line-width': 2,
                        'line-opacity': 0.8,
                        'line-dasharray': [2, 2]
                    }
                });

                currentTrack = true;
            }
        }
    } catch (err) {
        console.error('Failed to fetch track:', err);
    }

    try {
        if (infoRes.status === 'fulfilled' && infoRes.value) {
            const info = await infoRes.value.json();

            const a = info.aircraft;
            document.getElementById('sb-type').textContent = a?.type ?? 'N/A';
            document.getElementById('sb-icao-type').textContent = a?.icaoType ?? 'N/A';
            document.getElementById('sb-manufacturer').textContent = a?.manufacturer ?? 'N/A';
            document.getElementById('sb-registration').textContent = a?.registration ?? 'N/A';
            document.getElementById('sb-owner').textContent = a?.registeredOwner ?? 'N/A';

            if (a?.urlPhotoThumbnail) {
                photo.src = a.urlPhotoThumbnail;
                photo.style.display = 'block';
            }

            const r = info.flightroute;
            document.getElementById('sb-origin').textContent = r?.origin?.name ?? 'N/A';
            document.getElementById('sb-origin-iata').textContent = r?.origin?.iata_code ?? 'N/A';
            document.getElementById('sb-origin-country').textContent = r?.origin?.country_name ?? 'N/A';
            document.getElementById('sb-destination').textContent = r?.destination?.name ?? 'N/A';
            document.getElementById('sb-dest-iata').textContent = r?.destination?.iata_code ?? 'N/A';
            document.getElementById('sb-dest-country').textContent = r?.destination?.country_name ?? 'N/A';
            document.getElementById('sb-airline').textContent = r?.airline?.name ?? 'N/A';
            document.getElementById('sb-origin-city').textContent = r?.origin?.municipality ?? 'N/A';
            document.getElementById('sb-dest-city').textContent = r?.destination?.municipality ?? 'N/A';

            const originIata = r?.origin?.iata_code;
            const destIata = r?.destination?.iata_code;
            document.getElementById('sb-route').textContent =
                (originIata && destIata) ? `${originIata} - ${destIata}` : 'N/A';
        } else {
            enrichedIds.forEach(id => document.getElementById(id).textContent = 'N/A');
        }
    } catch (err) {
        console.error('Failed to fetch flight info:', err);
        enrichedIds.forEach(id => document.getElementById(id).textContent = 'N/A');
    }
}

function closeRightSidebar() {
    document.getElementById('right-sidebar').style.display = 'none';
    if (currentTrack) {
        if (map.getLayer('track-layer')) map.removeLayer('track-layer');
        if (map.getSource('track')) map.removeSource('track');
        currentTrack = null;
    }
}

// ─── SignalR ───────────────────────────────────────────

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/flightHub")
    .withAutomaticReconnect()
    .build();

connection.on("ReceiveFlights", (flights) => {
    allFlights = flights;
    buildCountryList(flights);
    applyFilter();
});

connection.start().catch(err => console.error('SignalR connection error:', err));

// ─── Search ────────────────────────────────────────────

const searchInput = document.getElementById("flight-search");
const searchButton = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");

searchButton?.addEventListener("click", searchFlight);

searchInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchFlight();
});

searchInput?.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
        return;
    }
    showSearchResults(query);
});

document.addEventListener("click", (e) => {
    if (!e.target.closest('#search-container')) {
        searchResults.style.display = 'none';
    }
});

function showSearchResults(query) {
    const matches = allFlights.filter(f =>
        f.callsign?.trim().toLowerCase().includes(query) ||
        f.icao24?.toLowerCase().includes(query)
    ).slice(0, 20);

    if (matches.length === 0) {
        searchResults.style.display = 'none';
        return;
    }

    searchResults.innerHTML = matches.map(f => {
        const callsign = f.callsign?.trim() || f.icao24;
        const meta = [f.originCountry, f.icao24].filter(Boolean).join(' · ');
        return `<div class="search-result-item" data-icao="${f.icao24}">
            <span class="sr-callsign">${callsign}</span>
            <span class="sr-meta">${meta}</span>
        </div>`;
    }).join('');

    searchResults.style.display = 'block';

    searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const flight = allFlights.find(f => f.icao24 === item.dataset.icao);
            if (!flight) return;
            searchResults.style.display = 'none';
            searchInput.value = flight.callsign?.trim() || flight.icao24;
            if (flight.longitude != null && flight.latitude != null) {
                map.flyTo({ center: [flight.longitude, flight.latitude], zoom: 6, speed: 1.5 });
            }
            openRightSidebar(flight);
        });
    });
}

function searchFlight() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;
    showSearchResults(query);
}