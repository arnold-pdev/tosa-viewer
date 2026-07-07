// App shell: manifest fetch, sample list, scalar select, load arrows.

import { createViewer, displayRange } from './viewer.js';
import { buildLoadActors } from './arrows.js';

const els = {
  samples: document.getElementById('samples'),
  scalar: document.getElementById('scalar'),
  showLoads: document.getElementById('show-loads'),
  reset: document.getElementById('reset-camera'),
  provenance: document.getElementById('provenance'),
  status: document.getElementById('status'),
  view: document.getElementById('view'),
};

const viewer = createViewer(els.view);
window.__viewer = viewer; // debug handle (harmless in production)
const vtpCache = new Map();
let manifest = null;
let current = null; // active manifest sample entry
let loadActors = [];

function status(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('visible', Boolean(message));
  els.status.classList.toggle('error', isError);
}

async function fetchVtp(sample) {
  if (!vtpCache.has(sample.vtp)) {
    const resp = await fetch(`data/${sample.vtp}`);
    if (!resp.ok) throw new Error(`fetch ${sample.vtp}: HTTP ${resp.status}`);
    vtpCache.set(sample.vtp, await resp.arrayBuffer());
  }
  return vtpCache.get(sample.vtp);
}

function setLoadActors(sample) {
  loadActors.forEach((a) => viewer.renderer.removeActor(a));
  loadActors = buildLoadActors(sample.loads || [], sample.shape);
  const visible = els.showLoads.checked;
  loadActors.forEach((a) => {
    a.setVisibility(visible);
    viewer.renderer.addActor(a);
  });
}

function fillScalarSelect(sample) {
  els.scalar.innerHTML = '';
  for (const scalar of sample.scalars) {
    const opt = document.createElement('option');
    opt.value = scalar.name;
    const [lo, hi] = displayRange(scalar);
    opt.textContent = `${scalar.name}  [${lo.toPrecision(3)}, ${hi.toPrecision(3)}]`;
    els.scalar.appendChild(opt);
  }
  els.scalar.value = sample.defaultScalar;
}

async function showSample(sample, scalarName) {
  try {
    status(`Loading sample ${sample.index}…`);
    const scalar =
      sample.scalars.find((s) => s.name === scalarName) || sample.scalars[0];
    const buffer = await fetchVtp(sample);
    await viewer.showSurface(buffer, scalar);
    setLoadActors(sample);
    if (current?.index !== sample.index) viewer.resetCamera();
    current = sample;
    viewer.render();
    for (const li of els.samples.children) {
      li.classList.toggle('active', Number(li.dataset.index) === sample.index);
    }
    status('');
  } catch (err) {
    console.error(err);
    status(`Failed to load sample ${sample.index}: ${err.message}`, true);
  }
}

function buildSampleList() {
  for (const sample of manifest.samples) {
    const li = document.createElement('li');
    li.dataset.index = sample.index;
    const loads = sample.loads?.length ?? 0;
    li.innerHTML =
      `#${sample.index} <small>${sample.shape.join('×')} · ` +
      `${loads} load${loads === 1 ? '' : 's'}</small>`;
    li.addEventListener('click', () => {
      fillScalarSelect(sample);
      showSample(sample, sample.defaultScalar);
    });
    els.samples.appendChild(li);
  }
}

async function init() {
  try {
    const resp = await fetch('data/manifest.json');
    if (!resp.ok) throw new Error(`manifest: HTTP ${resp.status}`);
    manifest = await resp.json();
  } catch (err) {
    status(`Failed to load manifest: ${err.message}`, true);
    return;
  }

  buildSampleList();
  els.provenance.innerHTML =
    `${manifest.samples.length} sample(s) · generated ${manifest.generated}<br>` +
    `<a href="https://github.com/arnold-pdev/TOSA/tree/${manifest.tosa_commit}" ` +
    `target="_blank" rel="noopener">TOSA @ ${manifest.tosa_commit.slice(0, 12)}</a>`;

  els.scalar.addEventListener('change', () => {
    if (current) showSample(current, els.scalar.value);
  });
  els.showLoads.addEventListener('change', () => {
    loadActors.forEach((a) => a.setVisibility(els.showLoads.checked));
    viewer.render();
  });
  els.reset.addEventListener('click', () => viewer.resetCamera());

  if (manifest.samples.length) {
    fillScalarSelect(manifest.samples[0]);
    showSample(manifest.samples[0], manifest.samples[0].defaultScalar);
  } else {
    status('Manifest has no samples — run the exporter in TOSA.', true);
  }
}

init();
