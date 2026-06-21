// Music made of motion. Every body holds a tone; swings sound notes; a clean
// release voices a chord. As you fall the root sinks (setDepth), the Pale's
// cold breeds a dissonant drone (setPale), and thrust adds a low rumble. All of
// it is hand-built from oscillators, gains, filters, and a noise buffer — no
// samples, no libraries. Methods are null-safe before resume() opens a context.

const SCALE = [0, 2, 3, 5, 7, 8, 10, 12]; // minor-ish, cosmic & tense (used by SFX)

// ── Music track data ────────────────────────────────────────────────
// The background music is data-driven: a bank of TRACKS, each a small config
// (tempo, scale/mode, swing, which layers are live) plus four parallel pattern
// grids — BASS, LEAD, ARP, and a drum groove (KICK/SNARE/HAT). setTrack() picks
// one; the scheduler reads only from the active track. Patterns are written as
// scale-degree indices (0 = root of the track's scale, 7 = octave, negatives go
// below) and resolved to semitones through the track's MODE at play time, so the
// same pattern in a different mode sounds different. null = rest.
//
// MODES are semitone offsets for one octave (degree → semitone). degreeToSemi()
// wraps degrees beyond an octave by adding 12 per wrap, so a single array covers
// the whole range. Each mode is seven notes; index 7 lands on the octave.

type Mode = number[];

const MODES: Record<string, Mode> = {
  major:      [0, 2, 4, 5, 7, 9, 11],   // bright, heroic
  minor:      [0, 2, 3, 5, 7, 8, 10],   // dark, classic Genesis
  dorian:     [0, 2, 3, 5, 7, 9, 10],   // minor with a hopeful 6th
  phrygian:   [0, 1, 3, 5, 7, 8, 10],   // exotic, menacing flat-2
  lydian:     [0, 2, 4, 6, 7, 9, 11],   // dreamy, floating sharp-4
  mixolydian: [0, 2, 4, 5, 7, 9, 10],   // rocking, bluesy flat-7
  pentaMinor: [0, 3, 5, 7, 10, 12, 15], // minor pentatonic (5 + octave repeats)
  pentaMajor: [0, 2, 4, 7, 9, 12, 14],  // major pentatonic, bouncy
};

// A music track: timing + mode + which layers play + the four pattern grids.
// BASS/ARP/KICK/SNARE/HAT are one bar (16 steps), reused each bar; LEAD spans
// the full four-bar loop (64 steps) so the hook is a real phrase. Degrees, not
// semitones — resolved through `mode`.
interface Track {
  name: string;        // human label for the integrator
  bpm: number;         // tempo
  mode: Mode;          // scale used to resolve degrees
  swing: number;       // 0..0.5 — delays every other 16th for groove
  bassRatio: number;   // FM modulator:carrier ratio for the bass voice
  bassIndex: number;   // FM index (brightness) for the bass voice
  leadRatio: number;   // FM ratio for the lead voice
  leadIndex: number;   // FM index for the lead voice
  leadType: OscillatorType; // carrier waveform for the FM lead (timbre flavour)
  arpOn: boolean;      // whether the PSG arp layer plays
  bass: (number | null)[];  // 16 steps, degrees
  lead: (number | null)[];  // 64 steps, degrees
  arp: number[];            // 16 steps, degrees (cycled for shimmer)
  kick: boolean[];          // 16 steps
  snare: boolean[];         // 16 steps
  hat: boolean[];           // 16 steps
}

// Drum-groove shorthand: "x" = hit, "." = rest. Keeps the grids readable.
function drum(s: string): boolean[] {
  return s.replace(/\s+/g, '').split('').map((c) => c === 'x');
}

