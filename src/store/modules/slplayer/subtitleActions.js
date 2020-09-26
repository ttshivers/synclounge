export default {
  CHANGE_SUBTITLE_COLOR: async ({ commit, dispatch }, color) => {
    commit('SET_SUBTITLE_COLOR', color);
    await dispatch('RERENDER_SUBTITLE_CONTAINER');
  },

  CHANGE_SUBTITLE_POSITION: async ({ commit, dispatch }, position) => {
    commit('SET_SUBTITLE_POSITION', position);
    await dispatch('RERENDER_SUBTITLE_CONTAINER');
  },

  CHANGE_SUBTITLE_SIZE: async ({ commit, dispatch }, size) => {
    commit('SET_SUBTITLE_SIZE', size);
    await dispatch('PUBLISH_SUBTITLE_SIZE');
    await dispatch('RERENDER_SUBTITLE_CONTAINER');
  },

  CHANGE_SUBTITLE_OFFSET: async ({
    state: { subtitleOffset }, getters, rootGetters, commit, dispatch,
  }, offsetIncrement) => {
    console.debug('CHANGE_SUBTITLE_OFFSET', offsetIncrement);
    // TODO: send plex offset requets
    if (offsetIncrement === 0) {
      // Reset
      commit('SET_SUBTITLE_OFFSET', 0);
    } else {
      commit('SET_SUBTITLE_OFFSET', subtitleOffset + offsetIncrement);
    }

    // eslint-disable-next-line no-underscore-dangle
    // videoClock._autoClock.seeking();

    // TODO: give this a signal
    await dispatch('plexservers/UPDATE_STREAM', {
      machineIdentifier: rootGetters['plexclients/GET_ACTIVE_SERVER_ID'],
      id: getters.GET_SUBTITLE_STREAM.id,
      offset: subtitleOffset,
    }, { root: true });
  },
};
