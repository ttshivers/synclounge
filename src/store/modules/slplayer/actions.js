import CAF from 'caf';

import { v4 as uuidv4 } from 'uuid';
import { fetchJson, queryFetch } from '@/utils/fetchutils';
import {
  play, pause, getDurationMs, getCurrentTimeMs, isTimeInBufferedRange, isPresentationPaused,
  waitForMediaElementEvent, cancelTrickPlay, load, setPlaybackRate, getPlaybackRate,
  setCurrentTimeMs, unload, getVideoOptional,
} from '@/player';
import subtitleActions from './subtitleActions';

export default {
  MAKE_TIMELINE_PARAMS: async ({
    state: { playerState }, getters, rootGetters, dispatch,
  }) => ({
    ratingKey: rootGetters['plexclients/GET_ACTIVE_MEDIA_METADATA'].ratingKey,
    key: rootGetters['plexclients/GET_ACTIVE_MEDIA_METADATA'].key,
    // playbackTime: 591
    playQueueItemID: rootGetters['plexclients/GET_ACTIVE_PLAY_QUEUE_SELECTED_ITEM'].playQueueItemID,
    state: playerState,
    hasMDE: 1,
    time: Math.floor(await dispatch('FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK')),
    duration: Math.floor(getDurationMs()),
    'X-Plex-Session-Identifier': getters.GET_X_PLEX_SESSION_ID,
    ...getters.GET_PART_PARAMS,
  }),

  FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK: ({ state: { maskPlayerState, offsetMs } }) => (
    maskPlayerState
      ? offsetMs
      : getCurrentTimeMs() || offsetMs),

  SEND_PLEX_DECISION_REQUEST: async ({ getters, commit }) => {
    const data = await fetchJson(getters.GET_DECISION_URL, getters.GET_DECISION_AND_START_PARAMS);
    commit('SET_PLEX_DECISION', data);
    commit('SET_SUBTITLE_OFFSET', parseInt(getters.GET_SUBTITLE_STREAM?.offset || 0, 10));
  },

  CHANGE_MAX_VIDEO_BITRATE: async ({ commit, dispatch }, bitrate) => {
    commit('settings/SET_SLPLAYERQUALITY', bitrate, { root: true });
    await dispatch('UPDATE_PLAYER_SRC_AND_KEEP_TIME');
  },

  CHANGE_AUDIO_STREAM: async ({ getters, dispatch }, audioStreamID) => {
    await queryFetch(getters.GET_PART_URL, {
      audioStreamID,
      ...getters.GET_PART_PARAMS,
    }, { method: 'PUT' });

    await dispatch('plexclients/RELOAD_ACTIVE_MEDIA_METADATA', null, { root: true });

    // Redo src
    await dispatch('UPDATE_PLAYER_SRC_AND_KEEP_TIME');
  },

  CHANGE_SUBTITLE_STREAM: async ({ getters, dispatch }, subtitleStreamID) => {
    await queryFetch(getters.GET_PART_URL, {
      subtitleStreamID,
      ...getters.GET_PART_PARAMS,
    }, { method: 'PUT' });

    await dispatch('plexclients/RELOAD_ACTIVE_MEDIA_METADATA', null, { root: true });

    // Redo src
    await dispatch('UPDATE_PLAYER_SRC_AND_KEEP_TIME');
  },

  CHANGE_MEDIA_INDEX: async ({ commit, dispatch }, index) => {
    commit('SET_MEDIA_INDEX', index);
    await dispatch('UPDATE_PLAYER_SRC_AND_KEEP_TIME');
  },

  // Changes the player src to the new one and restores the time afterwards
  UPDATE_PLAYER_SRC_AND_KEEP_TIME: async ({ commit, dispatch }) => {
    commit('SET_OFFSET_MS', await dispatch('FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK'));
    await dispatch('CHANGE_PLAYER_SRC');
  },

  CHANGE_SUBTITLES: async ({ getters, dispatch }) => {
    if (getters.IS_USING_NATIVE_SUBTITLES) {
      await dispatch('SET_SUBTITLE_URL');
    } else {
      await dispatch('DESTROY_ASS');
    }
  },

  CHANGE_PLAYER_SRC: async ({
    state: { maskPlayerState, forceTranscodeRetry }, getters, commit, dispatch,
  }) => {
    console.debug('CHANGE_PLAYER_SRC');

    // Abort subtitle requests now or else we get ugly errors from the server closing it.
    await dispatch('DESTROY_ASS');

    if (forceTranscodeRetry) {
      commit('SET_FORCE_TRANSCODE_RETRY', false);
    }

    commit('SET_SESSION', uuidv4());

    try {
      await dispatch('SEND_PLEX_DECISION_REQUEST');
      await dispatch('LOAD_PLAYER_SRC');
    } catch (e) {
      if (getters.GET_FORCE_TRANSCODE) {
        throw e;
      }
      console.warn('Error loading stream from plex. Retrying with forced transcoding', e);

      // Try again with forced transcoding
      commit('SET_FORCE_TRANSCODE_RETRY', true);
      await dispatch('SEND_PLEX_DECISION_REQUEST');
      await dispatch('LOAD_PLAYER_SRC');
    }

    await dispatch('CHANGE_SUBTITLES');

    // TODO: potentially avoid sending updates on media change since we already do that
    if (maskPlayerState) {
      commit('SET_MASK_PLAYER_STATE', false);
    }
  },

  SEND_PLEX_TIMELINE_UPDATE: async ({ getters, dispatch },
    { signal, ...extraParams } = {},
  ) => queryFetch(
    getters.GET_TIMELINE_URL,
    {
      ...await dispatch('MAKE_TIMELINE_PARAMS'),
      ...extraParams,
    },
    { signal },
  ),

  FETCH_TIMELINE_POLL_DATA: async ({ state: { playerState, offsetMs }, dispatch }) => (
    getVideoOptional()
      ? {
        time: await dispatch('FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK'),
        duration: getDurationMs(),
        playbackRate: getPlaybackRate(),
        state: playerState,
      }
      : {
        time: offsetMs,
        duration: 0,
        playbackRate: 0,
        state: playerState,
      }),

  PRESS_PLAY: () => {
    play();
  },

  PRESS_PAUSE: () => {
    pause();
  },

  PRESS_STOP: ({ commit }) => {
    // TODO: ...
    commit('SET_PLAYER_STATE', 'stopped');
  },

  SOFT_SEEK: ({ commit }, seekToMs) => {
    console.debug('SOFT_SEEK', seekToMs);
    if (!isTimeInBufferedRange(seekToMs)) {
      throw new Error('Soft seek not allowed outside of buffered range');
    }

    commit('SET_OFFSET_MS', seekToMs);
    setCurrentTimeMs(seekToMs);
  },

  PROCESS_STATE_UPDATE_ON_PLAYER_EVENT: async ({ dispatch }, { signal, type, noSync }) => {
    await waitForMediaElementEvent({ signal, type });
    await dispatch('synclounge/PROCESS_PLAYER_STATE_UPDATE', noSync, { root: true });
  },

  SPEED_SEEK: async ({ dispatch, rootGetters }, { cancelSignal, seekToMs }) => {
    console.debug('SPEED_SEEK', seekToMs);
    const currentTimeMs = await dispatch('FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK');
    const difference = seekToMs - currentTimeMs;
    const rate = 1 + (Math.sign(difference) * rootGetters.GET_CONFIG.slplayer_speed_sync_rate);
    const timeUntilSynced = (seekToMs - currentTimeMs) / (rate - 1);
    console.log('ms until synced: ', timeUntilSynced);

    const main = CAF(function* main(signal) {
      setPlaybackRate(rate);

      try {
        yield Promise.all([
          CAF.delay(signal, timeUntilSynced),

          dispatch('PROCESS_STATE_UPDATE_ON_PLAYER_EVENT', {
            signal,
            type: 'ratechange',
            noSync: true,
          }),
        ]);
      } finally {
        setPlaybackRate(1);

        // TODO: not sure what to do since I need to do this cancellable task in the cleanup
        dispatch('PROCESS_STATE_UPDATE_ON_PLAYER_EVENT', {
          signal,
          type: 'ratechange',
          // Don't sync if aborted
          noSync: signal.aborted,
        });
      }
    });

    return main(cancelSignal);
  },

  NORMAL_SEEK: async ({ rootGetters, commit }, { cancelSignal, seekToMs }) => {
    console.debug('NORMAL_SEEK', seekToMs);
    commit('SET_OFFSET_MS', seekToMs);
    setCurrentTimeMs(seekToMs);

    const timeoutToken = CAF.timeout(rootGetters.GET_CONFIG.slplayer_seek_timeout,
      'Normal seek took too long');

    const anySignal = CAF.signalRace([
      cancelSignal,
      timeoutToken.signal,
    ]);

    const main = CAF(function* main(signal) {
      yield waitForMediaElementEvent({ signal, type: 'seeked' });
    });

    try {
      await main(anySignal);
    } finally {
      timeoutToken.abort();
    }
  },

  SPEED_OR_NORMAL_SEEK: async ({
    state: { playerState }, dispatch, rootGetters,
  }, { cancelSignal, seekToMs }) => {
    // TODO: maybe separate functino for skip ahead probably lol
    // TODO: rewrite this entirely.
    // TODO: check the logic here to make sense if the seek time is in the past ...

    // TODO: make sure this doesnt happen when buffering
    const currentTimeMs = await dispatch('FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK');
    const difference = seekToMs - currentTimeMs;
    if (Math.abs(difference) <= rootGetters.GET_CONFIG.slplayer_speed_sync_max_diff
        && playerState === 'playing') {
      return dispatch('SPEED_SEEK', { cancelSignal, seekToMs });
    }

    return dispatch('NORMAL_SEEK', { cancelSignal, seekToMs });
  },

  START_PERIODIC_PLEX_TIMELINE_UPDATE: async ({ commit, dispatch, rootGetters }) => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();

    commit('SET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN', cancelToken);

    const main = CAF(function* plexTimelineUpdater(signal) {
      while (true) {
        yield CAF.delay(signal, rootGetters.GET_CONFIG.slplayer_plex_timeline_update_interval);

        try {
          yield dispatch('SEND_PLEX_TIMELINE_UPDATE', signal);
        } catch (e) {
          console.error(e);
        }
      }
    });

    try {
      await main(cancelToken.signal);
    } catch (e) {
      console.debug('PLEX_TIMELINE_UPDATER canceled');
    }
  },

  CHANGE_PLAYER_STATE: async ({ commit, dispatch }, state) => {
    console.debug('CHANGE_PLAYER_STATE', state);
    commit('SET_PLAYER_STATE', state);
    const plexTimelineUpdatePromise = dispatch('SEND_PLEX_TIMELINE_UPDATE');
    if (state !== 'stopped') {
      await dispatch('synclounge/PROCESS_PLAYER_STATE_UPDATE', null, { root: true });
    }

    await plexTimelineUpdatePromise;
  },

  LOAD_PLAYER_SRC: async ({ state: { offsetMs }, getters }) => {
    // TODO: potentailly unload if already loaded to avoid load interrupted errors
    // However, while its loading, potentially   reporting the old time...
    await unload();
    await load(getters.GET_SRC_URL);

    if (offsetMs > 0) {
      setCurrentTimeMs(offsetMs);
    }
  },

  CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE: ({ state: { plexTimelineUpdaterCancelToken }, commit }) => {
    if (plexTimelineUpdaterCancelToken) {
      plexTimelineUpdaterCancelToken.abort();
      commit('SET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN', null);
    }
  },

  PLAY_PAUSE_VIDEO: async ({ dispatch }) => {
    // TODO: probably move into player file
    if (!getDurationMs()) {
      // Can't play yet.  Ignore.
      return;
    }

    cancelTrickPlay();

    if (isPresentationPaused()) {
      await dispatch('PRESS_PLAY');
    } else {
      await dispatch('PRESS_PAUSE');
    }
  },

  PLAY_NEXT: async ({ dispatch, commit }) => {
    console.debug('slplayer/PLAY_NEXT');
    commit('plexclients/INCREMENT_ACTIVE_PLAY_QUEUE_SELECTED_ITEM_OFFSET', null, { root: true });
    await dispatch('PLAY_ACTIVE_PLAY_QUEUE_SELECTED_ITEM');
  },

  PLAY_PREVIOUS: async ({ dispatch, commit }) => {
    commit('plexclients/DECREMENT_ACTIVE_PLAY_QUEUE_SELECTED_ITEM_OFFSET', null, { root: true });
    await dispatch('PLAY_ACTIVE_PLAY_QUEUE_SELECTED_ITEM');
  },

  PLAY_ACTIVE_PLAY_QUEUE_SELECTED_ITEM: async ({ dispatch, commit, rootGetters }) => {
    await dispatch('CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE');
    await dispatch('SEND_PLEX_TIMELINE_UPDATE', {
      state: 'stopped',
      continuing: 1,
    });

    await dispatch('plexclients/UPDATE_STATE_FROM_ACTIVE_PLAY_QUEUE_SELECTED_ITEM', null,
      { root: true });
    // TODO: maybe plex indicates ongoing media index?
    commit('SET_MEDIA_INDEX', 0);
    commit('SET_OFFSET_MS',
      rootGetters['plexclients/GET_ACTIVE_PLAY_QUEUE_SELECTED_ITEM'].viewOffset || 0);
    commit('SET_MASK_PLAYER_STATE', true);
    await dispatch('synclounge/PROCESS_MEDIA_UPDATE', true, { root: true });

    await dispatch('CHANGE_PLAYER_SRC');

    // Purposefully not awaited
    dispatch('START_PERIODIC_PLEX_TIMELINE_UPDATE');

    await dispatch('plexclients/UPDATE_ACTIVE_PLAY_QUEUE', null, { root: true });
  },

  ...subtitleActions,
};