// ── The track bank ───────────────────────────────────────────────────
// 14 distinct chiptune tracks. Each varies tempo, mode, bassline, hook, arp and
// drum groove so every sector sounds different. All in the Mega Drive idiom:
// FM bass + FM lead + PSG square arp + noise drums. setTrack(i) selects one by
// `i % TRACKS.length`. main.ts assigns sectors to indices.
const TRACKS: Track[] = [
  // 0 — "Ignition": the original frantic 158bpm minor driver (the legacy track).
  {
    name: 'Ignition', bpm: 158, mode: MODES.minor, swing: 0,
    bassRatio: 1, bassIndex: 2.4, leadRatio: 2, leadIndex: 3.0, leadType: 'square', arpOn: true,
    bass: [-7, -7, null, -7, -3, null, -7, null, -7, -7, null, -6, -5, null, -5, -6],
    lead: [
      7, null, 7, 6, null, 4, null, 7,   null, 8, null, 7, 7, null, 6, null,
      4, null, 6, null, 7, null, 8, 7,   null, 7, null, 6, 4, null, 3, null,
      8, null, 8, 7, null, 7, null, 9,   null, 10, null, 9, 8, null, 7, null,
      7, null, 7, null, 6, 4, null, 6,   7, null, 6, 4, 3, null, 4, 6,
    ],
    arp: [0, 4, 7, 9, 4, 7, 11, 7, 0, 5, 7, 9, 5, 9, 11, 9],
    kick:  drum('x..x..x. x....x..'),
    snare: drum('....x... ....x..x'),
    hat:   drum('x.xx x.xx x.xx xxxx'),
  },
  // 1 — "Tidal Drift": slow, spacey dorian; sparse bass, floaty lead, no arp.
  {
    name: 'Tidal Drift', bpm: 120, mode: MODES.dorian, swing: 0.12,
    bassRatio: 1, bassIndex: 1.4, leadRatio: 1, leadIndex: 2.0, leadType: 'triangle', arpOn: false,
    bass: [-7, null, null, null, -3, null, null, null, -5, null, null, null, -7, null, -3, null],
    lead: [
      7, null, null, 9, null, null, 11, null,  9, null, 7, null, null, null, null, null,
      4, null, null, 7, null, 9, null, null,   7, null, null, null, null, null, null, null,
      11, null, null, 9, null, 11, null, 14,   13, null, 11, null, 9, null, 7, null,
      9, null, 7, null, 4, null, null, null,   7, null, null, null, null, null, null, null,
    ],
    arp: [0, 4, 7, 11, 7, 4, 9, 4, 0, 4, 7, 11, 7, 4, 9, 4],
    kick:  drum('x....... x....x..'),
    snare: drum('....x... ....x...'),
    hat:   drum('x...x... x...x...'),
  },
  // 2 — "Solar Flare": bright, fast major anthem; punchy bass, soaring hook.
  {
    name: 'Solar Flare', bpm: 150, mode: MODES.major, swing: 0,
    bassRatio: 1, bassIndex: 2.8, leadRatio: 3, leadIndex: 2.5, leadType: 'square', arpOn: true,
    bass: [-7, null, -7, -7, null, -3, null, -7, 0, null, 0, -3, null, -5, null, -3],
    lead: [
      7, null, 9, 11, null, 12, null, 11,  9, null, 7, null, 9, null, 11, null,
      12, null, 14, null, 12, 11, null, 9,  7, null, null, 9, 11, null, 12, null,
      14, null, 14, 12, null, 11, null, 14,  16, null, 14, 12, 11, null, 9, null,
      11, null, 9, 7, null, 9, 11, null,  12, 11, 9, 7, null, 9, 7, null,
    ],
    arp: [0, 4, 7, 12, 7, 4, 11, 7, 0, 4, 9, 12, 9, 4, 11, 7],
    kick:  drum('x..x..x. x..x.x..'),
    snare: drum('....x... ....x...'),
    hat:   drum('xxxx xxxx xxxx xxxx'),
  },
  // 3 — "Black Vault": menacing phrygian; heavy low bass, sinister hook, slow.
  {
    name: 'Black Vault', bpm: 128, mode: MODES.phrygian, swing: 0.08,
    bassRatio: 1, bassIndex: 3.4, leadRatio: 2, leadIndex: 4.0, leadType: 'square', arpOn: true,
    bass: [-7, -7, null, null, -6, null, -7, null, -7, null, -7, -6, null, -4, null, -6],
    lead: [
      0, null, 1, null, 0, null, null, null,  3, null, 1, 0, null, null, null, null,
      0, null, null, 1, 3, null, 1, null,  0, null, -2, null, 0, null, null, null,
      7, null, 6, null, 7, null, 8, 7,  null, 6, null, 5, 3, null, 1, null,
      0, null, 1, 3, null, 1, 0, null,  -2, null, 0, null, null, 0, null, null,
    ],
    arp: [0, 3, 7, 8, 3, 7, 11, 7, 0, 1, 7, 8, 1, 7, 10, 7],
    kick:  drum('x...x..x x..x.x..'),
    snare: drum('....x... ....x...'),
    hat:   drum('x.x.x.x. x.x.x.xx'),
  },
  // 4 — "Neon Skies": bouncy major pentatonic; swung, playful, busy arp.
  {
    name: 'Neon Skies', bpm: 140, mode: MODES.pentaMajor, swing: 0.18,
    bassRatio: 1, bassIndex: 2.0, leadRatio: 2, leadIndex: 2.2, leadType: 'square', arpOn: true,
    bass: [-7, null, -7, null, -3, null, -7, null, -5, null, -5, null, -3, null, -3, -7],
    lead: [
      7, null, 9, null, 11, null, 9, 7,  null, 11, null, 9, 7, null, null, null,
      9, null, 11, null, 14, null, 11, 9,  null, 7, null, 9, 11, null, null, null,
      14, null, 11, null, 9, null, 11, 14,  null, 16, null, 14, 11, null, 9, null,
      9, null, 7, null, 9, null, 11, null,  9, 7, null, 9, null, 7, null, null,
    ],
    arp: [0, 4, 7, 11, 14, 11, 7, 4, 0, 4, 9, 11, 14, 11, 9, 4],
    kick:  drum('x..x..x. x..x..x.'),
    snare: drum('....x... ....x...'),
    hat:   drum('x.xx x.xx x.xx x.xx'),
  },
  // 5 — "Iron Tide": mid-tempo mixolydian rocker; gritty bass, bluesy hook.
  {
    name: 'Iron Tide', bpm: 146, mode: MODES.mixolydian, swing: 0.1,
    bassRatio: 2, bassIndex: 3.0, leadRatio: 1, leadIndex: 2.6, leadType: 'square', arpOn: false,
    bass: [-7, -7, -5, null, -7, null, -3, null, -7, -7, null, -5, -3, null, -5, -7],
    lead: [
      7, null, 7, 9, null, 7, null, 4,  7, null, 9, null, 10, null, 9, 7,
      4, null, 7, null, 9, 7, null, 4,  null, 7, null, 4, 0, null, 4, null,
      9, null, 9, 10, null, 9, null, 7,  9, null, 11, null, 9, null, 7, null,
      7, null, 9, 7, null, 4, null, 7,  9, 7, 4, null, 0, null, 4, 7,
    ],
    arp: [0, 4, 7, 10, 7, 4, 9, 4, 0, 4, 7, 10, 7, 4, 9, 4],
    kick:  drum('x..x.x.. x..x.x..'),
    snare: drum('....x... ....x..x'),
    hat:   drum('x.x.x.x. x.x.x.x.'),
  },
  // 6 — "Crystal Halls": dreamy lydian; airy lead, gentle groove, light drums.
  {
    name: 'Crystal Halls', bpm: 132, mode: MODES.lydian, swing: 0.14,
    bassRatio: 1, bassIndex: 1.6, leadRatio: 4, leadIndex: 1.8, leadType: 'triangle', arpOn: true,
    bass: [-7, null, null, -3, null, null, -7, null, -5, null, null, -3, null, null, -3, null],
    lead: [
      7, null, 9, null, 11, null, 13, null,  11, null, 9, null, 7, null, null, null,
      9, null, 11, null, 13, null, 14, null,  13, null, 11, null, 9, null, 7, null,
      14, null, 13, null, 11, null, 13, 14,  null, 16, null, 14, 13, null, 11, null,
      11, null, 9, null, 7, null, 9, null,  11, null, 9, null, 7, null, null, null,
    ],
    arp: [0, 4, 7, 11, 14, 11, 7, 4, 0, 6, 7, 11, 13, 11, 7, 6],
    kick:  drum('x....... x...x...'),
    snare: drum('....x... ....x...'),
    hat:   drum('x.x.x.x. x.x.x.x.'),
  },
  // 7 — "Overdrive": top-speed minor thrash; relentless 16ths, aggressive lead.
  {
    name: 'Overdrive', bpm: 165, mode: MODES.minor, swing: 0,
    bassRatio: 1, bassIndex: 3.2, leadRatio: 2, leadIndex: 3.6, leadType: 'square', arpOn: true,
    bass: [-7, -7, -7, -7, -5, -5, -7, -7, -7, -7, -7, -6, -5, -5, -3, -6],
    lead: [
      7, 8, 7, 6, 7, null, 4, null,  7, 8, 9, 8, 7, null, 6, null,
      4, 6, 7, null, 8, 7, 6, 4,  3, null, 4, 6, 7, null, 8, null,
      9, 10, 9, 8, 9, null, 7, null,  10, 11, 12, 11, 9, null, 8, null,
      7, 6, 4, 6, 7, null, 8, 7,  6, 4, 3, 4, 6, 7, 8, 9,
    ],
    arp: [0, 3, 7, 10, 3, 7, 12, 7, 0, 3, 8, 10, 3, 8, 12, 8],
    kick:  drum('x.x.x.x. x.x.x.x.'),
    snare: drum('....x... ....x...'),
    hat:   drum('xxxxxxxx xxxxxxxx'),
  },
  // 8 — "Deep Current": slow, brooding minor dub; sub bass, very sparse hook.
  {
    name: 'Deep Current', bpm: 124, mode: MODES.minor, swing: 0.16,
    bassRatio: 1, bassIndex: 1.2, leadRatio: 1, leadIndex: 1.6, leadType: 'triangle', arpOn: false,
    bass: [-7, null, null, null, null, null, -5, null, -7, null, null, null, -8, null, null, null],
    lead: [
      null, null, 3, null, null, null, 2, null,  3, null, null, null, null, null, null, null,
      null, null, 7, null, null, null, 5, null,  3, null, 2, null, null, null, null, null,
      null, null, 10, null, null, null, 8, null,  7, null, null, null, 5, null, 3, null,
      null, null, 2, null, null, null, 3, null,  null, null, null, null, null, null, null, null,
    ],
    arp: [0, 3, 7, 10, 7, 3, 8, 3, 0, 3, 7, 10, 7, 3, 8, 3],
    kick:  drum('x....... x.......'),
    snare: drum('....x... ....x...'),
    hat:   drum('....x... ....x..x'),
  },
  // 9 — "Starlight Run": upbeat dorian chase; running bass, catchy bright hook.
  {
    name: 'Starlight Run', bpm: 154, mode: MODES.dorian, swing: 0.06,
    bassRatio: 1, bassIndex: 2.6, leadRatio: 3, leadIndex: 2.8, leadType: 'square', arpOn: true,
    bass: [-7, -5, -7, -3, -7, -5, -7, 0, -7, -5, -7, -6, -5, -3, -5, -7],
    lead: [
      7, null, 9, 11, null, 9, 7, null,  11, null, 9, 7, null, 9, null, null,
      4, null, 7, 9, null, 11, 9, null,  7, null, 9, null, 11, null, 13, null,
      14, null, 13, 11, null, 9, 11, null,  13, null, 11, 9, 7, null, 9, null,
      11, null, 9, 7, null, 9, 11, null,  9, 7, null, 4, 7, null, 9, 11,
    ],
    arp: [0, 3, 7, 9, 12, 9, 7, 3, 0, 5, 7, 9, 12, 9, 7, 5],
    kick:  drum('x..x..x. x..x..x.'),
    snare: drum('....x... ....x...'),
    hat:   drum('x.xxx.xx x.xxx.xx'),
  },
  // 10 — "Ashfall": grim phrygian dirge; pounding bass, sparse menacing hook.
  {
    name: 'Ashfall', bpm: 136, mode: MODES.phrygian, swing: 0,
    bassRatio: 1, bassIndex: 3.8, leadRatio: 1, leadIndex: 4.4, leadType: 'square', arpOn: false,
    bass: [-7, null, -7, null, -7, null, -6, null, -7, null, -7, null, -8, null, -6, null],
    lead: [
      0, null, null, 1, null, 0, null, null,  -2, null, 0, null, null, null, null, null,
      3, null, 1, null, 0, null, 1, null,  3, null, 1, 0, null, null, null, null,
      7, null, 6, null, 5, null, 3, null,  1, null, 0, null, 1, null, 3, null,
      0, null, 1, 3, null, 1, 0, null,  1, null, 0, null, -2, null, 0, null,
    ],
    arp: [0, 1, 3, 7, 8, 7, 3, 1, 0, 1, 5, 7, 8, 7, 5, 1],
    kick:  drum('x...x... x...x..x'),
    snare: drum('....x... ....x...'),
    hat:   drum('x...x.x. x...x.x.'),
  },
  // 11 — "Quartz Bounce": peppy major pentatonic; hopping bass, lots of arp.
  {
    name: 'Quartz Bounce', bpm: 148, mode: MODES.pentaMajor, swing: 0.2,
    bassRatio: 1, bassIndex: 2.2, leadRatio: 2, leadIndex: 2.4, leadType: 'square', arpOn: true,
    bass: [-7, null, -3, null, -7, null, 0, null, -5, null, -1, null, -5, null, -3, null],
    lead: [
      7, null, 7, 9, null, 9, 11, null,  11, 9, null, 7, null, 9, null, null,
      11, null, 11, 14, null, 11, 9, null,  7, null, 9, null, 11, null, 14, null,
      14, null, 16, null, 14, 11, null, 9,  11, null, 14, null, 16, null, 18, null,
      11, null, 9, 7, null, 9, 11, null,  9, 7, null, 4, 7, null, 9, 11,
    ],
    arp: [0, 4, 7, 9, 12, 14, 12, 9, 7, 4, 7, 9, 12, 9, 7, 4],
    kick:  drum('x..x..x. x..x..xx'),
    snare: drum('....x... ....x...'),
    hat:   drum('x.xx x.xx xxxx x.xx'),
  },
  // 12 — "Void Pulse": hypnotic minor pentatonic; throbbing bass, terse hook.
  {
    name: 'Void Pulse', bpm: 138, mode: MODES.pentaMinor, swing: 0,
    bassRatio: 1, bassIndex: 2.4, leadRatio: 4, leadIndex: 2.0, leadType: 'square', arpOn: true,
    bass: [-7, -7, null, -7, null, -7, -7, null, -5, -5, null, -5, null, -5, -3, null],
    lead: [
      7, null, null, 7, null, 10, null, 7,  null, null, 5, null, 7, null, null, null,
      10, null, null, 10, null, 12, null, 10,  null, null, 7, null, 10, null, null, null,
      12, null, 10, null, 7, null, 10, 12,  null, 14, null, 12, 10, null, 7, null,
      7, null, null, 5, null, 7, null, 10,  null, 7, null, 5, null, 3, null, null,
    ],
    arp: [0, 5, 7, 10, 12, 10, 7, 5, 0, 3, 7, 10, 12, 10, 7, 3],
    kick:  drum('x...x.x. x...x.x.'),
    snare: drum('....x... ....x...'),
    hat:   drum('x.x.x.x. x.x.x.x.'),
  },
  // 13 — "Aurora": serene major ballad; gentle bass, lyrical sweeping hook.
  {
    name: 'Aurora', bpm: 126, mode: MODES.major, swing: 0.1,
    bassRatio: 1, bassIndex: 1.8, leadRatio: 2, leadIndex: 2.0, leadType: 'triangle', arpOn: true,
    bass: [-7, null, null, -3, null, null, 0, null, -5, null, null, -1, null, null, -3, null],
    lead: [
      7, null, 9, null, 11, null, 12, null,  11, null, 9, null, 7, null, null, null,
      9, null, 7, null, 9, null, 11, null,  12, null, 14, null, 12, null, 11, null,
      14, null, 12, null, 11, null, 12, 14,  null, 16, null, 14, 12, null, 11, null,
      9, null, 11, null, 12, null, 11, null,  9, null, 7, null, 4, null, null, null,
    ],
    arp: [0, 4, 7, 12, 11, 7, 4, 2, 0, 4, 9, 12, 11, 9, 4, 2],
    kick:  drum('x....... x...x...'),
    snare: drum('....x... ....x...'),
    hat:   drum('x..xx..x x..xx..x'),
  },
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // Long-lived ambient layers, built lazily on resume() and steered by setters.
  private noise: AudioBuffer | null = null;

  // Pale drone: a detuned pair plus a beating dissonant fifth, fed through a
  // shared gain that setPale() ramps. Built once; never restarted per call.
  private droneGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneDetune: GainNode | null = null; // mixes in the dissonant voice

  // Thruster: a multi-layer rocket roar on a shared bus that setThrust() ramps.
  // Low rumble (lowpass noise) + a mid "blowing air" band (bandpass noise) + a
  // low sawtooth drone for body, all built once and summed into thrustGain.
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;   // the low rumble's lowpass
  private thrustMidFilter: BiquadFilterNode | null = null; // the mid air-band's bandpass
  private thrustLfo: OscillatorNode | null = null;         // slow shimmer on the mid band

  // Background music: a bank of Mega Drive / Genesis chiptune tracks (see TRACKS).
  // Its own gain bus (so stopMusic can fade independently of SFX) plus a lookahead
  // scheduler. The sequencer walks a fixed grid of steps, scheduling each note
  // slightly ahead of the AudioContext clock for rock-solid timing that a
  // setInterval/Date.now loop could never give us. The sound is faked YM2612 FM
  // (modulator→carrier.frequency for the punchy bass and the brassy "twang" lead),
  // SN76489-style square-wave PSG arps, and a noise-driven drum kit — all summed
  // onto musicBus. setTrack() picks which TRACK the scheduler reads from.
  private musicBus: GainNode | null = null;
  private musicTimer: number | null = null; // setInterval handle, null when stopped
  private musicStep = 0;                     // current position in the pattern (0..63)
  private musicNextTime = 0;                 // AudioContext time of the next step
  private trackIndex = 0;                    // which TRACK is active (set by setTrack)
  // Track swaps are deferred to the next loop boundary so the change lands cleanly
  // on a downbeat with no click. null = no pending swap.
  private pendingTrack: number | null = null;

  root = 48; // MIDI-ish root; setDepth() shifts this down as you fall

  /** Must be called from a user gesture (browser autoplay policy). */
  resume(): void {
    if (!this.ctx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(2);
      this.buildDrone();
      this.buildThrust();
      this.buildMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private freq(semi: number): number {
    return 440 * Math.pow(2, (this.root + semi - 69) / 12);
  }

  /** A few seconds of white noise we can loop for drones and thrust. */
  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A single decaying oscillator voice — the workhorse for melodic hits. */
  private voice(semi: number, dur: number, vel: number, type: OscillatorType = 'triangle'): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = this.freq(semi);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vel * 0.4, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // ── Melodic / event hits (one-shots) ─────────────────────────────

  /** A body's tone, scaled into the sector key. */
  tone(step: number, velocity = 0.6): void {
    const semi = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
    this.voice(semi, 0.18, velocity, 'sine');
  }

  /** The snap — a bright chord, brighter the cleaner the release. */
  snap(quality: number): void {
    const v = 0.35 + quality * 0.5;
    this.voice(0, 0.6, v, 'triangle');
    this.voice(7, 0.6, v * 0.8, 'triangle');
    this.voice(12, 0.7, v * 0.7, 'sine');
    if (quality > 0.7) this.voice(16, 0.8, v * 0.6, 'sine'); // high harmony
  }

  thud(): void { this.voice(-12, 0.3, 0.5, 'sawtooth'); }

  /** Pushes the musical root down a sector — darker, tenser the deeper you fall. */
  setDepth(depth: number): void {
    this.root = 48 - depth; // one semitone per sector keeps it musical
  }

  /** A dead world relights — a triumphant rising arpeggio capped by a chord. */
  reignite(): void {
    if (!this.ctx) return;
    const arp = [0, 3, 7, 12, 15]; // minor climb into the octave-plus-third
    const step = 0.07;
    arp.forEach((semi, i) => {
      this.delay(i * step, () => this.voice(semi, 0.5, 0.45, 'triangle'));
    });
    // Sustained chord arrives as the arpeggio lands.
    this.delay(arp.length * step, () => {
      this.voice(0, 1.1, 0.4, 'sine');
      this.voice(7, 1.1, 0.34, 'triangle');
      this.voice(12, 1.2, 0.3, 'sine');
      this.voice(19, 1.3, 0.22, 'sine'); // shimmer up top
    });
  }

  /** Warping to the next field — a filtered noise whoosh with a pitch sweep. */
  warp(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + 0.5);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.9);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + 1.0);
    // A descending sine under it sells the lurch through space.
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.freq(12), t);
    osc.frequency.exponentialRampToValueAtTime(this.freq(-12), t + 0.8);
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.85);
  }

  /** Drafting a power-up — a soft, quick confirming blip. */
  pick(): void {
    if (!this.ctx) return;
    this.voice(7, 0.12, 0.3, 'sine');
    this.delay(0.05, () => this.voice(12, 0.14, 0.28, 'sine'));
  }

  /** Entering a sphere of influence — a soft low welcome tone. */
  enter(): void {
    this.voice(-12, 0.4, 0.22, 'sine');
    this.voice(-5, 0.5, 0.16, 'sine');
  }

  // ── Combat SFX (one-shots) ───────────────────────────────────────

  /**
   * A rocket missile launch — a noise whoosh igniting into a short rocket-burn
   * tail. The texture is dominated by filtered noise (exhaust), not a tone, so
   * it reads as "fffSSSHHH" rather than a laser pew. Kept modest in level so the
   * many missiles fired in quick succession layer without clipping.
   */
  missile(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;

    // Launch whoosh: a bandpass noise burst sweeping up then settling, for the
    // sharp "kick" of ignition.
    const whoosh = this.ctx.createBufferSource();
    whoosh.buffer = this.noise;
    const wf = this.ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.Q.value = 1.2;
    wf.frequency.setValueAtTime(400, t);
    wf.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
    wf.frequency.exponentialRampToValueAtTime(900, t + 0.22);
    const wg = this.ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    whoosh.connect(wf); wf.connect(wg); wg.connect(this.master);
    whoosh.start(t); whoosh.stop(t + 0.24);

    // Rocket-burn tail: lowpass noise that decays over ~0.4s, the sustained
    // exhaust thrust trailing the launch.
    const burn = this.ctx.createBufferSource();
    burn.buffer = this.noise;
    const bf = this.ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.setValueAtTime(1400, t);
    bf.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    burn.connect(bf); bf.connect(bg); bg.connect(this.master);
    burn.start(t); burn.stop(t + 0.44);

    // Subtle downward sub-oscillator body — felt more than heard, just enough
    // weight under the noise so the launch has punch.
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(this.freq(-8), t);
    osc.frequency.exponentialRampToValueAtTime(this.freq(-22), t + 0.3);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.34);
  }

  /** An explosion — a filtered noise burst over a low sine thump. */
  boom(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    // Noise burst, swept downward through a low-pass for a collapsing crack.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(filter); filter.connect(ng); ng.connect(this.master);
    src.start(t); src.stop(t + 0.32);
    // Low sine thump for the body of the blast.
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.freq(-12), t);
    osc.frequency.exponentialRampToValueAtTime(this.freq(-30), t + 0.25);
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.32);
  }

  /** A kill confirm — a quick descending blip arp, distinct from boom(). */
  enemyDown(): void {
    if (!this.ctx) return;
    const arp = [19, 14, 10, 5]; // a bright tumble down the scale
    const step = 0.05;
    arp.forEach((semi, i) => {
      this.delay(i * step, () => this.voice(semi, 0.12, 0.32, 'square'));
    });
  }

  // ── Ambient layers (continuous; safe to call every frame) ────────

  /**
   * Drive the Pale drone. intensity 0..1: 0 is silent and clean, 1 is a loud,
   * beating, dissonant low bed. Ramps smoothly — never restarts oscillators.
   */
  setPale(intensity: number): void {
    if (!this.ctx || !this.droneGain || !this.droneDetune) return;
    const i = Math.max(0, Math.min(1, intensity));
    const t = this.ctx.currentTime;
    // Overall level: quiet floor, capped well below the melodic hits.
    this.droneGain.gain.setTargetAtTime(i * 0.12, t, 0.4);
    // Dissonant voice fades in with intensity to sour the chord as it grows.
    this.droneDetune.gain.setTargetAtTime(i * i, t, 0.5);
    // Track the current root so the drone sinks with depth.
    const base = this.freq(-24);
    this.droneOscs[0]?.frequency.setTargetAtTime(base, t, 0.5);
    this.droneOscs[1]?.frequency.setTargetAtTime(base * 1.003, t, 0.5); // slow beat
    // The minor-second above the fifth is the sour note; it sharpens with i.
    this.droneOscs[2]?.frequency.setTargetAtTime(base * Math.pow(2, 6 / 12), t, 0.5);
  }

  /**
   * The engine roar while thrusting. Ramps the multi-layer thrust bus toward a
   * fuller, more present target than the old quiet rumble — still capped so it
   * sits under the music and SFX rather than dominating. Safe every frame: it
   * only steers a gain; the continuous layers live in buildThrust().
   */
  setThrust(on: boolean): void {
    if (!this.ctx || !this.thrustGain) return;
    const t = this.ctx.currentTime;
    this.thrustGain.gain.setTargetAtTime(on ? 0.17 : 0, t, 0.08);
  }

  // ── Background music (data-driven Mega Drive chiptune sequencer) ─

  // A 64-step pattern: four bars of sixteenth notes, looping forever. The TEMPO
  // is per-track (see Track.bpm), so STEP_DUR is computed from the active track
  // rather than a constant. STEPS is the loop length; LOOKAHEAD is how far ahead
  // of the clock we schedule; TICK is the wall-clock poll interval (just has to
  // fire often enough to stay ahead of the lookahead window).
  private static readonly STEPS = 64;        // pattern length (4 bars)
  private static readonly LOOKAHEAD = 0.1;   // schedule this far ahead (s)
  private static readonly TICK = 25;         // scheduler poll interval (ms)

  /** The currently active track, clamped into the bank. */
  private get track(): Track {
    return TRACKS[this.trackIndex % TRACKS.length];
  }

  /** Seconds per sixteenth note for the active track's tempo. */
  private stepDur(): number {
    return 60 / this.track.bpm / 4;
  }

  /**
   * Resolve a scale-degree to a semitone through a mode. Degree 0 is the mode's
   * root; 7 is the octave; degrees beyond ±7 wrap, adding/subtracting 12 per
   * octave so a single seven-note mode array covers the whole melodic range. The
   * result is relative to root (freq() adds the depth transposition on top).
   */
  private degreeToSemi(degree: number, mode: Mode): number {
    const n = mode.length;           // 7
    const oct = Math.floor(degree / n);
    let idx = degree % n;
    if (idx < 0) idx += n;
    return mode[idx] + oct * 12;
  }

  /**
   * Select the active music track by index (cycles via modulo, so any integer is
   * valid). main.ts calls this per sector. If music is already playing the swap
   * is deferred to the next loop boundary so it lands cleanly on a downbeat with
   * no click; otherwise it just sets which track startMusic() will play.
   */
  setTrack(index: number): void {
    const i = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
    if (this.musicTimer === null) {
      // Not playing — apply immediately so startMusic() begins on the new track.
      this.trackIndex = i;
      this.pendingTrack = null;
    } else if (i !== this.trackIndex) {
      // Playing — queue the swap for the next loop boundary.
      this.pendingTrack = i;
    }
  }

  /**
   * Begin the looping background track. Idempotent — a second call is a no-op
   * while it's already running. No-ops before resume() opens the context, so
   * main.ts must call resume() (from a user gesture) first.
   */
  startMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    if (this.musicTimer !== null) return; // already playing — don't stack
    const t = this.ctx.currentTime;
    // Swell the bus to its quiet target, well under the SFX on the master bus.
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.2, t + 1.0);
    this.musicStep = 0;
    this.pendingTrack = null; // start clean on whatever track is selected
    this.musicNextTime = t + 0.1; // small cushion before the first step
    this.musicTimer = window.setInterval(() => this.schedule(), AudioEngine.TICK);
  }

  /**
   * Fade the music out and stop the scheduler. Safe to call when not playing.
   */
  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(0, t + 0.6);
    }
  }

  /**
   * The lookahead heartbeat: schedule every step whose time falls inside the
   * lookahead window, advancing the pattern as we go. Runs off the wall clock
   * (setInterval) but commits every note to the precise AudioContext clock.
   */
  private schedule(): void {
    if (!this.ctx) return;
    while (this.musicNextTime < this.ctx.currentTime + AudioEngine.LOOKAHEAD) {
      // Apply a pending track swap right on the loop boundary (step 0) so the new
      // tempo/mode/groove starts a fresh phrase rather than mid-bar.
      if (this.musicStep === 0 && this.pendingTrack !== null) {
        this.trackIndex = this.pendingTrack;
        this.pendingTrack = null;
      }
      this.playStep(this.musicStep, this.musicNextTime);
      this.musicNextTime += this.stepDur();
      this.musicStep = (this.musicStep + 1) % AudioEngine.STEPS;
    }
  }

  /**
   * Voice one grid step at an absolute AudioContext time onto the music bus.
   * `step` is 0..STEPS-1 (four bars); per-bar grids are indexed with `bar` (the
   * 16-step position within the current bar) so the drums and bass groove repeats
   * each bar while the lead phrases over the whole loop.
   */
  private playStep(step: number, when: number): void {
    const trk = this.track;
    const bar = step % 16;          // position within the current bar
    const barNum = (step / 16) | 0; // which of the four bars (0..3)
    const dur = this.stepDur();
    const mode = trk.mode;

    // Swing: nudge every odd 16th later for a shuffled groove. Degrees stay put;
    // only the start time slides, within the step so it never overruns the next.
    const swung = (bar % 2 === 1) ? when + dur * trk.swing : when;

    // ── FM BASS: punchy, snappy YM2612 bass driving the low end ──────
    const bassDeg = trk.bass[bar];
    if (bassDeg !== null) {
      // Last bar drops the bass an octave on its root jumps for a build.
      const oct = barNum === 3 && bar % 4 === 0 ? -12 : 0;
      const semi = this.degreeToSemi(bassDeg, mode) - 12 + oct; // bass an octave low
      this.fmVoice(semi, dur * 1.5, 0.5, trk.bassRatio, trk.bassIndex, swung, 0.012);
    }

    // ── FM LEAD: the bright Genesis brass-twang hook ─────────────────
    const leadDeg = trk.lead[step];
    if (leadDeg !== null) {
      // A little velocity wobble keeps the lead from sounding mechanical.
      const vel = 0.34 + Math.random() * 0.07;
      const semi = this.degreeToSemi(leadDeg, mode) + 12; // lead an octave up
      this.fmVoice(semi, dur * 2.0, vel, trk.leadRatio, trk.leadIndex, swung, 0.006, trk.leadType);
    }

    // ── PSG ARP: a fast square-wave figure on every step for motion ──
    if (trk.arpOn) {
      const semi = this.degreeToSemi(trk.arp[bar], mode);
      this.psgVoice(semi, dur * 0.9, 0.1, swung);
    }

    // ── DRUMS: the noise-driven kit ─────────────────────────────────
    if (trk.kick[bar]) this.kick(swung);
    if (trk.snare[bar]) this.snare(swung);
    if (trk.hat[bar]) {
      // Offbeat hats sit a touch quieter than downbeats for a human lilt.
      this.hat(swung, bar % 2 === 0 ? 0.16 : 0.11);
    }
  }

  /**
   * An FM voice (faked YM2612, 2-operator): a modulator oscillator whose gain
   * feeds the carrier's frequency AudioParam, so the modulator bends the carrier
   * pitch thousands of times a second — that frequency-modulation is what gives
   * the metallic Genesis timbre. `ratio` is the modulator:carrier frequency ratio
   * (integer-ish ratios sound musical/brassy), `index` scales the modulation
   * depth (the modulator gain, in Hz of deviation). `carrier` picks the carrier
   * waveform — a sine carrier is the classic clean FM; a triangle or square
   * carrier gives a richer, harder edge, varying the lead's flavour per track.
   * Pinned to an absolute start time and routed to musicBus; reads freq() so it
   * transposes with setDepth().
   */
  private fmVoice(
    semi: number, dur: number, vel: number, ratio: number, index: number,
    when: number, atk: number, carrier: OscillatorType = 'sine',
  ): void {
    if (!this.ctx || !this.musicBus) return;
    const carrierHz = this.freq(semi);

    // Modulator → its gain → carrier.frequency. The mod gain is the FM index,
    // and we decay it so the timbre is bright on attack then mellows (the classic
    // percussive FM pluck/brass shape).
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    mod.type = 'sine';
    mod.frequency.value = carrierHz * ratio;
    const peakDev = carrierHz * index;
    modGain.gain.setValueAtTime(peakDev, when);
    modGain.gain.exponentialRampToValueAtTime(peakDev * 0.25 + 0.0001, when + dur * 0.6);
    mod.connect(modGain);

    // Carrier with a snappy amp envelope.
    const car = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    car.type = carrier;
    car.frequency.value = carrierHz;
    modGain.connect(car.frequency); // FM: modulator bends the carrier's pitch
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(vel * 0.4, when + atk);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    car.connect(amp); amp.connect(this.musicBus);

    mod.start(when); car.start(when);
    mod.stop(when + dur + 0.05); car.stop(when + dur + 0.05);
  }

  /**
   * A PSG voice (faked SN76489): a plain square-wave blip with a quick decay,
   * for the busy chiptune arpeggio. Pinned to an absolute start time, routed to
   * musicBus, and reads freq() so it transposes with setDepth().
   */
  private psgVoice(semi: number, dur: number, vel: number, when: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = this.freq(semi);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vel * 0.4, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain); gain.connect(this.musicBus);
    osc.start(when); osc.stop(when + dur + 0.05);
  }

  // ── Drum kit (noise buffer + pitched blips, all onto musicBus) ────

  /** KICK: a fast downward pitch sweep (140→45 Hz) with a punchy decay. */
  private kick(when: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.08);
    gain.gain.setValueAtTime(0.55, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(gain); gain.connect(this.musicBus);
    osc.start(when); osc.stop(when + 0.18);
  }

  /** SNARE: a short bandpassed (~1.8k) noise burst with a quick decay. */
  private snare(when: number): void {
    if (!this.ctx || !this.musicBus || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    src.connect(bp); bp.connect(gain); gain.connect(this.musicBus);
    src.start(when); src.stop(when + 0.14);
  }

  /** HI-HAT: a very short high-passed noise tick. */
  private hat(when: number, vel: number): void {
    if (!this.ctx || !this.musicBus || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    src.connect(hp); hp.connect(gain); gain.connect(this.musicBus);
    src.start(when); src.stop(when + 0.05);
  }

  // ── Layer construction (once, on resume) ─────────────────────────

  private buildDrone(): void {
    if (!this.ctx || !this.master) return;
    const base = this.freq(-24);
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    // Gentle low-pass keeps the drone felt more than heard.
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    this.droneGain.connect(lp); lp.connect(this.master);

    const mkOsc = (f: number, type: OscillatorType, gainTo: GainNode, level: number) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.value = level;
      osc.connect(g); g.connect(gainTo);
      osc.start();
      this.droneOscs.push(osc);
      return osc;
    };

    // Two near-unison saws beat slowly against each other.
    mkOsc(base, 'sawtooth', this.droneGain, 0.6);
    mkOsc(base * 1.003, 'sawtooth', this.droneGain, 0.6);
    // The dissonant voice routes through its own gain so setPale can swell it.
    this.droneDetune = this.ctx.createGain();
    this.droneDetune.gain.value = 0;
    this.droneDetune.connect(this.droneGain);
    mkOsc(base * Math.pow(2, 6 / 12), 'sawtooth', this.droneDetune, 0.5); // tritone-ish
  }

  /**
   * The music bus: a quiet gain all sequenced notes (FM, PSG, drums) share, fed
   * through a gentle lowpass to round off the square/FM fizz so the frantic track
   * sits warm under the SFX. Built once; startMusic() swells the gain.
   */
  private buildMusic(): void {
    if (!this.ctx || !this.master) return;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0; // silent until startMusic() swells it
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000; // tame the harshest chiptune highs, keep the bite
    this.musicBus.connect(lp); lp.connect(this.master);
  }

  private buildThrust(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    // Shared bus: setThrust() ramps this one gain toward the engine level.
    this.thrustGain = this.ctx.createGain();
    this.thrustGain.gain.value = 0;
    this.thrustGain.connect(this.master);

    // Layer 1 — low rumble: a deep lowpass noise bed for the engine's body.
    const rumble = this.ctx.createBufferSource();
    rumble.buffer = this.noise;
    rumble.loop = true;
    this.thrustFilter = this.ctx.createBiquadFilter();
    this.thrustFilter.type = 'lowpass';
    this.thrustFilter.frequency.value = 220;
    this.thrustFilter.Q.value = 1;
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.9;
    rumble.connect(this.thrustFilter);
    this.thrustFilter.connect(rumbleGain);
    rumbleGain.connect(this.thrustGain);
    rumble.start();

    // Layer 2 — mid "blowing air": a bandpass noise band that gives the roar its
    // hiss and presence. Its centre frequency drifts (see LFO below) so the
    // engine breathes instead of sitting on one dead note.
    const air = this.ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    this.thrustMidFilter = this.ctx.createBiquadFilter();
    this.thrustMidFilter.type = 'bandpass';
    this.thrustMidFilter.frequency.value = 900;
    this.thrustMidFilter.Q.value = 0.7;
    const airGain = this.ctx.createGain();
    airGain.gain.value = 0.5;
    air.connect(this.thrustMidFilter);
    this.thrustMidFilter.connect(airGain);
    airGain.connect(this.thrustGain);
    air.start();

    // A slow LFO sweeps the air band ±250 Hz for a living, shimmering engine.
    this.thrustLfo = this.ctx.createOscillator();
    this.thrustLfo.type = 'sine';
    this.thrustLfo.frequency.value = 0.7;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = 250;
    this.thrustLfo.connect(lfoDepth);
    lfoDepth.connect(this.thrustMidFilter.frequency);
    this.thrustLfo.start();

    // Layer 3 — low sawtooth drone: a touch of pitched body under the noise so
    // the roar has weight and isn't pure hiss.
    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    const droneLp = this.ctx.createBiquadFilter();
    droneLp.type = 'lowpass';
    droneLp.frequency.value = 180;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.4;
    drone.connect(droneLp);
    droneLp.connect(droneGain);
    droneGain.connect(this.thrustGain);
    drone.start();
  }

  /** Schedule a callback relative to now, for arpeggios and staged hits. */
  private delay(seconds: number, fn: () => void): void {
    if (seconds <= 0) { fn(); return; }
    setTimeout(fn, seconds * 1000);
  }
}
