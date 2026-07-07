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

function extractFixedCells(polydata) {
  const fixed = polydata.getCellData().getArrayByName('fixed');
  if (!fixed) return null;

  const polys = polydata.getPolys();
  if (!polys) return null;

  const nCells = polydata.getNumberOfCells();
  const fixedIds = [];
  for (let c = 0; c < nCells; c += 1) {
    if (fixed.getComponent(c, 0) === 1) fixedIds.push(c);
  }
  if (!fixedIds.length) return null;

  const pts = polydata.getPoints();
  const outPts = vtk.Common.Core.vtkPoints.newInstance();
  const outCells = vtk.Common.Core.vtkCellArray.newInstance();
  const pointMap = new Map();

  function mapPoint(pid) {
    if (!pointMap.has(pid)) {
      const idx = pointMap.size;
      pointMap.set(pid, idx);
      outPts.insertNextPoint(pts.getPoint(pid));
    }
    return pointMap.get(pid);
  }

  for (const cid of fixedIds) {
    const cell = polydata.getCell(cid);
    const ids = cell.getPointIds();
    const n = ids.getNumberOfIds();
    if (n < 3) continue;
    const tri = [mapPoint(ids.getId(0)), mapPoint(ids.getId(1)), mapPoint(ids.getId(2))];
    outCells.insertNextCell(3, tri);
    if (n === 4) {
      outCells.insertNextCell(
        3,
        [tri[0], tri[2], mapPoint(ids.getId(3))],
      );
    }
  }

  const out = vtk.Common.DataModel.vtkPolyData.newInstance();
  out.setPoints(outPts);
  out.setPolys(outCells);
  return out;
}

export function createViewer(container) {
  const grw = vtkGenericRenderWindow.newInstance({ background: [1, 1, 1] });
  grw.setContainer(container);
  grw.resize();
  window.addEventListener('resize', () => grw.resize());

  const renderer = grw.getRenderer();
  const renderWindow = grw.getRenderWindow();

  let surfaceActor = null;
  let fixedActor = null;
  let scalarBar = null;

  function clearSurface() {
    if (surfaceActor) renderer.removeActor(surfaceActor);
    if (fixedActor) renderer.removeActor(fixedActor);
    if (scalarBar) renderer.removeActor(scalarBar);
    surfaceActor = null;
    fixedActor = null;
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

    const fixedPoly = extractFixedCells(polydata);
    if (fixedPoly) {
      const fixedMapper = vtkMapper.newInstance();
      fixedMapper.setInputData(fixedPoly);
      fixedActor = vtkActor.newInstance();
      fixedActor.setMapper(fixedMapper);
      const fp = fixedActor.getProperty();
      fp.setColor(...BC_HUE);
      fp.setOpacity(0.35);
      fp.setAmbient(0.9);
      fp.setDiffuse(0.1);
      fp.setSpecular(0);
      // Pull overlay slightly toward the camera to reduce z-fighting.
      if (fixedMapper.setResolveCoincidentTopologyToPolygonOffset) {
        fixedMapper.setResolveCoincidentTopologyToPolygonOffset();
        fixedMapper.setResolveCoincidentTopologyPolygonOffsetParameters(-1, -1);
      }
      renderer.addActor(fixedActor);
    }

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
