// Each tile keeps its own identity so repeated letters can be placed independently.
export function makeReview(root, { speak, answer, finish }) {
  const find = id => root.querySelector('#' + id);
  const slots = find('review-slots');
  const bank = find('review-bank');
  const board = find('review-board');
  const check = find('review-check');
  const next = find('review-next');
  let words = [], index = 0, clean = 0, attempts = 0;
  let tiles = [], placed = [], solved = false, revealed = false, gesture, blockClick = false;
  const task = () => words[index];

  function place(tile, destination) {
    if (solved || !Number.isInteger(tile) || tile < 0 || tile >= tiles.length) return;
    const from = placed.indexOf(tile);
    if (from === destination) return;
    if (from >= 0) placed[from] = destination >= 0 ? placed[destination] : null;
    if (destination >= 0) placed[destination] = tile;
    find('review-feedback').textContent = '';
    render();
  }

  function tileButton(tile, inSlot) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-tile';
    button.dataset.tile = String(tile);
    button.textContent = tiles[tile];
    button.disabled = solved || (!inSlot && placed.includes(tile));
    button.setAttribute('aria-label', tiles[tile] + (inSlot ? ' zurücklegen' : ' einsetzen'));
    return button;
  }

  function render() {
    slots.replaceChildren(...placed.map((tile, position) => {
      const slot = document.createElement('div');
      slot.className = 'review-slot';
      slot.dataset.drop = position;
      slot.setAttribute('aria-label', 'Platz ' + (position + 1));
      if (tile !== null) slot.append(tileButton(tile, true));
      else { const number = document.createElement('span'); number.textContent = position + 1; slot.append(number); }
      return slot;
    }));
    bank.replaceChildren(...tiles.map((_, tile) => tileButton(tile, false)));
    check.disabled = solved || placed.includes(null);
    check.hidden = solved;
    next.hidden = !solved;
    next.textContent = index + 1 === words.length ? 'Zum Ergebnis' : 'Nächstes Wort';
  }

  function openWord() {
    const word = task();
    tiles = [...word.text];
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    if (tiles.join('') === word.text) {
      const j = tiles.findIndex(letter => letter !== tiles[0]);
      if (j > 0) [tiles[0], tiles[j]] = [tiles[j], tiles[0]];
    }
    placed = tiles.map(() => null);
    solved = false;
    revealed = false;
    attempts = 0;
    find('review-progress').textContent = 'Fehlerwort ' + (index + 1) + ' von ' + words.length;
    find('review-feedback').textContent = '';
    render();
    speak(word, true);
    find('review-listen').focus({ preventScroll: true });
  }

  function clearGesture() {
    gesture?.ghost?.remove();
    gesture = undefined;
  }

  board.addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-tile]');
    if (!button || button.disabled || gesture || event.button !== 0) return;
    blockClick = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, tile: Number(button.dataset.tile), button };
    try { button.setPointerCapture(event.pointerId); } catch {}
  });
  board.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.ghost && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) {
      gesture.ghost = document.createElement('div');
      gesture.ghost.className = 'review-ghost';
      gesture.ghost.setAttribute('aria-hidden', 'true');
      gesture.ghost.textContent = tiles[gesture.tile];
      document.body.append(gesture.ghost);
    }
    if (gesture.ghost) {
      gesture.ghost.style.left = event.clientX + 'px';
      gesture.ghost.style.top = event.clientY + 'px';
    }
  });
  board.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (gesture.ghost) {
      blockClick = true;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const slot = target?.closest('[data-drop]');
      if (slot && slots.contains(slot)) place(gesture.tile, Number(slot.dataset.drop));
      else if (bank.contains(target)) place(gesture.tile, -1);
      setTimeout(() => { blockClick = false; }, 0);
    }
    clearGesture();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) board.addEventListener(type, clearGesture);
  window.addEventListener('blur', clearGesture);

  board.addEventListener('click', event => {
    const button = event.target.closest('[data-tile]');
    if (!button || button.disabled || blockClick) return;
    const tile = Number(button.dataset.tile);
    const fromSlot = slots.contains(button);
    const destination = fromSlot ? -1 : placed.indexOf(null);
    if (destination < 0 && !fromSlot) return;
    place(tile, destination);
    const focus = fromSlot ? bank.querySelector('[data-tile="' + tile + '"]') : bank.querySelector('button:not(:disabled)') ?? check;
    focus?.focus({ preventScroll: true });
  });
  find('review-listen').addEventListener('click', () => speak(task(), true));
  check.addEventListener('click', () => {
    if (solved || placed.includes(null)) return;
    attempts++;
    const given = placed.map(tile => tiles[tile]);
    const target = [...task().text];
    const difference = given.findIndex((letter, i) => letter !== target[i]);
    solved = difference === -1;
    answer(task(), solved ? { correct: true, review: true, assisted: revealed || attempts > 1 }
      : { correct: false, review: true, given: given[difference], expected: target[difference], index: difference });
    if (solved && attempts === 1 && !revealed) clean++;
    find('review-feedback').textContent = solved
      ? (attempts === 1 && !revealed ? 'Richtig beim ersten Versuch! ' : 'Richtig! ') + task().hint
      : 'Prüfe Platz ' + (difference + 1) + '. Verschiebe die Buchstaben und versuche es noch einmal.';
    if (!solved) speak(task(), true);
    render();
    if (solved) next.focus({ preventScroll: true });
  });
  next.addEventListener('click', () => {
    if (!solved) return;
    if (++index < words.length) { openWord(); return; }
    const multiplier = clean >= 5 ? 3 : clean === 4 ? 2 : 1;
    finish({ clean, multiplier, seconds: clean * 5 * multiplier });
  });

  return {
    start(tasks) {
      clearGesture();
      words = tasks;
      index = 0;
      clean = 0;
      openWord();
    },
    markRevealed(word) {
      if (!solved && task() === word) revealed = true;
    },
  };
}
