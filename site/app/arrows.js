// Load-anchor markers: an arrow per NITO load, tip touching the anchor,
// pointing along the force direction, plus a small sphere at the anchor.

const { vtkActor, vtkMapper } = vtk.Rendering.Core;
const { vtkArrowSource, vtkSphereSource } = vtk.Filters.Sources;
const vtkMatrixBuilder = vtk.Common.Core.vtkMatrixBuilder;

const ARROW_COLOR = [0.12, 0.56, 1.0]; // dodgerblue, matching the trame viewer

function actorFor(source) {
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(source.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(...ARROW_COLOR);
  return actor;
}

export function buildLoadActors(loads, shape) {
  const scale = Math.max(...shape);
  const length = 0.25 * scale;
  const radius = 0.04 * scale;
  const actors = [];

  for (const load of loads) {
    const mag = Math.hypot(...load.force);
    if (mag < 1e-12) continue;
    const dir = load.force.map((c) => c / mag);
    const tail = load.position.map((p, i) => p - length * dir[i]);

    // vtkArrowSource is a unit arrow from (0,0,0) to (1,0,0).
    const arrow = vtkArrowSource.newInstance({
      tipResolution: 16,
      shaftResolution: 16,
      tipLength: 0.3,
      tipRadius: 0.12,
      shaftRadius: 0.04,
    });
    const arrowActor = actorFor(arrow);
    const matrix = vtkMatrixBuilder
      .buildFromRadian()
      .translate(...tail)
      .rotateFromDirections([1, 0, 0], dir)
      .scale(length, length, length)
      .getMatrix();
    arrowActor.setUserMatrix(matrix);
    actors.push(arrowActor);

    const sphere = vtkSphereSource.newInstance({
      center: load.position,
      radius,
      thetaResolution: 16,
      phiResolution: 16,
    });
    actors.push(actorFor(sphere));
  }
  return actors;
}
