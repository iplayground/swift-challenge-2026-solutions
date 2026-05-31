// Local Web Audio background loop. Keeps the old public API names so app.js
// can start/toggle music without depending on remote Strudel modules.

let audioCtx = null;
let masterGain = null;
let delayNode = null;
let delayFeedback = null;
let musicTimer = null;
let fallbackAudio = null;
let snareBuffer = null;
let hatBuffer = null;
let isPlaying = false;
let step = 0;
let nextNoteTime = 0;

const BPM = 124;
const STEP_SECONDS = 60 / BPM / 4;
const SCHEDULE_AHEAD_SECONDS = 0.5;
const SCHEDULER_INTERVAL_MS = 80;
const DEBUG_PREFIX = "[Quiz Music]";
const bassline = ["C3", "E3", "G3", "E3", "A2", "C3", "E3", "C3", "F2", "A2", "C3", "A2", "G2", "B2", "D3", "B2"];
const leadline = ["E5", null, "G5", null, "A5", null, "G5", null, "E5", null, "D5", null, "C5", null, "D5", null];
const padChords = [
  ["A3", "C4", "E4", "G4"],
  ["F3", "A3", "C4", "E4"],
  ["C3", "E3", "G3", "B3"],
  ["G3", "B3", "D4", "F4"],
];

function createFallbackAudio() {
  if (fallbackAudio) return fallbackAudio;

  const sampleRate = 22050;
  const seconds = 4;
  const totalSamples = sampleRate * seconds;
  const dataBytes = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const beat = (t * BPM / 60) % 4;
    const stepIndex = Math.floor((t / STEP_SECONDS) % 16);
    const bassFreq = noteToFrequency(bassline[Math.floor(stepIndex / 2) % bassline.length]);
    const leadNote = leadline[stepIndex];
    const leadFreq = leadNote ? noteToFrequency(leadNote) : 0;
    const kick = Math.exp(-18 * (beat % 1)) * Math.sin(2 * Math.PI * 58 * t) * (stepIndex % 8 === 0 || stepIndex === 6 || stepIndex === 10 ? 0.7 : 0);
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.16;
    const lead = leadFreq ? Math.sin(2 * Math.PI * leadFreq * t) * 0.055 : 0;
    const shimmer = Math.sin(2 * Math.PI * noteToFrequency("C5") * t) * 0.018 + Math.sin(2 * Math.PI * noteToFrequency("G5") * t) * 0.012;
    const hat = stepIndex % 2 === 0 ? (Math.random() * 2 - 1) * Math.exp(-85 * (t % STEP_SECONDS)) * 0.035 : 0;
    const sample = Math.max(-1, Math.min(1, kick + bass + lead + shimmer + hat));
    view.setInt16(44 + i * 2, sample * 0x7fff, true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  fallbackAudio = new Audio(`data:audio/wav;base64,${btoa(binary)}`);
  fallbackAudio.loop = true;
  fallbackAudio.volume = 0.9;
  return fallbackAudio;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this browser.");
  }

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.82;

    delayNode = audioCtx.createDelay(0.8);
    delayNode.delayTime.value = 0.28;

    delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.2;

    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }

  return audioCtx;
}

function getNoiseBuffer(durationSeconds) {
  const ctx = getAudioContext();
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * durationSeconds)), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function noteToFrequency(note) {
  const match = /^([A-G])([b#]?)(-?\d+)$/.exec(note);
  if (!match) return 440;

  const [, pitch, accidental, octaveText] = match;
  const semitones = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const accidentalOffset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  const octave = Number(octaveText);
  const distance = semitones[pitch] + accidentalOffset + (octave - 4) * 12;
  return 440 * Math.pow(2, distance / 12);
}

function envelope(gainNode, time, peak, decay, sustain = 0.001) {
  gainNode.gain.cancelScheduledValues(time);
  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.exponentialRampToValueAtTime(peak, time + 0.018);
  gainNode.gain.exponentialRampToValueAtTime(sustain, time + decay);
}

function playTone(note, time, duration, type, peak, destination = masterGain) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(noteToFrequency(note), time);
  envelope(amp, time, peak, duration);

  osc.connect(amp);
  amp.connect(destination);
  osc.start(time);
  osc.stop(time + duration + 0.04);
}

function playPad(notes, time) {
  notes.forEach((note) => {
    playTone(note, time, STEP_SECONDS * 15.5, "triangle", 0.045);
  });
}

function playKick(time) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(120, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.16);
  envelope(amp, time, 0.95, 0.18);

  osc.connect(amp);
  amp.connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.22);
}

