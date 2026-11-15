/*
 * sounds.js — короткие приятные звуки без файлов (синтезируются браузером).
 * Sounds.play('income' | 'expense' | 'delete' | 'save'); выключаются в разделе «Ещё».
 */
(function () {
  'use strict';
  const KEY = 'finplaner-sound';
  let ctx = null;

  function enabled() {
    try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* не важно */ }
  }

  // Одна нота: частота, начало, длительность, громкость, тембр.
  function note(freq, start, dur, vol, type) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    // «звон монетки»: две яркие ноты вверх
    income() { note(988, 0, 0.12, 0.18, 'triangle'); note(1319, 0.08, 0.28, 0.16, 'triangle'); note(2637, 0.08, 0.18, 0.04); },
    // мягкий «щелчок кошелька»
    expense() { note(660, 0, 0.09, 0.14, 'triangle'); note(523, 0.06, 0.16, 0.10, 'sine'); },
    // короткий «вжух» вниз
    delete() { note(440, 0, 0.1, 0.10, 'sine'); note(294, 0.07, 0.18, 0.08, 'sine'); },
    // тихое подтверждение
    save() { note(784, 0, 0.12, 0.10, 'sine'); },
  };

  function play(name) {
    if (!enabled() || !SOUNDS[name]) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      SOUNDS[name]();
      if (navigator.vibrate) navigator.vibrate(name === 'delete' ? [20, 40, 20] : 15);
    } catch (e) { /* звук не обязателен */ }
  }

  window.Sounds = { play, enabled, setEnabled };
})();
