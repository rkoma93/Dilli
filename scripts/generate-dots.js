// scripts/generate-dots.js
const fs = require('fs');
const fetch = require('node-fetch');

async function fetchTopojson() {
  const urls = [
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
    'https://unpkg.com/world-atlas@2/countries-110m.json'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (_) {}
  }
  throw new Error('Failed to load map');
}

function topoToPolygons(topo) {
  const { transform, arcs, objects } = topo;
  const scale = transform.scale, translate = transform.translate;
  const polys = [];

  function decode(idx) {
    const arc = arcs[Math.abs(idx)];
    const rev = idx < 0;
    let x = 0, y = 0;
    const pts = arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
    return rev ? pts.reverse() : pts;
  }

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

(async () => {
  console.log('Fetching map...');
  const topo = await fetchTopojson();
  console.log('Converting...');
  const polygons = topoToPolygons(topo);

  const step = 0.3;          // 0.3° → ~1 M points
  const sub = 2;             // 2×2 sub-samples per cell
  const jitter = 0.08;
  const dots = [];

  console.log('Rasterizing land...');
  for (let lat = -90; lat <= 90; lat += step) {
    for (let lng = -180; lng <= 180; lng += step) {
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const l = lat + (sy + 0.5) * step / sub + (Math.random() - 0.5) * jitter;
          const g = lng + (sx + 0.5) * step / sub + (Math.random() - 0.5) * jitter;
          if (l < -90 || l > 90 || g < -180 || g > 180) continue;
          if (polygons.some(p => pointInPoly([g, l], p))) {
            dots.push({ lat: l, lng: g });
          }
        }
      }
    }
  }

  console.log(`Generated ${dots.length} dots`);

  // ---- SVG output (1000×500 viewBox) ----
  const w = 1000, h = 500;
  const circles = dots.map(d => {
    const x = (d.lng + 180) / 360 * w;
    const y = (90 - d.lat) / 180 * h;
    return `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="0.4" fill="#6ca0ff"/>`;
  }).join('\n    ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#000"/>
  ${circles}
</svg>`;

  fs.writeFileSync('land-dots.svg', svg.trim());
  console.log('Saved land-dots.svg');
})();
