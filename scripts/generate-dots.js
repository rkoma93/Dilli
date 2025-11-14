// scripts/generate-dots.js
// ---------------------------------------------------------------
// 1. Dependencies
// ---------------------------------------------------------------
const fs = require('fs');
const fetch = require('node-fetch');
const { optimize } = require('svgo');   // <-- in-node compression

// ---------------------------------------------------------------
// 2. URLs (the 404 one is fixed)
// ---------------------------------------------------------------
const PRIMARY_URL   = 'https://raw.githubusercontent.com/topojson/world-atlas/master/countries-110m.json';
const FALLBACK_URL  = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ---------------------------------------------------------------
// 3. Fetch with retries & logging
// ---------------------------------------------------------------
async function fetchTopojson() {
  const urls = [PRIMARY_URL, FALLBACK_URL];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n--- Attempt ${i + 1}: ${url} ---`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      console.log(`Status: ${res.status} ${res.statusText}`);
      if (!res.ok) { console.log('Not OK – next'); continue; }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) { console.log('Not JSON – next'); continue; }

      const data = await res.json();
      if (data.type && data.objects && data.arcs) {
        console.log('Valid TopoJSON');
        return data;
      }
    } catch (e) {
      console.log('Fetch error:', e.message);
    }
  }
  throw new Error('All map sources failed');
}

// ---------------------------------------------------------------
// 4. TopoJSON → polygons
// ---------------------------------------------------------------
function topoToPolygons(topo) {
  const { transform, arcs, objects } = topo;
  const [sx, sy] = transform.scale;
  const [tx, ty] = transform.translate;
  const polys = [];

  const decode = idx => {
    const arc = arcs[Math.abs(idx)];
    const rev = idx < 0;
    let x = 0, y = 0;
    const pts = arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * sx + tx, y * sy + ty];
    });
    return rev ? pts.reverse() : pts;
  };

  objects.countries.geometries.forEach(g => {
    if (!g.arcs) return;
    g.arcs.forEach(ringSet => {
      if (Array.isArray(ringSet[0])) {
        ringSet.forEach(ring => {
          const poly = [];
          ring.forEach(i => poly.push(...decode(i)));
          if (poly.length) polys.push(poly);
        });
      } else {
        const poly = [];
        ringSet.forEach(i => poly.push(...decode(i)));
        if (poly.length) polys.push(poly);
      }
    });
  });
  return polys;
}

// ---------------------------------------------------------------
// 5. Point-in-polygon
// ---------------------------------------------------------------
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
                      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------
// 6. SVG compression config
// ---------------------------------------------------------------
const SVGO_CONFIG = {
  plugins: [
    { name: 'removeViewBox', active: false },
    { name: 'removeDimensions', active: false },
    { name: 'convertColors', active: true },
    { name: 'cleanupNumericValues', active: true, params: { floatPrecision: 2 } },
    { name: 'convertPathData', active: true, params: { floatPrecision: 2 } },
  ]
};

// ---------------------------------------------------------------
// 7. Main
// ---------------------------------------------------------------
(async () => {
  try {
    console.log('Starting generation...');
    const topo = await fetchTopojson();
    console.log('Converting polygons...');
    const polygons = topoToPolygons(topo);
    console.log(` → ${polygons.length} polygons`);

    // ---- rasterize (coarser grid for speed) ----
    const step = 0.4;      // 0.4° → ~500 k dots (still crisp)
    const sub = 2;
    const jitter = 0.06;
    const dots = [];

    console.log('Rasterizing land...');
    const t0 = Date.now();
    for (let lat = -90; lat <= 90; lat += step) {
      for (let lng = -180; lng <= 180; lng += step) {
        for (let sy = 0; sy < sub; sy++) {
          for (let sx = 0; sx < sub; sx++) {
            const l = lat + (sy + 0.5) * step / sub + (Math.random() - 0.5) * jitter;
            const g = lng + (sx + 0.5) * step / sub + (Math.random() - 0.5) * jitter;
            if (l < -90 || l > 90 || g < -180 || g > 180) continue;
            if (polygons.some(p => pointInPoly([g, l], p))) dots.push({ lat: l, lng: g });
          }
        }
      }
    }
    console.log(`Done: ${dots.length} dots in ${(Date.now() - t0) / 1000}s`);

    // ---- build SVG ----
    const w = 1000, h = 500;
    const circles = dots.map(d => {
      const x = ((d.lng + 180) / 360 * w).toFixed(2);
      const y = ((90 - d.lat) / 180 * h).toFixed(2);
      return `<circle cx="${x}" cy="${y}" r="0.5" fill="#6ca0ff"/>`;
    }).join('');

    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#000"/>
  ${circles}
</svg>`;

    // ---- compress inline ----
    console.log('Compressing SVG...');
    const compressed = optimize(rawSvg, SVGO_CONFIG).data;
    const sizeMB = (compressed.length / 1024 / 1024).toFixed(2);
    fs.writeFileSync('land-dots.svg', compressed);
    console.log(`land-dots.svg saved – ${sizeMB} MB`);
  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
})();
