# tosa-viewer

Static [vtk.js](https://kitware.github.io/vtk-js/) viewer for
[TOSA](https://github.com/arnold-pdev/TOSA) shape sensitivities, served on
GitHub Pages: **https://arnold-pdev.github.io/tosa-viewer/**

Shows shape-derivative densities (compliance V_C for now) on NITO-3D design
surfaces with NITO load anchors drawn as force-direction arrows. Blue regions
pull the boundary inward, red push outward (diverging colormap, symmetric
about 0 — same convention as TOSA's local trame viewer).

## Layout

- `site/` — the published site (no build step; plain ES modules + a vendored,
  pinned `vtk.js` UMD bundle in `site/vendor/`).
- `site/data/` — exporter-generated: `manifest.json` + lean per-index
  `vtp/<index>.vtp` (geometry + shape-sensitivity point scalars only).
- `tosa/` — shallow submodule pinning the TOSA commit that produced the data
  (provenance only; CI never fetches it). The manifest also records
  `tosa_commit`.
- `.github/workflows/pages.yml` — uploads `site/` verbatim to GitHub Pages on
  every push to `main`.

## Regenerating data

Data is baked by TOSA's exporter (needs the `tosa` conda env and TOSA outputs
under `output/hex_sensitivity/`):

```bash
cd ../TOSA
python scripts/viewer/export_static.py \
    --viewer-repo ../tosa-viewer --data-dir nito/Data/3D
```

The exporter upserts `site/data/manifest.json` by index, so batch additions are
idempotent re-runs. Commit and push the result; Pages redeploys automatically.

## Local preview

```bash
cd site && python3 -m http.server 8000
# http://localhost:8000
```
