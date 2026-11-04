// THE SONG: a small orchestral waltz rendered from score.js into out/music.wav.
//   node song.js   (STEMS=1 also writes out/stem-*.wav, LUFS=-14 masters to a loudness)
const path = require('path');
const { SR, Bus, reverb, pingpong } = require('./engine/audio/dsp');
const I = require('./engine/audio/instruments');
const MIX = require('./engine/audio/mix');
const sc = require('./score');
const { T, BEAT, DURATION, m, ev, clock } = sc;

const N = Math.ceil(DURATION * SR);
const bus = () => new Bus(N);
const piano = bus(), harp = bus(), str = bus(), lead = bus(), low = bus(), perc = bus(), bells = bus(), wind = bus();
const verb = bus(), dly = bus();

const inSky = (t) => t >= ev.sky && t < ev.dusk;

// ---------- harp: rolling waltz arpeggios (bars 0-15), silent in the breath ----------
for (const c of sc.chords) {
  if (c.bar >= 16) continue;
  const tones = [...c.notes, c.notes[0] + 12, c.notes[1] + 12];
  for (let b = 0; b < (c.t1 - c.t0) / BEAT - 1e-6; b++) {
    for (let e = 0; e < 2; e++) {
      const t = c.t0 + b * BEAT + e * BEAT / 2;
      if (t >= ev.breath && t < ev.dusk) continue;
      const n = tones[(b * 2 + e + c.bar) % tones.length];
      const g = (b === 0 && e === 0 ? 0.22 : 0.14) * (inSky(t) ? 0.8 : 1);
      const x = I.guitar(n + 12, 1.4, { bright: 0.42, sustain: 0.9985, seed: Math.round(t * 50) });
      harp.addMono(x, t, g, (e ? 0.35 : -0.35));
      verb.addMono(x, t, g * 0.5);
    }
  }
}

// ---------- low strings: waltz bass on beat 1 (bars 4-15), pizz on 2 and 3 ----------
clock.eachStep(4, 16, 3, (t, b, s) => {
  if (t >= ev.breath && t < ev.dusk) return;
  const c = sc.chordAt(t); if (!c) return;
  if (s === 0) { const x = I.strings(c.bass + 12, BEAT * 2.6, { attack: 0.05, release: 0.4, bright: 0.6, seed: b }); low.addStereo(x.L, x.R, t, 0.32); }
  else if (b < 8 || b >= 12) { const p = I.pizz(c.notes[s % c.notes.length], { seed: b * 3 + s }); low.addMono(p, t, 0.18, s === 1 ? -0.2 : 0.2); verb.addMono(p, t, 0.08); }
});
// in the sky, the whole string section holds the chords
for (const c of sc.chords) {
  const t1 = c.t1 > ev.breath && c.t0 < ev.breath ? ev.breath : c.t1;
  if (c.t0 >= ev.dusk && c.bar < 15) continue;
  const big = inSky(c.t0);
  const soft = c.t0 < ev.gust;
  for (const n of c.notes) {
    const x = I.strings(n, t1 - c.t0 + (c.bar >= 15 ? 1.5 : 0.1), { attack: soft ? 0.6 : 0.25, release: c.bar >= 15 ? 1.8 : 0.5, bright: big ? 1 : 0.55, seed: c.bar * 7 + n });
    str.addStereo(x.L, x.R, c.t0, big ? 0.12 : soft ? 0.05 : 0.08);
  }
}

// ---------- the melody: piano (hill), strings (gust + sky, doubled), piano again (dusk) ----------
for (const n of sc.melody) {
  if (n.t < ev.gust || n.t >= ev.dusk) {
    const x = I.epiano(n.midi, n.dur * 1.6, { index: 0.7, decay: 1.6 });
    piano.addMono(x, n.t, 0.42, 0.05); verb.addMono(x, n.t, 0.22); dly.addMono(x, n.t, 0.05);
  } else {
    const big = inSky(n.t);
    const a = I.strings(n.midi, n.dur * 0.98, { attack: 0.08, release: 0.45, bright: big ? 1.2 : 0.9, seed: 40 + n.midi });
    lead.addStereo(a.L, a.R, n.t, big ? 0.34 : 0.3); verb.addStereo(a.L, a.R, n.t, 0.1);
    if (big) {
      const o = I.strings(n.midi - 12, n.dur * 0.98, { attack: 0.1, release: 0.45, bright: 0.8, seed: 90 + n.midi });
      lead.addStereo(o.L, o.R, n.t, 0.2);
      const h = I.brassNote(n.midi - 12, n.dur * 0.9, { bright: 0.35, seed: 5 }); // soft horns underneath
      lead.addStereo(h.L, h.R, n.t, 0.07);
    }
  }
}

