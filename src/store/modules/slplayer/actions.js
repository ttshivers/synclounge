import CAF from 'caf';

import { queryFetch } from '@/utils/fetchutils';
import {
  play, pause, getDurationMs, getCurrentTimeMs, isTimeInBufferedRange, isPresentationPaused,
  waitForMediaElementEvent, cancelTrickPlay, setPlaybackRate, getPlaybackRate,
  setCurrentTimeMs, getVideoOptional,
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

  CHANGE_MAX_VIDEO_BITRATE: async ({ commit, dispatch }, bitrate) => {
    commit('settings/SET_SLPLAYERQUALITY', bitrate, { root: true });
    await dispatch('RELOAD_METADATA');
  },

  CHANGE_AUDIO_STREAM: async ({ getters, dispatch }, audioStreamID) => {
    await queryFetch(getters.GET_PART_URL, {
      audioStreamID,
      ...getters.GET_PART_PARAMS,
    }, { method: 'PUT' });

    await dispatch('RELOAD_METADATA');
  },

  CHANGE_SUBTITLE_STREAM: async ({ getters, dispatch }, subtitleStreamID) => {
    await queryFetch(getters.GET_PART_URL, {
      subtitleStreamID,
      ...getters.GET_PART_PARAMS,
    }, { method: 'PUT' });

    await dispatch('RELOAD_METADATA');
  },

  CHANGE_MEDIA_INDEX: async ({ commit, dispatch }, index) => {
    commit('SET_MEDIA_INDEX', index);
    await dispatch('RELOAD_METADATA');
  },

  // Changes the player src to the new one and restores the time afterwards
  RELOAD_METADATA: async ({ commit, dispatch }) => {
    commit('SET_OFFSET_MS', await dispatch('FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK'));
    await dispatch('plexclients/RELOAD_ACTIVE_MEDIA_METADATA', null, { root: true });
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

    // Purposefully not awaited
    dispatch('START_PERIODIC_PLEX_TIMELINE_UPDATE');

    await dispatch('plexclients/UPDATE_ACTIVE_PLAY_QUEUE', null, { root: true });
  },

  ...subtitleActions,
};
