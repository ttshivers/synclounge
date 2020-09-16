<template>
  <div
    class="contain"
  >
    <div
      ref="videoPlayerContainer"
      v-resize="RERENDER_SUBTITLE_CONTAINER"
      class="slplayer contain"
      @click="onPlayerClick"
    >
      <video
        ref="videoPlayer"
        autoplay
        preload="auto"
        playsinline="true"
        class="black contain"

        @pause="onPause"
        @ended="onEnded"
        @playing="onPlaying"
        @seeking="onSeeking"
        @seeked="onSeeked"
        @volumechange="onVolumeChange"
        @enterpictureinpicture="onPipChange"
        @leavepictureinpicture="onPipChange"
        @timeupdate="handleTimeUpdate"
      />

      <v-btn
        v-if="AM_I_HOST && isInIntro"
        absolute
        bottom
        right
        large
        class="skip-intro"
        :class="arePlayControlsShown ? 'above-controls' : null"
        :style="skipIntroButtonStyle"
        @click="SKIP_INTRO"
      >
        Skip Intro
      </v-btn>
    </div>
  </div>
</template>

<script>
import {
  mapActions, mapGetters, mapMutations, mapState,
} from 'vuex';
import muxjs from 'mux.js';
import shaka from 'shaka-player/dist/shaka-player.ui.debug';
import CAF from 'caf';
import playerUiPlugins from '@/player/ui';

import { setOverlay, getOverlay } from '@/player/state';
import {
  getPlayer, getControlsOffset, setVolume, getSmallPlayButton, getBigPlayButton, areControlsShown,
  isPresentationPaused, getVolume, isBuffering, isPlaying, isPaused, destroy, setCurrentTimeMs,
} from '@/player';

import 'shaka-player/dist/controls.css';
import 'synclounge-libjass/lib/libjass.css';

window.muxjs = muxjs;
shaka.log.setLevel(shaka.log.Level.ERROR);
shaka.polyfill.installAll();

