// 3D view: render window, VTP loading, diverging LUT, scalar bar, BC hue overlay.
// Uses the vendored UMD bundle (global `vtk`).

const { vtkGenericRenderWindow } = vtk.Rendering.Misc;
const { vtkMapper, vtkActor, vtkColorTransferFunction, vtkScalarBarActor } =
  vtk.Rendering.Core;
const vtkXMLPolyDataReader = vtk.IO.XML.vtkXMLPolyDataReader;

// matplotlib RdBu anchors, min -> max (red = negative, blue = positive).
// Negative shape derivative = moving the boundary outward (adding material)
// lowers compliance, so "wants to grow" reads warm/red.
const RDBU = [
  '#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7',
  '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061',
];

// Translucent slate-teal for fixed BC patches.
const BC_HUE = [0.35, 0.62, 0.58];

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

export function displayRange(scalar) {
  // Prefer the exporter's robust (99th-percentile) range so a single
  // hotspot cannot wash out the colormap; values beyond it clamp to the
  // end colors. Fall back to the full range, symmetric for diverging fields.
  if (scalar.robustRange) return scalar.robustRange;
  if (scalar.diverging) {
    const bound = Math.max(Math.abs(scalar.range[0]), Math.abs(scalar.range[1])) || 1;
    return [-bound, bound];
  }
  return scalar.range;
}

function buildLut(scalar) {
  const [lo, hi] = displayRange(scalar);
  const lut = vtkColorTransferFunction.newInstance();
  RDBU.forEach((hex, i) => {
    const x = lo + (i / (RDBU.length - 1)) * (hi - lo);
    lut.addRGBPoint(x, ...hexToRgb(hex));
  });
  lut.setMappingRange(lo, hi);
  return lut;
}

export function createViewer(container) {
  const grw = vtkGenericRenderWindow.newInstance({ background: [1, 1, 1] });
  grw.setContainer(container);
  grw.resize();
  window.addEventListener('resize', () => grw.resize());

  const renderer = grw.getRenderer();
  const renderWindow = grw.getRenderWindow();

  let surfaceActor = null;
  let scalarBar = null;
  let bcActor = null;

  function clearSurface() {
    if (surfaceActor) renderer.removeActor(surfaceActor);
    if (scalarBar) renderer.removeActor(scalarBar);
    if (bcActor) renderer.removeActor(bcActor);
    surfaceActor = null;
    scalarBar = null;
    bcActor = null;
  }

  async function showSurface(arrayBuffer, scalar) {
    clearSurface();

    const reader = vtkXMLPolyDataReader.newInstance();
    reader.parseAsArrayBuffer(arrayBuffer);
    const polydata = reader.getOutputData(0);
    polydata.getPointData().setActiveScalars(scalar.name);

    const lut = buildLut(scalar);
    const mapper = vtkMapper.newInstance({
      interpolateScalarsBeforeMapping: true,
      useLookupTableScalarRange: true,
    });
    mapper.setInputData(polydata);
    mapper.setLookupTable(lut);
    mapper.setScalarVisibility(true);

    surfaceActor = vtkActor.newInstance();
    surfaceActor.setMapper(mapper);
    const prop = surfaceActor.getProperty();
    prop.setAmbient(0.65);
    prop.setDiffuse(0.35);
    prop.setSpecular(0);
    renderer.addActor(surfaceActor);

    return finishScalarBar(lut, scalar, polydata);
  }

  // Blocky input voxel grid: solid fill + cube edges, no scalar coloring/bar.
  // Optional bcBuffer overlays the fixed-BC patch faces in teal.
  async function showVoxels(arrayBuffer, bcBuffer = null) {
    clearSurface();

    const reader = vtkXMLPolyDataReader.newInstance();
    reader.parseAsArrayBuffer(arrayBuffer);
    const polydata = reader.getOutputData(0);

    const mapper = vtkMapper.newInstance({ scalarVisibility: false });
    mapper.setInputData(polydata);

    surfaceActor = vtkActor.newInstance();
    surfaceActor.setMapper(mapper);
    const prop = surfaceActor.getProperty();
    prop.setColor(0.62, 0.66, 0.72);
    prop.setAmbient(0.45);
    prop.setDiffuse(0.55);
    prop.setSpecular(0);
    prop.setEdgeVisibility(true);
    prop.setEdgeColor(0.25, 0.28, 0.33);
    prop.setLineWidth(1);
    renderer.addActor(surfaceActor);

    if (bcBuffer) {
      const bcReader = vtkXMLPolyDataReader.newInstance();
      bcReader.parseAsArrayBuffer(bcBuffer);
      const bcPoly = bcReader.getOutputData(0);
      const bcMapper = vtkMapper.newInstance({ scalarVisibility: false });
      bcMapper.setInputData(bcPoly);

      bcActor = vtkActor.newInstance();
      bcActor.setMapper(bcMapper);
      const bcProp = bcActor.getProperty();
      bcProp.setColor(...BC_HUE);
      bcProp.setAmbient(0.7);
      bcProp.setDiffuse(0.3);
      bcProp.setSpecular(0);
      renderer.addActor(bcActor);
    }

    return polydata;
  }

  function finishScalarBar(lut, scalar, polydata) {
    scalarBar = vtkScalarBarActor.newInstance();
    scalarBar.setScalarsToColors(lut);
    scalarBar.setAxisLabel(scalar.name);
    if (scalarBar.setAxisTextStyle) {
      // Match the page's system UI font stack (see style.css `body`).
      const fontFamily =
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      scalarBar.setAxisTextStyle({
        fontFamily,
        fontStyle: 'normal',
        fontColor: '#1a1a2e',
      });
      scalarBar.setTickTextStyle({
        fontFamily,
        fontStyle: 'normal',
        fontColor: '#1a1a2e',
      });
    }
    // Scientific-notation tick labels spanning the mapping range.
    // The helper exposes getLastTickBounds() = [lo, hi] (the LUT range).
    scalarBar.setGenerateTicks((helper) => {
      const [lo, hi] = helper.getLastTickBounds();
      const n = 5;
      const ticks = [];
      const labels = [];
      for (let i = 0; i < n; i += 1) {
        const v = lo + (i / (n - 1)) * (hi - lo);
        ticks.push(v);
        labels.push(v.toExponential(2));
      }
      helper.setTicks(ticks);
      helper.setTickStrings(labels);
    });
    renderer.addActor(scalarBar);

    return polydata;
  }

  function resetCamera() {
    renderer.resetCamera();
    renderWindow.render();
  }

  return {
    renderer,
    renderWindow,
    showSurface,
    showVoxels,
    clearSurface,
    resetCamera,
    render: () => renderWindow.render(),
  };
}
