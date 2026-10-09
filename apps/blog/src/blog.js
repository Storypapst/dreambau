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
      title.style.minHeight = `${title.offsetHeight}px`;
    }
    const progress = (now - began) / duration;
    if (progress >= 1) return finish();
    node.data = letters.map((letter, index) => (letter === ' ' || progress > (index / letters.length) * 0.55 + 0.45 ? letter : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