export default {
  name: 'TheVideoPlayer',

  data: () => ({
    playerControlsShownInterval: null,
    arePlayControlsShown: false,
    videoTimeStamp: 0,
  }),

  computed: {
    ...mapGetters('slplayer', [
      'IS_USING_NATIVE_SUBTITLES',
    ]),

    ...mapGetters('synclounge', [
      'AM_I_HOST',
    ]),

    ...mapGetters('plexclients', [
      'GET_ACTIVE_MEDIA_METADATA',
      'GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER',
    ]),

    ...mapGetters('settings', [
      'GET_AUTO_SKIP_INTRO',
      'GET_SLPLAYERVOLUME',
    ]),

    ...mapGetters([
      'GET_CONFIG',
    ]),

    ...mapState('slplayer', [
      'playerState',
      'playerDestroyCancelToken',
      'isPlayerExpanded',
    ]),

    playerConfig() {
      return {
        streaming: {
          bufferingGoal: this.GET_CONFIG.slplayer_buffering_goal,
          jumpLargeGaps: true,
        },
      };
    },

    skipIntroButtonStyle() {
      return this.playerControlsShownInterval
        ? {
          'margin-bottom': `${getControlsOffset(this.$refs?.videoPlayerContainer?.offsetHeight)}px`,
        }
        : {};
    },

    isInIntro() {
      return this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER
        && this.videoTimeStamp >= this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER.startTimeOffset
        && this.videoTimeStamp < this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER.endTimeOffset;
    },
  },

  watch: {
    playerState: {
      async handler() {
        console.debug('playState', this.playerState);
        const plexTimelineUpdatePromise = this.SEND_PLEX_TIMELINE_UPDATE();
        if (this.playerState === 'stopped') {
          this.SET_FORCE_TRANSCODE_RETRY(false);
          this.CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE();
          this.SET_ACTIVE_MEDIA_METADATA(null);
          this.SET_ACTIVE_SERVER_ID(null);
          await getPlayer().unload();
        } else {
          await this.PROCESS_PLAYER_STATE_UPDATE();
        }

        await plexTimelineUpdatePromise;
      },
    },

    GET_ACTIVE_MEDIA_METADATA: {
      async handler(newMetadata) {
        // This handles regular plex clients (nonslplayer) playback changes
        if (newMetadata) {
          await this.SET_MEDIA_AS_BACKGROUND(newMetadata);
        }
      },
      immediate: true,
    },

    playerControlsShownInterval() {
      return this.RERENDER_SUBTITLE_CONTAINER();
    },

    isInIntro: {
      handler() {
        return this.checkAutoSkipIntro();
      },
    },

    GET_AUTO_SKIP_INTRO: {
      handler() {
        console.log('watcher');
        return this.checkAutoSkipIntro();
      },
    },

    isPlayerExpanded: {
      handler(isPlayerExpanded) {
        getOverlay().setEnabled(isPlayerExpanded);
      },
    },
  },

  created() {
    playerUiPlugins(this.$store);
  },

  async mounted() {
    console.log('mounted');
    // TODO: monitor upnext stuff interval probably or idk state change timeugh
    const player = new shaka.Player(this.$refs.videoPlayer);
    player.configure(this.playerConfig);

    const overlay = new shaka.ui.Overlay(
      player,
      this.$refs.videoPlayerContainer,
      this.$refs.videoPlayer,
    );

    overlay.configure(this.getPlayerUiOptions());
    setOverlay(overlay);
    getOverlay().setEnabled(this.isPlayerExpanded);

    setVolume(this.GET_SLPLAYERVOLUME);
    this.addPlayerEventListeners();
    this.startPlayerControlsShownInterval();
    // eslint-disable-next-line new-cap
    this.SET_PLAYER_DESTROY_CANCEL_TOKEN(new CAF.cancelToken());
    this.SET_IS_PLAYER_INITIALIZED(true);

    try {
      this.CHANGE_PLAYER_SRC();

      // Purposefully not awaited
      this.START_PERIODIC_PLEX_TIMELINE_UPDATE();
    } catch (e) {
      // TODO: stuff
      console.error(e);
    }
  },

  async beforeDestroy() {
    this.removePlayerEventListeners();
    this.stopPlayerControlsShownInterval();
    this.SET_IS_IN_PICTURE_IN_PICTURE(false);
    this.DESTROY_PLAYER_STATE();

    this.playerDestroyCancelToken.abort();
    this.SET_PLAYER_DESTROY_CANCEL_TOKEN(null);
    this.SET_FORCE_TRANSCODE_RETRY(false);
    this.CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE();
    this.SET_ACTIVE_MEDIA_METADATA(null);
    this.SET_ACTIVE_SERVER_ID(null);
    this.SET_IS_PLAYER_INITIALIZED(false);

    this.SET_OFFSET_MS(0);
    this.SET_SUBTITLE_OFFSET(0);

    await Promise.all([
      this.DESTROY_SUBTITLES(),
      destroy(),
      this.PROCESS_MEDIA_UPDATE(),
    ]);
  },

  methods: {
    ...mapActions('plexservers', [
      'SET_MEDIA_AS_BACKGROUND',
    ]),

    ...mapActions('slplayer', [
      'CHANGE_MEDIA_INDEX',
      'CHANGE_PLAYER_SRC',

      'PRESS_STOP',
      'DESTROY_PLAYER_STATE',
      'PLAY_PAUSE_VIDEO',
      'SEND_PARTY_PLAY_PAUSE',
      'SKIP_INTRO',
      'RERENDER_SUBTITLE_CONTAINER',
      'PROCESS_STATE_UPDATE_ON_PLAYER_EVENT',
      'UPDATE_PLAYER_SRC_AND_KEEP_TIME',
      'CHANGE_SUBTITLES',
      'DESTROY_ASS',
      'SEND_PLEX_TIMELINE_UPDATE',
      'START_PERIODIC_PLEX_TIMELINE_UPDATE',
      'CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE',
      'DESTROY_SUBTITLES',
    ]),

    ...mapActions('synclounge', [
      'MANUAL_SYNC',
      'sendPartyPause',
      'PROCESS_PLAYER_STATE_UPDATE',
      'PROCESS_MEDIA_UPDATE',
    ]),

    ...mapActions([
      'DISPLAY_NOTIFICATION',
    ]),

    ...mapMutations('settings', [
      'SET_SLPLAYERVOLUME',
    ]),

    ...mapMutations('plexclients', [
      'SET_ACTIVE_MEDIA_METADATA',
      'SET_ACTIVE_SERVER_ID',
    ]),

    ...mapMutations('slplayer', [
      'SET_IS_IN_PICTURE_IN_PICTURE',
      'SET_PLAYER_STATE',
      'SET_PLAYER_DESTROY_CANCEL_TOKEN',
      'SET_IS_PLAYER_INITIALIZED',
      'SET_FORCE_TRANSCODE_RETRY',
      'SET_OFFSET_MS',
      'SET_SUBTITLE_OFFSET',
    ]),

    addPlayerEventListeners() {
      getPlayer().addEventListener('error', this.onError);
      getPlayer().addEventListener('buffering', this.onBuffering);
      getSmallPlayButton().addEventListener('click', this.onPlayerClick);
      getBigPlayButton().addEventListener('click', this.onPlayerClick);
      window.addEventListener('keyup', this.onKeyUp);
    },

    removePlayerEventListeners() {
      window.removeEventListener('keyup', this.onKeyUp);
      getSmallPlayButton().removeEventListener('click', this.onPlayerClick);
      getBigPlayButton().removeEventListener('click', this.onPlayerClick);
      getPlayer().removeEventListener('buffering', this.onBuffering);
      getPlayer().removeEventListener('error', this.onError);
    },

    getCastReceiverId() {
      return window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || '';
    },

    // This is an action so it's not cached because chromecast stuff loads late
    getPlayerUiOptions() {
      return {
        addBigPlayButton: true,
        controlPanelElements: [
          'mute',
          'volume',
          'time_and_duration',

          'spacer',

          'previous',
          'replay10',
          'play_pause',
          'forward30',
          'next',
          'close',
          'manual_sync',

          'spacer',

          'overflow_menu',
          'minimize',
          'fullscreen',
        ],

        overflowMenuButtons: [
          'media',
          'bitrate',
          'audio',

          'subtitle',
          'subtitleoffset',
          'subtitlesize',
          'subtitleposition',
          'subtitlecolor',

          'cast',
          'picture_in_picture',
        ],

        castReceiverAppId: this.getCastReceiverId(),
      };
    },

    async onKeyUp(event) {
      const { activeElement } = document;
      const isSeekBar = activeElement && activeElement.classList
        && activeElement.classList.contains('shaka-seek-bar');

      if (event.key === ' ' && activeElement.tagName !== 'INPUT'
        && activeElement.tagName !== 'BUTTON') {
        if (!isSeekBar) {
          // Make spacebar trigger play/pause in locations shaka normally doesn't
          await this.PLAY_PAUSE_VIDEO();
        }

        await this.SEND_PARTY_PLAY_PAUSE();
      }
    },

    handleTimeUpdate() {
      this.videoTimeStamp = this.$refs?.videoPlayer?.currentTime * 1000;
    },

    async checkAutoSkipIntro() {
      if (this.isInIntro && this.GET_AUTO_SKIP_INTRO) {
        await this.SKIP_INTRO();
      }
    },

    startPlayerControlsShownInterval() {
      this.playerControlsShownInterval = setInterval(() => {
        this.arePlayControlsShown = areControlsShown();
      }, this.GET_CONFIG.slplayer_controls_visible_checker_interval);
    },

    stopPlayerControlsShownInterval() {
      if (this.playerControlsShownInterval != null) {
        clearInterval(this.playerControlsShownInterval);
        this.playerControlsShownInterval = null;
      }
    },

    onVolumeChange() {
      this.SET_SLPLAYERVOLUME(getVolume());
    },

    async onPlayerClick(e) {
      if (!e.target.classList.contains('shaka-close-button')) {
        // If the player was actually paused (and not just paused for seeking)
        await this.sendPartyPause(isPresentationPaused());
      }
    },

    onPlaying() {
      if (isPlaying()) {
        this.SET_PLAYER_STATE('playing');
      }
    },

    async onPause() {
      if (isBuffering()) {
        // If we are buffering, then we don't need to actually change the state, but we should send
        // out a new state update to synclounge since we have seeked

        // Wait for seeking since time isn't updated until we get that event
        this.PROCESS_STATE_UPDATE_ON_PLAYER_EVENT({
          type: 'seeking',
          signal: this.playerDestroyCancelToken.signal,
        });
        await this.PROCESS_PLAYER_STATE_UPDATE();
      } else if (isPresentationPaused()) {
        this.SET_PLAYER_STATE('paused');
      }
    },

    async onSeeking() {
      console.debug('onSeeking');
      await this.DESTROY_ASS();
    },

    async onSeeked() {
      console.debug('onSeeked');
      // TODO: only change if streaming subs
      await this.CHANGE_SUBTITLES();
    },

    onBuffering({ buffering }) {
      if (buffering) {
        this.SET_PLAYER_STATE('buffering');
      } else {
      // Report back if player is playing
        this.SET_PLAYER_STATE(isPaused() ? 'paused' : 'playing');
      }
    },

    async onEnded() {
      console.debug('onEnded');
      // TODO: ...
      this.SET_PLAYER_STATE('stopped');
    },

    async onPipChange() {
      const isPip = !!document.pictureInPictureElement;
      this.SET_IS_IN_PICTURE_IN_PICTURE(isPip);

      if (isPip && this.IS_USING_NATIVE_SUBTITLES) {
      // If we are in picture and picture, we must burn subtitles
      // Redo src
        await this.UPDATE_PLAYER_SRC_AND_KEEP_TIME();
      }
    },

    async onError(e) {
      console.error(e);
      // Restart source
      await this.UPDATE_PLAYER_SRC_AND_KEEP_TIME();
    },

    async skipIntro() {
      const { endTimeOffset } = this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER;

      console.debug('skipIntro', endTimeOffset);
      await this.DISPLAY_NOTIFICATION({
        text: 'Skipping intro',
        color: 'info',
      });

      this.SET_OFFSET_MS(endTimeOffset);
      setCurrentTimeMs(endTimeOffset);
    },
  },
};
</script>

