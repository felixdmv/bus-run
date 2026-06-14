// Synthesized sound effects using the Web Audio API for MetroMile.
// These are 100% programmatic, zero-dependency, and work instantly with zero asset loading time.

let audioCtx: AudioContext | null = null;

/**
 * Initializes and resumes the shared AudioContext.
 * Browsers block audio until a user interaction (like clicking a button) occurs.
 */
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (error) {
    console.warn('Web Audio API is not supported in this browser.', error);
    return null;
  }
}

/**
 * Checks if sound is enabled globally in the app settings.
 */
function isSoundEnabled(): boolean {
  try {
    const settingsStr = localStorage.getItem('metromile-user-settings-v5');
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      return settings.soundEnabled !== false; // Default to true if not specified
    }
  } catch (e) {}
  return true;
}

/**
 * Plays a classic mid-pitch double-oscillator bus horn.
 */
export function playBusHorn() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.2, now + 0.02); // Fast attack
  masterGain.gain.setValueAtTime(0.2, now + 0.35);          // Hold
  masterGain.gain.linearRampToValueAtTime(0, now + 0.42);   // Quick decay

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, now); // Warm up the sawtooth waves

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(320, now); // D4 roughly

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(370, now); // Detuned second horn

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.45);
  osc2.stop(now + 0.45);
}

/**
 * Plays a heavy, resonant train horn consisting of 4 harmonized detuned tones.
 */
export function playTrainHorn() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.3, now + 0.05); // Slower attack for power
  masterGain.gain.setValueAtTime(0.3, now + 0.6);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85); // Resonant echo decay

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, now);

  // A minor / diminished train horn chord (typical of modern train horns)
  const freqs = [220, 261, 311, 370, 440];
  const oscs = freqs.map((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = index % 2 === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime((Math.random() - 0.5) * 15, now); // Natural detune
    osc.connect(filter);
    return osc;
  });

  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  oscs.forEach(osc => osc.start(now));
  oscs.forEach(osc => osc.stop(now + 0.9));
}

/**
 * Plays a metallic metro wheel-screech / track friction squeal.
 */
export function playMetroScreech() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.06, now + 0.1);
  masterGain.gain.setValueAtTime(0.06, now + 0.5);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1800, now); // Keeps only the screechy elements

  // Oscillator 1: High frequency with frequency modulation
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(2800, now);
  osc1.frequency.linearRampToValueAtTime(2600, now + 0.3);
  osc1.frequency.linearRampToValueAtTime(2950, now + 0.6);

  // Oscillator 2: Slightly offset frequency for beating screeches
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(3250, now);
  osc2.frequency.linearRampToValueAtTime(3400, now + 0.25);
  osc2.frequency.linearRampToValueAtTime(3100, now + 0.6);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.9);
  osc2.stop(now + 0.9);
}

/**
 * Plays a bus pneumatic brake air-pressure release sound (psshhh!).
 */
export function playBusPressure() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Generate white noise buffer
  const bufferSize = ctx.sampleRate * 1.0; // 1 second duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = buffer;

  // Filter: Bandpass swept down quickly to simulate releasing air
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(1.5, now);
  filter.frequency.setValueAtTime(2400, now);
  filter.frequency.exponentialRampToValueAtTime(350, now + 0.7);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.2, now + 0.04);       // Quick air burst
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.9); // Steady decay

  noiseNode.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  noiseNode.start(now);
  noiseNode.stop(now + 1.0);
}

/**
 * Plays a pleasant ascending chirp sound when you follow someone.
 */
export function playFollowSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.12, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, now);
  osc.frequency.exponentialRampToValueAtTime(920, now + 0.15); // Rising pitch

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.35);
}

/**
 * Plays a warm, popping bubble sound when you give a like.
 */
export function playLikeSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.16, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.12); // Warm drop

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

/**
 * Plays a premium double-bell notification sound for favorite athletes.
 */