function playSnare(time) {
  const ctx = getAudioContext();
  snareBuffer ||= getNoiseBuffer(0.12);

  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();

  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.8;
  envelope(amp, time, 0.28, 0.12);

  noise.buffer = snareBuffer;
  noise.connect(filter);
  filter.connect(amp);
  amp.connect(masterGain);
  noise.start(time);
  noise.stop(time + 0.14);
}

function playHat(time) {
  const ctx = getAudioContext();
  hatBuffer ||= getNoiseBuffer(0.035);

  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();

  filter.type = "highpass";
  filter.frequency.value = 7000;
  envelope(amp, time, 0.1, 0.04);

  noise.buffer = hatBuffer;
  noise.connect(filter);
  filter.connect(amp);
  amp.connect(masterGain);
  noise.start(time);
  noise.stop(time + 0.05);
}

function playStartTone(time) {
  playTone("C5", time, 0.12, "triangle", 0.34);
  playTone("G5", time + 0.08, 0.16, "triangle", 0.28);
}

function scheduleStep(stepNumber, time) {
  const current = stepNumber % 16;

  if (current === 0) {
    playPad(padChords[Math.floor(stepNumber / 16) % padChords.length], time);
  }

  if (current % 8 === 0 || current === 10) playKick(time);
  if (current === 4 || current === 12) playSnare(time);
  if (current % 2 === 0) playHat(time);

  if (current % 2 === 0) {
    playTone(bassline[(stepNumber / 2) % bassline.length | 0], time, 0.22, "triangle", 0.14);
  }

  const leadNote = leadline[current];
  if (leadNote) {
    playTone(leadNote, time, 0.2, "triangle", 0.1, delayNode);
  }
}

function scheduler() {
  if (!isPlaying) return;

  const ctx = getAudioContext();
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_SECONDS) {
    scheduleStep(step, nextNoteTime);
    nextNoteTime += STEP_SECONDS;
    step += 1;
  }
}

async function startLoop() {
  const ctx = getAudioContext();
  if (isPlaying) return true;

  const resumePromise = ctx.resume();
  isPlaying = true;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.04;
  playStartTone(ctx.currentTime + 0.02);
  scheduler();
  musicTimer = window.setInterval(scheduler, SCHEDULER_INTERVAL_MS);
  await resumePromise;
  console.info(`${DEBUG_PREFIX} started; state=${ctx.state}`);
  return true;
}

function stopLoop() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (fallbackAudio) {
    fallbackAudio.pause();
    fallbackAudio.currentTime = 0;
  }
  isPlaying = false;
  console.info(`${DEBUG_PREFIX} stopped`);
  return false;
}

window.strudelStart = startLoop;
window.quizMusicStart = startLoop;
window.quizMusicStop = stopLoop;
window.quizMusicPrime = function () {
  return startLoop();
};
window.quizMusicStatus = function () {
  return {
    isPlaying,
    audioState: audioCtx ? audioCtx.state : "not-created",
    mediaPaused: fallbackAudio ? fallbackAudio.paused : "not-created",
    hasAudioContext: Boolean(window.AudioContext || window.webkitAudioContext),
  };
};

window.strudelToggle = async function () {
  if (isPlaying) {
    return stopLoop();
  }

  return startLoop();
};
