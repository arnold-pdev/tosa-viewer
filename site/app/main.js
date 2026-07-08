// App shell: manifest fetch, sample list, scalar select, load arrows, BC legend.

import { createViewer, displayRange } from './viewer.js?v=11';
import { buildLoadActors } from './arrows.js?v=11';

const els = {
  samples: document.getElementById('samples'),
  scalar: document.getElementById('scalar'),
  showLoads: document.getElementById('show-loads'),
  reset: document.getElementById('reset-camera'),
  provenance: document.getElementById('provenance'),
  compliance: document.getElementById('compliance'),
  status: document.getElementById('status'),
  view: document.getElementById('view'),
  displayMode: document.getElementById('display-mode'),
};

const viewer = createViewer(els.view);
window.__viewer = viewer;
const vtpCache = new Map();
let manifest = null;
let current = null;
let loadActors = [];
let displayMode = 'mesh';

function selectedMode() {
  const checked = els.displayMode?.querySelector('input:checked');
  return checked ? checked.value : 'mesh';
}

function status(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('visible', Boolean(message));
  els.status.classList.toggle('error', isError);
}

async function fetchVtp(rel) {
  if (!vtpCache.has(rel)) {
    const resp = await fetch(`data/${rel}`);
    if (!resp.ok) throw new Error(`fetch ${rel}: HTTP ${resp.status}`);
    vtpCache.set(rel, await resp.arrayBuffer());
  }
  return vtpCache.get(rel);
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

function formatCompliance(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1e5 || (abs > 0 && abs < 1e-2)) return n.toExponential(4);
  return n.toPrecision(5);
}

function complianceRow(label, sublabel, value, extra = '') {
  const sub = sublabel ? ` <span class="c-sub">${sublabel}</span>` : '';
  return (
    `<p class="c-row"><span class="c-label">${label}</span>${sub} ` +
    `<span class="c-value">${value}</span>${extra}</p>`
  );
}

// The ATOMS hex compliance of an INITIAL design is recorded on its refined
// children as `complianceVoxelInit`. Recover it so Initial samples can show it.
function initialVoxelCompliance(sample) {
  if (sample.complianceVoxelInit != null) return sample.complianceVoxelInit;
  if (!manifest || sample.id == null) return null;
  const child = manifest.samples.find(
    (s) => s.parentId === sample.id && s.complianceVoxelInit != null,
  );
  return child ? child.complianceVoxelInit : null;
}