export function playFavoriteNotificationSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const playTone = (time: number, freq: number, duration: number, vol: number) => {
    const osc = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const gainHarmonic = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(freq * 2, time); // Second harmonic adds bell brilliance

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    gainHarmonic.gain.setValueAtTime(0, time);
    gainHarmonic.gain.linearRampToValueAtTime(vol * 0.3, time + 0.02);
    gainHarmonic.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.7);

    osc.connect(gain);
    gain.connect(ctx.destination);

    oscHarmonic.connect(gainHarmonic);
    gainHarmonic.connect(ctx.destination);

    osc.start(time);
    oscHarmonic.start(time);
    osc.stop(time + duration);
    oscHarmonic.stop(time + duration);
  };

  // Double bell chime (A5 then E6)
  playTone(now, 880, 0.4, 0.12);
  playTone(now + 0.12, 1318.5, 0.5, 0.1);
}

/**
 * Plays a mechanical ticking validation sound when the ticket overlay is opened.
 */
export function playTicketOpenSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // 6 short ticking pulses
  for (let i = 0; i < 6; i++) {
    const clickTime = now + (i * 0.07);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900 - (i * 80), clickTime);

    gain.gain.setValueAtTime(0, clickTime);
    gain.gain.linearRampToValueAtTime(0.05, clickTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(clickTime);
    osc.stop(clickTime + 0.03);
  }
}

/**
 * Plays a heavy thumping stamp sound (to match the stamp hitting the ticket)
 * followed by a magical success arpeggio/chime.
 */
export function playTicketStampSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // The stamp hits the ticket after about 0.6 seconds of animation
  const stampTime = now + 0.6;

  // 1. Low Thud (physical stamp drop)
  const thudOsc = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thudOsc.type = 'triangle';
  thudOsc.frequency.setValueAtTime(160, stampTime);
  thudOsc.frequency.exponentialRampToValueAtTime(45, stampTime + 0.18);

  thudGain.gain.setValueAtTime(0, stampTime);
  thudGain.gain.linearRampToValueAtTime(0.35, stampTime + 0.01);
  thudGain.gain.exponentialRampToValueAtTime(0.001, stampTime + 0.2);

  thudOsc.connect(thudGain);
  thudGain.connect(ctx.destination);
  thudOsc.start(stampTime);
  thudOsc.stop(stampTime + 0.22);

  // 2. High Metallic Clank
  const clankOsc = ctx.createOscillator();
  const clankGain = ctx.createGain();
  clankOsc.type = 'sawtooth';
  clankOsc.frequency.setValueAtTime(380, stampTime);
  clankOsc.frequency.setValueAtTime(190, stampTime + 0.02);

  const clankFilter = ctx.createBiquadFilter();
  clankFilter.type = 'bandpass';
  clankFilter.frequency.setValueAtTime(550, stampTime);

  clankGain.gain.setValueAtTime(0, stampTime);
  clankGain.gain.linearRampToValueAtTime(0.15, stampTime + 0.005);
  clankGain.gain.exponentialRampToValueAtTime(0.001, stampTime + 0.07);

  clankOsc.connect(clankFilter);
  clankFilter.connect(clankGain);
  clankGain.connect(ctx.destination);

  clankOsc.start(stampTime);
  clankOsc.stop(stampTime + 0.08);

  // 3. Celebratory Chime Arpeggio (starts right as the stamp is imprinted)
  const chimeStart = stampTime + 0.1;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (major chord)
  
  notes.forEach((freq, idx) => {
    const noteTime = chimeStart + (idx * 0.08);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, noteTime);

    // Warm bell tone helper
    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(freq * 2, noteTime);

    const gainHarmonic = ctx.createGain();
    gainHarmonic.gain.setValueAtTime(0, noteTime);
    gainHarmonic.gain.linearRampToValueAtTime(0.02, noteTime + 0.02);
    gainHarmonic.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

    gain.gain.setValueAtTime(0, noteTime);
    gain.gain.linearRampToValueAtTime(0.1, noteTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    oscHarmonic.connect(gainHarmonic);
    gainHarmonic.connect(ctx.destination);

    osc.start(noteTime);
    oscHarmonic.start(noteTime);
    osc.stop(noteTime + 0.6);
    oscHarmonic.stop(noteTime + 0.45);
  });
}
