// scripts/generate-dots.js
const fs = require('fs');
const fetch = require('node-fetch');

// Primary: GitHub raw (reliable, but let's fallback if needed)
const PRIMARY_URL = 'https://raw.githubusercontent.com/topojson/world-atlas/master/countries-110m.json';
// Fallback: CDN (worked before, but sometimes blocked in Actions)
const FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

async function fetchTopojson() {
  const urls = [PRIMARY_URL, FALLBACK_URL];
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n--- Attempt ${i + 1}: Fetching from ${url} ---`);
    
    try {
      const res = await fetch(url);
      console.log(`Response status: ${res.status} ${res.statusText}`);
      console.log(`Response headers: ${JSON.stringify([...res.headers.entries()])}`);
      
      if (!res.ok) {
        console.log(`❌ HTTP ${res.status}: ${res.statusText} - Skipping to next URL`);
        continue;
      }
      
      const contentType = res.headers.get('content-type');
      console.log(`Content-Type: ${contentType}`);
      
      if (!contentType || !contentType.includes('application/json')) {
        console.log('❌ Not JSON - Skipping');
        continue;
      }
      
      const data = await res.json();
      console.log(`✅ Loaded ${Object.keys(data).length} keys from JSON`);
      if (data.type && data.objects && data.arcs) {
        console.log('✅ Valid TopoJSON structure confirmed');
        return data;
      } else {
        console.log('❌ Invalid TopoJSON structure - Skipping');
      }
    } catch (err) {
      console.log(`❌ Fetch error: ${err.message} - Retrying next URL`);
    }
  }
  
  throw new Error(`All ${urls.length} sources failed. Check logs above.`);
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
  try {
    console.log('🚀 Starting land-dots generation...');
    const topo = await fetchTopojson();
    console.log('📊 Map loaded, converting polygons...');
    const polygons = topoToPolygons(topo);
    console.log(`   → Extracted ${polygons.length} polygons`);

    const step = 0.3;
    const sub = 2;
    const jitter = 0.08;
    const dots = [];

    console.log('🗺️  Rasterizing land dots... (this takes ~10-15 sec)');
    const startTime = Date.now();
    let processed = 0;
    const totalCells = Math.ceil(180 / step) * Math.ceil(360 / step);
    
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
        processed++;
        if (processed % 1000 === 0) {
          console.log(`   Progress: ${((processed / totalCells) * 100).toFixed(1)}% (${dots.length} dots so far)`);
        }
      }
    }
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`✅ Rasterization complete: ${dots.length} dots in ${elapsed.toFixed(1)}s`);

    // SVG: 1000×500 viewBox
    const w = 1000, h = 500;
    console.log('🎨 Generating SVG...');
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
    const svgSize = (svg.length / 1024 / 1024).toFixed(2);
    console.log(`💾 land-dots.svg saved! Size: ~${svgSize} MB`);
  } catch (err) {
    console.error('💥 Generation failed:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
})();