function updateCompliance(sample) {
  if (!els.compliance) return;
  const rows = [];

  const isRefined = sample.volumeFractionActual != null;

  // --- Volume fraction ---
  if (isRefined) {
    // Target = ATOMS volume constraint (parent solid fraction at ρ_raw>0).
    // Actual = realized solid fraction of the refined field at ρ>0.5.
    const target = sample.volumeFractionTarget ?? sample.volumeFraction;
    rows.push(
      complianceRow(
        'Target volume fraction',
        '(ATOMS constraint = initial, ρ&gt;0)',
        Number(target).toFixed(4),
      ),
    );
    rows.push(
      complianceRow(
        'Actual volume fraction',
        '(this design, ρ&gt;0.5)',
        Number(sample.volumeFractionActual).toFixed(4),
      ),
    );
  } else if (sample.volumeFraction != null) {
    rows.push(
      complianceRow(
        'Volume fraction',
        '(this design, ρ&gt;0)',
        Number(sample.volumeFraction).toFixed(4),
      ),
    );
  }

  // --- FE (tet mesh) compliance ---
  const meshC = sample.complianceMesh ?? sample.compliance;
  if (meshC != null) {
    rows.push(
      complianceRow(
        'Mesh compliance',
        isRefined ? '(FE tet, this design)' : '(FE tet)',
        formatCompliance(meshC),
      ),
    );
  }

  // Initial (pre-ATOMS) FE compliance, from the parent entry.
  if (isRefined && sample.parentId && manifest) {
    const parent = manifest.samples.find((s) => s.id === sample.parentId);
    const parentC = parent?.complianceMesh ?? parent?.compliance;
    if (parentC != null) {
      rows.push(
        complianceRow(
          'Initial mesh compliance',
          '(FE tet, before ATOMS)',
          formatCompliance(parentC),
        ),
      );
    }
  }

  // --- ATOMS voxel (32³ hex) compliance ---
  if (isRefined && sample.complianceVoxel != null) {
    const before =
      sample.complianceVoxelInit != null
        ? ` <span class="c-parent">(before ATOMS ${formatCompliance(sample.complianceVoxelInit)})</span>`
        : '';
    rows.push(
      complianceRow(
        'ATOMS voxel compliance',
        '(32³ hex, after ATOMS, ρ&gt;0.5)',
        formatCompliance(sample.complianceVoxel),
        before,
      ),
    );
  } else if (!isRefined) {
    // Initial design: show its own hex compliance (recovered from a child).
    const voxInit = initialVoxelCompliance(sample);
    if (voxInit != null) {
      rows.push(
        complianceRow(
          'ATOMS voxel compliance',
          '(32³ hex, this design, ρ&gt;0.5)',
          formatCompliance(voxInit),
        ),
      );
    }
  }

  if (rows.length) {
    els.compliance.innerHTML = rows.join('');
    els.compliance.classList.add('visible');
  } else {
    els.compliance.innerHTML = '';
    els.compliance.classList.remove('visible');
  }
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

function sampleKey(sample) {
  if (!sample) return '';
  return sample.id != null ? String(sample.id) : String(sample.index);
}

function sampleLabel(sample) {
  if (sample.title) return sample.title;
  if (sample.id) return sample.id;
  return `#${sample.index}`;
}

function sampleBadge(sample) {
  if (sample.kind === 'generated' && sample.generator) {
    return sample.generator === 'gan' ? '[GAN]' : '[Diff]';
  }
  return '';
}

const DISPLAY_ATOMS_STEPS = [5, 10];

function atomsStepFromSample(sample) {
  const id = sample.id || '';
  const m = id.match(/-atoms(\d+)$/);
  if (m) return parseInt(m[1], 10);
  const ref = sample.refinement || '';
  const rm = ref.match(/^atoms-(\d+)iter$/);
  return rm ? parseInt(rm[1], 10) : null;
}

function variantLabel(sample) {
  const gen = sample.generator === 'gan' ? 'GAN' : 'Diffusion';
  return `${sampleBadge(sample)} ${gen} · var ${sample.variant}`;
}

function refinementLabel(step) {
  return step == null ? 'Initial' : `ATOMS×${step}`;
}

function appendSampleLeaf(parent, sample, label) {
  const li = document.createElement('li');
  li.className = 'sample-leaf';
  li.dataset.key = sampleKey(sample);
  const parts = [];
  if (sample.volumeFraction != null) {
    parts.push(`VF ${Number(sample.volumeFraction).toFixed(3)}`);
  }
  const meshC = sample.complianceMesh ?? sample.compliance;
  if (meshC != null) {
    parts.push(`MC ${formatCompliance(meshC)}`);
  }
  const meta = parts.length ? ` · ${parts.join(' · ')}` : '';
  li.innerHTML = `${label}<small>${meta}</small>`;
  li.addEventListener('click', () => {
    fillScalarSelect(sample);
    showSample(sample, sample.defaultScalar);
  });
  parent.appendChild(li);
}

function generatorName(generator) {
  return generator === 'gan' ? 'GAN' : generator === 'diffusion' ? 'Diffusion' : '?';
}

function buildGeneratedTree(generated) {
  /** @type {Map<number, { generator: string, variants: Map<string, { initial?: object, refinements: Map<number, object> }> }>} */
  const byTrain = new Map();

  for (const sample of generated) {
    const trainIdx = sample.trainingIndex;
    if (trainIdx == null) continue;
    const variantKey = `${sample.generator ?? '?'}-${sample.variant ?? 0}`;
    if (!byTrain.has(trainIdx)) {
      byTrain.set(trainIdx, {
        generator: sample.generator ?? '?',
        variants: new Map(),
      });
    }
    const group = byTrain.get(trainIdx);
    const variants = group.variants;
    if (!variants.has(variantKey)) {
      variants.set(variantKey, { initial: undefined, refinements: new Map() });
    }
    const bucket = variants.get(variantKey);
    const step = atomsStepFromSample(sample);
    if (step == null && !sample.parentId) {
      bucket.initial = sample;
    } else if (step != null) {
      bucket.refinements.set(step, sample);
    }
  }

  const heading = document.createElement('li');
  heading.className = 'section';
  heading.textContent = 'Generated samples';
  els.samples.appendChild(heading);

  const trainIndices = [...byTrain.keys()].sort((a, b) => a - b);
  for (const trainIdx of trainIndices) {
    const group = byTrain.get(trainIdx);
    const details = document.createElement('details');
    details.className = 'train-group';
    if (trainIdx === trainIndices[0]) details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = `${generatorName(group.generator)} · train #${trainIdx}`;
    details.appendChild(summary);

    const variantRoot = document.createElement('ul');
    variantRoot.className = 'variant-list';

    const variants = group.variants;
    const variantKeys = [...variants.keys()].sort((a, b) => {
      const [ga, va] = a.split('-');
      const [gb, vb] = b.split('-');
      if (ga !== gb) return ga.localeCompare(gb);
      return Number(va) - Number(vb);
    });

    for (const variantKey of variantKeys) {
      const bucket = variants.get(variantKey);
      const refSample = bucket.initial ?? bucket.refinements.values().next().value;
      if (!refSample) continue;

      const variantDetails = document.createElement('details');
      variantDetails.className = 'variant-group';
      variantDetails.open = true;

      const variantSummary = document.createElement('summary');
      variantSummary.textContent = variantLabel(refSample);
      variantDetails.appendChild(variantSummary);

      const leafList = document.createElement('ul');
      leafList.className = 'refinement-list';

      if (bucket.initial) {
        appendSampleLeaf(leafList, bucket.initial, 'Initial');
      }

      for (const step of DISPLAY_ATOMS_STEPS) {
        const refined = bucket.refinements.get(step);
        if (refined) appendSampleLeaf(leafList, refined, refinementLabel(step));
      }

      variantDetails.appendChild(leafList);
      variantRoot.appendChild(variantDetails);
    }

    details.appendChild(variantRoot);
    const trainLi = document.createElement('li');
    trainLi.className = 'train-wrap';
    trainLi.appendChild(details);
    els.samples.appendChild(trainLi);
  }
}

function setActiveSample(key) {
  for (const li of els.samples.querySelectorAll('[data-key]')) {
    li.classList.toggle('active', li.dataset.key === key);
  }
}

function syncModeControls(sample) {
  const voxelAvailable = Boolean(sample.voxelVtp);
  const voxelRadio = els.displayMode?.querySelector('input[value="voxel"]');
  if (voxelRadio) voxelRadio.disabled = !voxelAvailable;
  // Fall back to mesh if voxel was requested but this sample has no grid.
  if (displayMode === 'voxel' && !voxelAvailable) {
    displayMode = 'mesh';
    const meshRadio = els.displayMode?.querySelector('input[value="mesh"]');
    if (meshRadio) meshRadio.checked = true;
  }
  // Scalar coloring only applies to the FE mesh.
  els.scalar.disabled = displayMode === 'voxel';
}

async function showSample(sample, scalarName) {
  try {
    status(`Loading ${sampleLabel(sample)}…`);
    syncModeControls(sample);
    const key = sampleKey(sample);
    const sameSample = current && sampleKey(current) === key;

    if (displayMode === 'voxel' && sample.voxelVtp) {
      const buffer = await fetchVtp(sample.voxelVtp);
      const bcBuffer = sample.bcVtp ? await fetchVtp(sample.bcVtp) : null;
      await viewer.showVoxels(buffer, bcBuffer);
    } else {
      const scalar =
        sample.scalars.find((s) => s.name === scalarName) || sample.scalars[0];
      const buffer = await fetchVtp(sample.vtp);
      await viewer.showSurface(buffer, scalar);
    }

    setLoadActors(sample);
    updateCompliance(sample);
    if (!sameSample) viewer.resetCamera();
    current = sample;
    viewer.render();
    setActiveSample(key);
    status('');
  } catch (err) {
    console.error(err);
    status(`Failed to load ${sampleLabel(sample)}: ${err.message}`, true);
  }
}

function buildSampleList() {
  const nitoSamples = manifest.samples.filter((s) => s.kind !== 'generated');
  const generated = manifest.samples.filter((s) => s.kind === 'generated');

  function appendFlatSection(title, samples) {
    if (!samples.length) return;
    const heading = document.createElement('li');
    heading.className = 'section';
    heading.textContent = title;
    els.samples.appendChild(heading);
    for (const sample of samples) {
      const li = document.createElement('li');
      li.className = 'sample-leaf';
      li.dataset.key = sampleKey(sample);
      const loads = sample.loads?.length ?? 0;
      li.innerHTML =
        `#${sample.index} ` +
        `<small>${sample.shape.join('×')} · ` +
        `${loads} load${loads === 1 ? '' : 's'}</small>`;
      li.addEventListener('click', () => {
        fillScalarSelect(sample);
        showSample(sample, sample.defaultScalar);
      });
      els.samples.appendChild(li);
    }
  }

  appendFlatSection('NITO training', nitoSamples);
  buildGeneratedTree(generated);
}

async function init() {
  try {
    const resp = await fetch('data/manifest.json', { cache: 'no-store' });
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
  els.displayMode?.addEventListener('change', () => {
    displayMode = selectedMode();
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
