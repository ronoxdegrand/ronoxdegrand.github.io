# ronoxdegrand.github.io
Barebones webpage to what I do, just straight up raw CSS.

## Visual effects

Add `bubble-link` to a link for the header-style pill and pointer halftone. Its resting, active, and dot colors come from the CSS variables in `:root`. Links in `main` keep using one shared floating halftone canvas.

For a different component, create a canvas with `createHalftoneCanvas` and connect it with `bindPointerHalftone` in `script.js`; supply the component's drawing region and any visibility rules. The sticky header uses the same canvas setup but samples the page beneath it to set dot sizes.
