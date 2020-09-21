<template>
  <div
    ref="subtitlesContainer"
    v-resize="onResize"
  />
</template>

<script>
import { mapGetters, mapState } from 'vuex';
import libjass from 'synclounge-libjass';

import { makeUrl } from '@/utils/fetchutils';
import { getBestOutlineColor } from '@/utils/subtitleutils';
import resiliantStreamFactory from '@/utils/streams';
import VideoClock from '@/utils/videoclock';
import {
  isPaused, getPlaybackRate, getCurrentTimeMs, getDimensions, getControlsOffset,
  getCurrentTime, getVideo,
} from '@/player';

import 'synclounge-libjass/lib/libjass.css';

const subtitleSettings = {
  preciseOutlines: true,
};

export default {
  name: 'TheVideoPlayerSubtitles',

  data: () => ({
    abortController: null,
    subtitleRenderer: null,
    videoClock: null,
    originalSubtitleResolutionCache: null,
  }),

  computed: {
    ...mapGetters('slplayer', [
      'GET_DECISION_AND_START_PARAMS',
      'GET_PLEX_SERVER_URL',
      'CAN_DIRECT_PLAY_SUBTITLES',
      'GET_SUBTITLE_STREAM',
      'GET_SELECTED_SUBTITLE_STREAM',
    ]),

    ...mapState('slplayer', [
      'subtitleOffset',
      'subtitleSize',
      'subtitlePosition',
      'subtitleColor',
    ]),

    subtitleBaseUrl() {
      return this.CAN_DIRECT_PLAY_SUBTITLES
        ? `${this.GET_PLEX_SERVER_URL}${this.GET_SUBTITLE_STREAM.key}`
        : `${this.GET_PLEX_SERVER_URL}/video/:/transcode/universal/subtitles`;
    },

    subtitleUrl() {
      return makeUrl(
        this.subtitleBaseUrl,
        this.GET_DECISION_AND_START_PARAMS,
      );
    },

    shouldUseSrtParser() {
      return this.CAN_DIRECT_PLAY_SUBTITLES
        && (this.GET_SUBTITLE_STREAM.codec === 'srt'
          || this.GET_SELECTED_SUBTITLE_STREAM.codec === 'srt');
    },
  },

  async mounted() {
    await this.initializeSubtitles();
  },

  beforeDestroy() {
    this.clearVideoClockListeners();
    this.abortRequests();
  },

  methods: {
    abortRequests() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    },

    clearVideoClockListeners() {
      if (this.videoClock) {
        // eslint-disable-next-line no-underscore-dangle
        this.videoClock._autoClock._manualClock._eventListeners.clear();
      }
    },

    makeAss(signal) {
      const stream = resiliantStreamFactory(
        this.subtitleUrl,
        signal,
      );

      if (this.shouldUseSrtParser) {
        return (new libjass.parser.SrtStreamParser(stream)).ass;
      }

      return (new libjass.parser.StreamParser(stream)).minimalASS;
    },

    synchronizeSubtitleClock() {
      if (isPaused() && !this.videoClock.paused) {
        // eslint-disable-next-line no-underscore-dangle
        this.videoClock._autoClock.pause();
      } else if (!isPaused() && this.videoClock.paused) {
        // eslint-disable-next-line no-underscore-dangle
        this.videoClock._autoClock.play();
      }

      if (getPlaybackRate() && !this.videoClock.rate) {
        // eslint-disable-next-line no-underscore-dangle
        this.videoClock._autoClock.setRate(getPlaybackRate());
      }

      if (getCurrentTimeMs() && !this.videoClock.currentTime) {
        // eslint-disable-next-line no-underscore-dangle
        this.videoClock._autoClock.seeking();
      }
    },

    initializeVideoClock() {
      this.videoClock = new VideoClock(
        getVideo(),
        // TODO: maybe make even more custom clock with reactive offset
        new libjass.renderers.AutoClock(() => Math.max(getCurrentTime()
          + (this.subtitleOffset / 1000), 0), 100),

      );

      this.synchronizeSubtitleClock();
    },

    async initSubtitleRenderer(ass) {
      libjass.configure({
        debugMode: true,
        verboseMode: false,
      });

      this.subtitleRenderer = new libjass.renderers.WebRenderer(
        ass,
        this.videoClock,
        this.$refs.subtitlesContainer,
        subtitleSettings,
      );
    },

    cacheOriginalSubtitleResolution() {
      if (!this.originalSubtitleResolutionCache) {
        // TODO: maybe reactive or vue.set
        this.originalSubtitleResolutionCache = {
          x: this.subtitleRenderer.ass.properties.resolutionX,
          y: this.subtitleRenderer.ass.properties.resolutionY,
        };
      }
    },

    publishSubtitleSize() {
      this.cacheOriginalSubtitleResolution();

      const assProperties = this.subtitleRenderer.ass.properties;

      assProperties.resolutionX = this.originalSubtitleResolutionCache.x / this.subtitleSize;
      assProperties.resolutionY = this.originalSubtitleResolutionCache.y / this.subtitleSize;
    },

    hexToLibjassColor(hex) {
      const aRgbHex = hex.match(/.{1,2}/g);

      return new libjass.parts.Color(
        parseInt(aRgbHex[0], 16),
        parseInt(aRgbHex[1], 16),
        parseInt(aRgbHex[2], 16),
        1,
      );
    },

    publishSubtitleColor() {
      console.debug('PUBLISH_SUBTITLE_COLOR');

      const defaultStyle = this.subtitleRenderer.ass.styles.get('Default');
      // eslint-disable-next-line no-underscore-dangle
      defaultStyle._primaryColor = this.hexToLibjassColor(this.subtitleColor);

      // eslint-disable-next-line no-underscore-dangle
      defaultStyle._outlineColor = this.hexToLibjassColor(
      // eslint-disable-next-line no-underscore-dangle
        getBestOutlineColor(defaultStyle._primaryColor),
      );
    },

    publishSubtitlePosition() {
      console.debug('PUBLISH_SUBTITLE_POSITION');
      // eslint-disable-next-line no-underscore-dangle
      this.subtitleRenderer.ass.styles.get('Default')._alignment = this.subtitlePosition;
    },

    rerenderSubtitles() {
    // Handle letterboxing around the video. If the width or height are greater than the video can
    // be, then consider that dead space.
      const bottomOffset = getControlsOffset();
      // console.debug('RERENDER_SUBTITLE_CONTAINER', bottomOffset);

      const {
        videoWidth, videoHeight, offsetWidth, offsetHeight,
      } = getDimensions();

      if (Number.isNaN(videoWidth)) {
        return;
      }

      const ratio = Math.min(offsetWidth / videoWidth, (offsetHeight - bottomOffset) / videoHeight);
      const subsWrapperWidth = videoWidth * ratio;
      const subsWrapperHeight = videoHeight * ratio;
      const subsWrapperLeft = (offsetWidth - subsWrapperWidth) / 2;
      const subsWrapperTop = ((offsetHeight - bottomOffset) - subsWrapperHeight) / 2;

      this.publishSubtitleColor();
      this.publishSubtitlePosition();
      this.subtitleRenderer.resize(subsWrapperWidth, subsWrapperHeight, subsWrapperLeft,
        subsWrapperTop);
      console.debug('RERENDER_SUBTITLE_CONTAINER', subsWrapperWidth, subsWrapperHeight,
        subsWrapperLeft, subsWrapperTop);
    },

    async initializeSubtitlesCriticalSection(signal) {
      const ass = await this.makeAss(signal);
      this.initializeVideoClock();
      this.initSubtitleRenderer(ass);

      this.publishSubtitleSize();
      this.rerenderSubtitles();
    },

    async initializeSubtitles() {
      // TODO: this may not be needed
      // await this.DESTROY_ASS();

      const controller = new AbortController();
      this.abortController = controller;

      try {
        await this.initializeSubtitlesCriticalSection(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          throw e;
        }
      }
    },

    async changeSubtitles() {
      if (this.IS_USING_NATIVE_SUBTITLES) {
        await this.setSubtitleUrl();
      } else {
        // TODO: this may not be needed. check pls
        await this.DESTROY_ASS();
      }
    },

    onResize() {
      if (this.subtitleRenderer) {
        // If stuff has been initialized
        this.rerenderSubtitles();
      }
    },
  },
};
</script>

<style scoped>
.libjass-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