<style scoped>
  .contain {
    width: 100%;
    height: 100%;
  }

  @media screen and (max-width: 1264px) {
    div.slplayer {
      height: calc(0.5625 * 100vw);
    }
  }

  .hoverBar {
    position: absolute;
    background:
      -webkit-gradient(
        linear,
        left top,
        left bottom,
        from(rgba(0, 0, 0, 0.8)),
        color-stop(60%, rgba(0, 0, 0, 0.35)),
        to(transparent)
      );
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0, rgba(0, 0, 0, 0.35) 60%, transparent);
    top: 0;
    left: 0;
    width: 100%;
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.25s ease-out;
  }

  .fade-enter,
  .fade-leave-to {
    opacity: 0;
  }

  .plex-thumb {
    height: 80px;
    width: auto;
    vertical-align: middle;
    margin-left: auto;
    margin-right: auto;
  }

  .skip-intro {
    transition-timing-function: cubic-bezier(0.55, 0.06, 0.68, 0.19);
    transition-duration: 250ms;
    transition-property: margin;
    z-index: 2;
  }

  .skip-intro.above-controls {
    transition-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
  }
</style>

<style>
  .messages-wrapper {
    max-height: calc(100vh - (0.5625 * 100vw) - 150px);
    overflow: scroll;
  }

  .is-fullscreen .messages-wrapper {
    height: calc(100vh - (0.5625 * 100vw));
  }

  /* Having to put shaka styling here since scoped rules don't seem to apply to them
    likely because its added dynamically */

  .shaka-slplayer-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .shaka-play-button {
    padding: 50px !important;
  }

  .shaka-spinner {
    padding: 57px !important;
  }

  .libjass-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
</style>
