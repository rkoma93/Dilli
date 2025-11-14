// scripts/generate-dots.js
// ---------------------------------------------------------------
// 1. Fetch map (GitHub raw → always works in Actions)
// ---------------------------------------------------------------
const fs = require('fs');
const fetch = require('node-fetch');

const MAP_URL =
  'https://raw.githubusercontent.com/topojson/world-atlas/master/countries-110m.json';

async function getMap() {
  console.log('Fetching map...');
  const res = await fetch(MAP_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.arcs || !json.objects?.countries) {
    throw new Error('Invalid TopoJSON');
  }
  console.log('Map loaded');
  return json;
}

// ---------------------------------------------------------------
// 2. Convert TopoJSON → flat polygons [[lng,lat], …]
// ---------------------------------------------------------------
function topoToPolygons(topo) {
  const { transform, arcs, objects } = topo;
  const [sx, sy] = transform.scale;
  const [tx, ty] = transform.translate;
  const polys = [];

  const decode = (idx) => {
    const arc = arcs[Math.abs(idx)];
    const rev = idx < 0;
    let x = 0,
      y = 0;
    const pts = arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
    return rev ? pts.reverse() : pts;
  };

  objects.countries.geometries.forEach((g) => {
    if (!g.arcs) return;
    g.arcs.forEach((ringSet) => {
      if (Array.isArray(ringSet[0])) {
        // MultiPolygon
        ringSet.forEach((ring) => {
          const poly = [];
          ring.forEach((i) => poly.push(...decode(i)));
          if (poly.length) polys.push(poly);
        });
      } else {
        // Polygon
        const poly = [];
        ringSet.forEach((i) => poly.push(...decode(i)));
        if (poly.length) polys.push(poly);
      }
    });
  });
  return polys;
}

// ---------------------------------------------------------------
// 3. Point-in-polygon (ray-casting)
// ---------------------------------------------------------------
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------
// 4. Rasterize land → array of {lat,lng}
// ---------------------------------------------------------------
function buildDots(polygons) {
  const step = 0.3;   // degrees
  const sub = 2;      // 2×2 sub-samples per cell
  const jitter = 0.08;
  const dots = [];

  console.log('Rasterizing land (≈ 1 M points)…');
  for (let lat = -90; lat <= 90; lat += step) {
    for (let lng = -180; lng <= 180; lng += step) {
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const l =
            lat + ((sy + 0.5) * step) / sub + (Math.random() - 0.5) * jitter;
          const g =
            lng + ((sx + 0.5) * step) / sub + (Math.random() - 0.5) * jitter;
          if (l < -90 || l > 90 || g < -180 || g > 180) continue;
          if (polygons.some((p) => pointInPoly([g, l], p))) {
            dots.push({ lat: l, lng: g });
          }
        }
      }
    }
  }
  console.log(`Generated ${dots.length} dots`);
  return dots;
}

// ---------------------------------------------------------------
// 5. Tiny inline SVG minifier (removes whitespace & rounds)
// ---------------------------------------------------------------
function minifySvg(svg) {
  return svg
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/(\.\d{3})\d+/g, '$1'); // keep 3 decimals
}

// ---------------------------------------------------------------
// 6. Main
// ---------------------------------------------------------------
(async () => {
  try {
    const topo = await getMap();
    const polygons = topoToPolygons(topo);
    const dots = buildDots(polygons);

    const w = 1000,
      h = 500;
    const circles = dots
      .map((d) => {
        const x = ((d.lng + 180) / 360) * w;
        const y = ((90 - d.lat) / 180) * h;
        return `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="0.4" fill="#6ca0ff"/>`;
      })
      .join('');

    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#000"/>
  ${circles}
</svg>`;

    const svg = minifySvg(rawSvg);
    fs.writeFileSync('land-dots.svg', svg);
    const sizeMB = (svg.length / 1024 / 1024).toFixed(2);
    console.log(`land-dots.svg written – ${sizeMB} MB`);
  } catch (e) {
    console.error('Generation failed:', e);
    process.exit(1);
  }
})();
