// scripts/generate-dots.js
// ---------------------------------------------------------------
// 1. Dependencies
// ---------------------------------------------------------------
const fs = require('fs');
const fetch = require('node-fetch');
const { optimize } = require('svgo');

// ---------------------------------------------------------------
// 2. URLs – the file is now in /topojson/ folder
// ---------------------------------------------------------------
const PRIMARY_URL  = 'https://raw.githubusercontent.com/topojson/world-atlas/master/topojson/countries-110m.json';
const FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ---------------------------------------------------------------
// 3. Fetch with timeout & fallback
// ---------------------------------------------------------------
async function fetchTopojson() {
  const urls = [PRIMARY_URL, FALLBACK_URL];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n--- Attempt ${i + 1}: ${url} ---`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      console.log(`Status: ${res.status}`);
      if (!res.ok) { console.log('Not OK – next'); continue; }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) { console.log('Not JSON – next'); continue; }

      const data = await res.json();
      if (data.type && data.objects && data.arcs) {
        console.log('Valid TopoJSON');
        return data;
      }
    } catch (e) {
      console.log('Error:', e.name === 'AbortError' ? 'timeout' : e.message);
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
// 6. Chunked SVGO compression (prevents OOM)
// ---------------------------------------------------------------
function compressChunk(svgChunk) {
  return optimize(svgChunk, {
    multipass: true,
    plugins: [
      { name: 'preset-default', params: { overrides: { cleanupNumericValues: { floatPrecision: 2 } } } }
    ]
  }).data;
}

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

    // ---- FAST rasterize (0.6° grid → ~200 k dots) ----
    const step = 0.6;      // 0.6° = ~200 k dots, still crisp
    const sub = 1;         // 1×1 sub-sample (good enough)
    const jitter = 0.08;
    const dots = [];

    console.log('Rasterizing land...');
    const t0 = Date.now();
    for (let lat = -90; lat <= 90; lat += step) {
      for (let lng = -180; lng <= 180; lng += step) {
        const l = lat + (Math.random() - 0.5) * jitter;
        const g = lng + (Math.random() - 0.5) * jitter;
        if (l < -90 || l > 90 || g < -180 || g > 180) continue;
        if (polygons.some(p => pointInPoly([g, l], p))) dots.push({ lat: l, lng: g });
      }
    }
    console.log(`Done: ${dots.length} dots in ${(Date.now() - t0) / 1000}s`);

    // ---- Build SVG in chunks ----
    const w = 1000, h = 500;
    const chunkSize = 50000;   // 50 k circles per chunk
    const chunks = [];
    for (let i = 0; i < dots.length; i += chunkSize) {
      const slice = dots.slice(i, i + chunkSize);
      const circles = slice.map(d => {
        const x = ((d.lng + 180) / 360 * w).toFixed(2);
        const y = ((90 - d.lat) / 180 * h).toFixed(2);
        return `<circle cx="${x}" cy="${y}" r="0.6" fill="#6ca0ff"/>`;
      }).join('');
      chunks.push(circles);
    }

    console.log(`Compressing ${chunks.length} SVG chunks...`);
    const compressedChunks = chunks.map(chunk => compressChunk(`<g>${chunk}</g>`));
    const finalSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#000"/>
  ${compressedChunks.join('')}
</svg>`;

    fs.writeFileSync('land-dots.svg', finalSvg);
    const sizeMB = (finalSvg.length / 1024 / 1024).toFixed(2);
    console.log(`land-dots.svg saved – ${sizeMB} MB`);
  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
})();
