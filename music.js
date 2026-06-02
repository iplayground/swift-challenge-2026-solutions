// Local MP3 background music. Keeps the existing public API names so app.js
// can start, stop, prime, and toggle music without knowing the implementation.

(() => {
document.documentElement.dataset.musicReady = "mp3";

const MUSIC_SRC = "assets/audio/background.mp3";
const MUSIC_VOLUME = 0.45;
const DEBUG_PREFIX = "[Quiz Music]";

let musicAudio = null;
let isPlaying = false;

function getMusicAudio() {
  if (!musicAudio) {
    musicAudio = document.querySelector("#background-music") || new Audio(MUSIC_SRC);
    if (!musicAudio.getAttribute("src")) {
      musicAudio.setAttribute("src", MUSIC_SRC);
    }
    musicAudio.loop = true;
    musicAudio.preload = "auto";
    musicAudio.volume = MUSIC_VOLUME;
    musicAudio.addEventListener("pause", () => {
      isPlaying = false;
    });
    musicAudio.addEventListener("play", () => {
      isPlaying = true;
    });
  }

  return musicAudio;
}

async function startMusic() {
  const audio = getMusicAudio();

  if (isPlaying && !audio.paused) {
    return true;
  }

  audio.currentTime = 0;
  audio.volume = MUSIC_VOLUME;
  try {
    await audio.play();
    isPlaying = true;
    console.info(`${DEBUG_PREFIX} started ${MUSIC_SRC}`);
    return true;
  } catch (error) {
    isPlaying = false;
    console.warn(`${DEBUG_PREFIX} start blocked`, error);
    return false;
  }
}

function stopMusic() {
  if (!musicAudio) {
    isPlaying = false;
    return false;
  }

  musicAudio.pause();
  musicAudio.currentTime = 0;
  isPlaying = false;
  console.info(`${DEBUG_PREFIX} stopped`);
  return false;
}

function getStatus() {
  const audio = getMusicAudio();
  return {
    isPlaying,
    src: audio.currentSrc || MUSIC_SRC,
    mediaPaused: audio.paused,
    readyState: audio.readyState,
    duration: Number.isFinite(audio.duration) ? audio.duration : null,
  };
}

window.strudelStart = startMusic;
window.quizMusicStart = startMusic;
window.quizMusicStop = stopMusic;
window.quizMusicPrime = startMusic;
window.quizMusicStatus = getStatus;

window.strudelToggle = async function () {
  if (isPlaying && musicAudio && !musicAudio.paused) {
    return stopMusic();
  }

  return startMusic();
};
})();
