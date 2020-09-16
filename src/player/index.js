import { getOverlay, setOverlay } from './state';

const getControlsOptional = () => getOverlay()?.getControls();
// const getPlayerOptional = () => getControlsOptional()?.getPlayer();
export const getVideoOptional = () => getControlsOptional()?.getVideo();

const getControls = () => getOverlay().getControls();
const getControlsContainer = () => getControls().getControlsContainer();
export const getPlayer = () => getControls().getPlayer();
export const getVideo = () => getControls().getVideo();

// eslint-disable-next-line no-underscore-dangle
export const areControlsShown = () => !getOverlay() || (getControls().enabled_
    && (getControlsContainer().getAttribute('shown') != null
    || getControlsContainer().getAttribute('casting') != null));

export const getControlsOffset = (fallbackHeight) => (areControlsShown()
  ? (getVideoOptional()?.offsetHeight || fallbackHeight) * 0.025 + 48 || 0
  : 0);

export const isPaused = () => getVideo().paused;

export const isPresentationPaused = () => isPaused()
  && !getControls().isSeeking();

export const isBuffering = () => getPlayer().isBuffering();

export const isPlaying = () => !isPaused() && !isBuffering();

export const getCurrentTime = () => getVideo().currentTime;

export const getCurrentTimeMs = () => getVideo()
  .currentTime * 1000;

export const getDurationMs = () => getVideo().duration * 1000;

export const getVolume = () => getVideo().volume;

export const setVolume = (volume) => {
  getVideo().volume = volume;
};

export const play = () => getVideo().play();
export const pause = () => getVideo().pause();

export const isTimeInBufferedRange = (timeMs) => {
  const bufferedTimeRange = getVideo().buffered;

  // There can be multiple ranges
  for (let i = 0; i < bufferedTimeRange.length; i += 1) {
    if (timeMs >= bufferedTimeRange.start(i) * 1000 && timeMs <= bufferedTimeRange.end(i) * 1000) {
      return true;
    }
  }

  return false;
};

const addMediaElementEventListener = (...args) => getVideo().addEventListener(...args);

const removeMediaElementEventListener = (...args) => getVideo().removeEventListener(...args);

// TODO: potentialy make cancellable
export const waitForMediaElementEvent = ({ signal, type }) => new Promise((resolve, reject) => {
  signal.pr.catch((e) => {
    removeMediaElementEventListener(type, resolve);
    reject(e);
  });

  addMediaElementEventListener(type, resolve, { once: true });
});

export const cancelTrickPlay = () => getPlayer().cancelTrickPlay();

export const load = (...args) => getPlayer().load(...args);

export const unload = (...args) => getPlayer().unload(...args);

export const getPlaybackRate = () => getPlayer().getPlaybackRate();

export const setPlaybackRate = (rate) => {
  getVideo().playbackRate = rate;
};

export const setCurrentTimeMs = (timeMs) => {
  getVideo().currentTime = timeMs / 1000;
};

export const getSmallPlayButton = () => getControlsContainer()
  .getElementsByClassName('shaka-small-play-button')[0];

export const getBigPlayButton = () => getControlsContainer()
  .getElementsByClassName('shaka-play-button')[0];

export const getDimensions = () => {
  const {
    videoWidth, videoHeight, offsetWidth, offsetHeight,
  } = getVideo();

  return {
    videoWidth, videoHeight, offsetWidth, offsetHeight,
  };
};

export const insertElementBeforeVideo = (element) => {
  const { parentNode } = getVideo();

  parentNode.insertBefore(
    element,
    getVideo(),
  );
};

export const destroy = async () => {
  const savedOverlay = getOverlay();
  setOverlay(null);
  await savedOverlay.destroy();
};
