// 3D view: render window, VTP loading, diverging LUT, scalar bar, BC hue overlay.
// Uses the vendored UMD bundle (global `vtk`).

const { vtkGenericRenderWindow } = vtk.Rendering.Misc;
const { vtkMapper, vtkActor, vtkColorTransferFunction, vtkScalarBarActor } =
  vtk.Rendering.Core;
const vtkXMLPolyDataReader = vtk.IO.XML.vtkXMLPolyDataReader;

// matplotlib RdBu_r anchors, min -> max (blue = negative, red = positive),
// matching the TOSA trame viewer's colormap policy for shape derivatives.
const RDBU_R = [
  '#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7',
  '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f',
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
  RDBU_R.forEach((hex, i) => {
    const x = lo + (i / (RDBU_R.length - 1)) * (hi - lo);
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

  function clearSurface() {
    if (surfaceActor) renderer.removeActor(surfaceActor);
    if (scalarBar) renderer.removeActor(scalarBar);
    surfaceActor = null;
    scalarBar = null;
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

    scalarBar = vtkScalarBarActor.newInstance();
    scalarBar.setScalarsToColors(lut);
    scalarBar.setAxisLabel(scalar.name);
    if (scalarBar.setAxisTextStyle) {
      scalarBar.setAxisTextStyle({ fontColor: 'black' });
      scalarBar.setTickTextStyle({ fontColor: 'black' });
    }
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
    clearSurface,
    resetCamera,
    render: () => renderWindow.render(),
  };
}