// ---------- the hits, each one an event in the score ----------
// gust: a plucked chord + a wood tick as the hat pops off
const gustChord = ['F3', 'C4', 'A4', 'E5'];
gustChord.forEach((n, i) => { const x = I.guitar(m(n) + 12, 1.8, { bright: 0.7, sustain: 0.9985, seed: 300 + i }); harp.addMono(x, ev.gust, 0.32, -0.4 + i * 0.25); verb.addMono(x, ev.gust, 0.2); });
perc.addMono(I.pop(1.3), ev.gust, 0.35, 0.3);
// stand: a little pizz hop
perc.addMono(I.woodTick(1.2), ev.stand, 0.25, 0);
// sky: timpani + crash, the swell
perc.addMono(I.timpani(m('D2'), { decay: 1.6 }), ev.sky, 0.9);
perc.addMono(I.crash(31), ev.sky, 0.35);
verb.addMono(I.crash(31), ev.sky, 0.2);
for (let b = 9; b <= 11; b++) perc.addMono(I.timpani(sc.chordAt(T(b)).bass + 12, { decay: 0.9 }), T(b), 0.45);
// dusk: a high harp chord after the breath
['F4', 'A4', 'C5', 'F5'].forEach((n, i) => { const x = I.guitar(m(n) + 12, 2.2, { bright: 0.65, sustain: 0.999, seed: 400 + i }); harp.addMono(x, ev.dusk, 0.3, -0.3 + i * 0.2); verb.addMono(x, ev.dusk, 0.3); });
perc.addMono(I.pop(1.6), ev.dusk, 0.18);
// catch: a bell
const catchBell = I.bell(1046.5, 1.2, 1.6, 2.0);
bells.addMono(catchBell, ev.catch, 0.3, 0.1); verb.addMono(catchBell, ev.catch, 0.25);
// lanterns and stars: one music-box note each
for (const n of [...sc.lanternNotes, ...sc.starNotes]) {
  const x = I.musicBox(n.midi);
  bells.addMono(x, n.t, 0.2, (n.x / sc.W - 0.5) * 1.2); verb.addMono(x, n.t, 0.2); dly.addMono(x, n.t, 0.06);
}

// ---------- the wind: a bed that breathes, and the big gust ----------
wind.addMono(I.noiseSweep(DURATION - 1, 300, 900, { q: 0.6, pink: true, shape: (x) => 0.35 + 0.25 * Math.sin(x * 37) * Math.sin(x * 11) }), 0.4, 0.18);
wind.addMono(I.noiseSweep(1.4, 400, 2600, { q: 0.8, pink: true, shape: (x) => x * x }), ev.gust - 1.4, 0.4); // rises into the gust
wind.addMono(I.noiseSweep(2.6, 2600, 500, { q: 0.8, pink: true, shape: (x) => Math.pow(1 - x, 2) }), ev.gust, 0.35);
wind.addMono(I.noiseSweep(2.0, 300, 3000, { q: 0.7, pink: true, shape: (x) => x * x * x }), ev.sky - 2.0, 0.35); // swell into the sky

// ---------- mix ----------
const stems = {
  piano, harp, str, lead, low, perc, bells, wind,
  verb: reverb(verb, { room: 0.9, damp: 0.35 }),
  dly: pingpong(dly, BEAT * 0.75, 0.35, 3200),
};
const GAIN = { piano: 0.6, harp: 1.7, str: 2.0, lead: 2.6, low: 1.5, perc: 0.45, bells: 0.8, wind: 0.6, verb: 0.9, dly: 0.8 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 28);
MIX.gate(mix, ev.breath, ev.dusk); // the held breath before dusk
MIX.fadeOut(mix, DURATION - 2.0, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.7'), undefined, { lufs: process.env.LUFS ? parseFloat(process.env.LUFS) : -16 });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS at drive ${M.drive.toFixed(2)}` : ''})`);
