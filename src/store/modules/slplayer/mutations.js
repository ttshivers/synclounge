import stateFactory from './state';

export default {
  RESET: (state) => {
    Object.assign(state, stateFactory());
  },

  SET_PLAYER_STATE: (state, playerState) => {
    state.playerState = playerState;
  },

  SET_SESSION: (state, session) => {
    state.session = session;
  },

  SET_OFFSET_MS: (state, offset) => {
    state.offsetMs = offset;
  },

  SET_MEDIA_INDEX: (state, index) => {
    state.mediaIndex = index;
  },

  SET_PLEX_DECISION: (state, decision) => {
    state.plexDecision = decision;
  },

  SET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN: (state, token) => {
    state.plexTimelineUpdaterCancelToken = token;
  },

  SET_PLAYER_DESTROY_CANCEL_TOKEN: (state, token) => {
    state.playerDestroyCancelToken = token;
  },

  SET_IS_PLAYER_INITIALIZED: (state, isInitialized) => {
    state.isPlayerInitialized = isInitialized;
  },

  SET_MASK_PLAYER_STATE: (state, mask) => {
    state.maskPlayerState = mask;
  },

  SET_IS_IN_PICTURE_IN_PICTURE: (state, isIn) => {
    state.isInPictureInPicture = isIn;
  },

  SET_SUBTITLE_SIZE: (state, size) => {
    state.subtitleSize = size;
  },

  SET_SUBTITLE_POSITION: (state, position) => {
    state.subtitlePosition = position;
  },

  SET_SUBTITLE_COLOR: (state, color) => {
    state.subtitleColor = color;
  },

  SET_STREAMING_PROTOCOL: (state, protocol) => {
    state.streamingProtocol = protocol;
  },

  SET_FORCE_TRANSCODE_RETRY: (state, force) => {
    state.forceTranscodeRetry = force;
  },

  SET_SHOW_PLAYER: (state, show) => {
    state.showPlayer = show;
  },

  SET_IS_PLAYER_EXPANDED: (state, isPlayerExpanded) => {
    state.isPlayerExpanded = isPlayerExpanded;
  },
};
