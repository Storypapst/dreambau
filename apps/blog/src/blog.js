/* The one effect of the Blog (spec 5.6 PO-8): the title of a post decodes once, in about half a second, and stops.
   The real title is in the HTML and stays readable without this file. Nothing is requested, nothing is stored. */
(() => {
  const title = document.querySelector('h1');
  const node = title && title.firstChild;
  if (!node || node.nodeType !== 3 || title.childNodes.length !== 1) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const text = node.data;
  const letters = Array.from(text);
  const glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+<>=';
  const duration = 520;
  let began = null;
  let locked = 0;   // the height of the title before the effect; no frame is taller or shorter
  let shown = text; // the last text that fit into that height
  const finish = () => {
    node.data = text;
    title.removeAttribute('aria-label');
    title.style.removeProperty('min-height');
    if (!title.getAttribute('style')) title.removeAttribute('style');
  };
  const frame = (now) => {
    if (began === null) {
      began = now;
      title.setAttribute('aria-label', text);
      locked = title.offsetHeight;
      title.style.minHeight = `${locked}px`;
    }
    const progress = (now - began) / duration;
    if (progress >= 1) return finish();
    node.data = letters.map((letter, index) => (letter === ' ' || progress > (index / letters.length) * 0.55 + 0.45 ? letter : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
    // The signs are wider than the letters they stand for. A mix that would need one more line is not shown: this frame
    // keeps the last text that fit, so the title never grows (min-height keeps it from shrinking).
    if (title.offsetHeight > locked) node.data = shown; else shown = node.data;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
