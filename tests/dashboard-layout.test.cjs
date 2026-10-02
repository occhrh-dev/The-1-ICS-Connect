const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script3.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dashboard-layout.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  new vm.Script(match[1]);
}
assert.match(html, /class="dash-header-actions"/);
assert.match(html, /class="dash-header-context"/);
assert.match(html, /class="dash-status-strip"/);
assert.match(css, /grid-template-rows: minmax\(0, 1fr\) !important/);
assert.match(css, /#scene_Dashboard\.dashboard-join-mobile \.dash-map-wrap/);
assert.match(sw, /dashboard-layout\.css\?v=20261002_layers1/);
assert.match(html, /navigationControl:\s*false/);
assert.match(script, /navigationControl:\s*false/);

// Sizing changes must only resize the canvas, never refit/recenter the map.
const observerSource = script.slice(script.indexOf('function watchDashboardMapSize()'), script.indexOf('function buildDashboardPointMarkerHtml('));
let callback, observed, resizeCount = 0, observerCount = 0, nextFrame = 0;
const frames = new Map();
const container = {};
const context = {
  window: {},
  document: { querySelector: () => container },
  ResizeObserver: class {
    constructor(fn) { callback = fn; observerCount++; }
    observe(target) { observed = target; }
  },
  requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
  cancelAnimationFrame(id) { frames.delete(id); },
  dashMap: {
    resize() { resizeCount++; },
    fitBounds() { throw new Error('Resize must not change camera'); },
    location() { throw new Error('Resize must not change camera'); }
  }
};
vm.createContext(context);
vm.runInContext(observerSource, context);
context.watchDashboardMapSize();
context.watchDashboardMapSize();
assert.equal(observerCount, 1);
assert.equal(observed, container);
callback();
callback();
assert.equal(frames.size, 1);
for (const fn of frames.values()) fn();
assert.equal(resizeCount, 1);
assert.equal(context.window._dashboardMapResizeFrame, 0);

// Old browsers without ResizeObserver continue to use the SDK's normal resize.
context.window = {};
context.ResizeObserver = undefined;
assert.doesNotThrow(() => context.watchDashboardMapSize());
console.log('PASS: inline syntax, layout hooks, viewer map height, cache, one navigation control and camera-safe resize');
