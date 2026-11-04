// THE SCORE: "Wind Over the Hill". The single source of truth for music AND picture.
// A girl and her cat on a hill above the sea. A gust steals her straw hat, it sails through
// the summer clouds, and comes home to her hands at dusk while the village lights up, one lantern per note.
// 3/4 waltz, 90 BPM: 1 beat = 0.667s, 1 bar = 2s.
(function () {
  const node = typeof require !== 'undefined';
  const U = node ? require('./engine/util') : globalThis.U;
  const MU = node ? require('./engine/music') : globalThis.MUSIC;
  const { m, makeClock, placeBar, makeChords } = MU;

  const FPS = 30;
  const FORMAT = U.pickFormat('16:9');
  const STYLE = 'watercolor';
  const [W, H] = U.formatSize(FORMAT);
  const SAFE = U.safeArea(W, H);
  const WIDE = W / H > 1.2;
  const clock = makeClock({ bpm: 90, offset: 0.5, beatsPerBar: 3 });
  const { T, BEAT } = clock;
  const DURATION = T(16) + 2.5; // ~35s

  const S = {
    hill: [0, T(4)], // wide, midday: she sits with the cat, the wind plays in the grass
    gust: [T(4), T(8)], // closer: the hat flies, she chases it with her eyes
    sky: [T(8), T(12)], // the hat sails through the clouds with the swallows (the swell)
    dusk: [T(12), DURATION], // wide, sunset: the hat comes home, lanterns, first stars
  };

  // ---------- harmony (F major, a gentle waltz) ----------
  const { chords, chordAt } = makeChords(clock, {
    F: { notes: ['A3', 'C4', 'F4'], bass: 'F2' },
    Fmaj7: { notes: ['A3', 'C4', 'E4'], bass: 'F2' },
    Dm7: { notes: ['A3', 'C4', 'F4'], bass: 'D2' },
    Dm: { notes: ['A3', 'D4', 'F4'], bass: 'D2' },
    Bbmaj7: { notes: ['A3', 'D4', 'F4'], bass: 'Bb1' },
    Bb: { notes: ['Bb3', 'D4', 'F4'], bass: 'Bb1' },
    C: { notes: ['G3', 'C4', 'E4'], bass: 'C2' },
    Csus: { notes: ['G3', 'C4', 'F4'], bass: 'C2' },
    Am7: { notes: ['G3', 'C4', 'E4'], bass: 'A1' },
    Fmaj9: { notes: ['A3', 'C4', 'E4', 'G4'], bass: 'F1' },
  }, [
    [0, 0, 3, 'Fmaj7'], [1, 0, 3, 'Dm7'], [2, 0, 3, 'Bbmaj7'], [3, 0, 3, 'C'],
    [4, 0, 3, 'Fmaj7'], [5, 0, 3, 'Am7'], [6, 0, 3, 'Bbmaj7'], [7, 0, 2, 'Csus'], [7, 2, 1, 'C'],
    [8, 0, 3, 'Dm'], [9, 0, 3, 'Bb'], [10, 0, 3, 'F'], [11, 0, 3, 'C'],
    [12, 0, 3, 'Bb'], [13, 0, 3, 'C'], [14, 0, 3, 'Fmaj7'], [15, 0, 3, 'Fmaj9'], [16, 0, 3, 'Fmaj9'],
  ]);

  // ---------- the melody (8th grid in 3/4: 6 eighths per bar) ----------
  const MEL = [
    [['A4', 0, 2], ['C5', 2, 2], ['F5', 4, 2]],
    [['E5', 0, 3], ['D5', 3, 1], ['C5', 4, 2]],
    [['D5', 0, 2], ['F5', 2, 2], ['A5', 4, 2]],
    [['G5', 0, 4], ['E5', 4, 2]],
    [['A4', 0, 2], ['C5', 2, 2], ['F5', 4, 2]],
    [['E5', 0, 2], ['C5', 2, 2], ['A4', 4, 2]],
    [['D5', 0, 3], ['C5', 3, 1], ['Bb4', 4, 1], ['A4', 5, 1]],
    [['G4', 0, 6]],
    [['F5', 0, 3], ['E5', 3, 1], ['D5', 4, 2]],
    [['D5', 0, 2], ['F5', 2, 2], ['Bb5', 4, 2]],
    [['A5', 0, 4], ['G5', 4, 1], ['F5', 5, 1]],
    [['G5', 0, 5]], // ends an 8th early: a held breath before the dusk cut
    [['F5', 0, 3], ['D5', 3, 3]],
    [['E5', 0, 3], ['G5', 3, 3]],
    [['F5', 0, 6]],
  ];
  const melody = MEL.flatMap((bar, b) => placeBar(clock, bar, b));

  const ev = {
    gust: T(4), // the hat leaves her head (cut in closer + pluck chord)
    stand: T(6), // she jumps up to chase it
    sky: T(8), // cut to the sky: timpani + cymbal, the swell
    breath: T(11, 2.5), // an 8th of silence
    dusk: T(12), // cut to sunset: a harp chord
    catch: T(13), // the hat lands in her hands (bell)
    end: T(16),
  };

  // the hat's flight in the sky shot: a loop-the-loop with the swallows
  const hatSky = (t) => {
    const u = U.clamp((t - ev.sky) / (ev.dusk - ev.sky));
    const x = U.lerp(-0.12, 1.12, u) * W;
    const k = U.clamp((u - 0.4) / 0.25); // the loop-the-loop
    const a = U.ease.inOutQuad(k) * Math.PI * 2;
    const R = 170;
    return {
      x: x + Math.sin(a) * R * 1.4,
      y: H * 0.66 - u * H * 0.3 + Math.sin(u * 9) * 30 - (1 - Math.cos(a)) * R,
      rot: Math.sin(u * 7) * 0.35 - a,
    };
  };

  // the village lanterns light one per note (bars 13-14), the stars one per music-box note (bars 14-16)
  const rng = U.mulberry32(77);
  const lanternNotes = [
    ...placeBar(clock, [['C5', 0, 1], ['E5', 1, 1], ['G5', 2, 1], ['C6', 3, 1], ['G5', 4, 1], ['E5', 5, 1]], 13, 12),
    ...placeBar(clock, [['A4', 0, 1], ['C5', 1, 1], ['F5', 2, 1], ['A5', 3, 1], ['C6', 4, 1], ['E6', 5, 1]], 14, 12),
  ].map((n, i) => ({ ...n, i, x: 140 + rng() * 520, y: 560 + rng() * 60 }));
  const starNotes = [
    ...placeBar(clock, [['F5', 0, 2], ['A5', 2, 2], ['C6', 4, 2]], 15, 12),
    ...placeBar(clock, [['E6', 0, 2], ['G5', 2, 2], ['A5', 4, 2]], 16, 12),
  ].map((n, i) => ({ ...n, i, x: 120 + rng() * 1680, y: 30 + rng() * 110 }));

  const markers = {
    gust: { t: ev.gust, sync: 'av' },
    stand: ev.stand,
    sky: { t: ev.sky, sync: 'av' },
    dusk: { t: ev.dusk, sync: 'av' },
    catch: { t: ev.catch, sync: 'a' },
    stars: T(15),
    end: ev.end,
  };

  const titleCard = { t: T(14, 1), text: 'wind over the hill' };

  const SCORE = { FPS, FORMAT, STYLE, W, H, SAFE, WIDE, DURATION, clock, T, BEAT, S, m, chords, chordAt, MEL, melody, ev, hatSky, lanternNotes, starNotes, markers, titleCard };
  if (node) module.exports = SCORE; else globalThis.SCORE = SCORE;
})();
