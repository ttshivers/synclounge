<template>
  <v-hover
    #default="{ hover }"
    class="player-container"
  >
    <div :class="expandedClass">
      <TheVideoPlayer />
      <v-fade-transition v-if="!isPlayerExpanded">
        <v-overlay
          v-if="hover"
          absolute
        >
          <v-btn
            class="mini-size no-halo"
            block
            icon
            :ripple="false"
            @click="SET_IS_PLAYER_EXPANDED(true)"
          >
            <v-icon>expand_less</v-icon>
          </v-btn>
        </v-overlay>
      </v-fade-transition>
    </div>
  </v-hover>
</template>

<script>
import { mapMutations, mapState } from 'vuex';

export default {
  name: 'TheVideoPlayerContainer',

  components: {
    TheVideoPlayer: () => import('@/components/TheVideoPlayer.vue'),
  },

  computed: {
    ...mapState('slplayer', [
      'isPlayerExpanded',
    ]),

    expandedClass() {
      return this.isPlayerExpanded
        ? 'expanded'
        : 'mini';
    },
  },

  methods: {
    ...mapMutations('slplayer', [
      'SET_IS_PLAYER_EXPANDED',
    ]),
  },
};
</script>

<style scoped>
.no-halo::before {
  color: transparent;
}

.expanded {
  height: calc(100vh - 64px);
}

.mini-size {
  width: 142px;
  height: 80px;
}

.mini {
  position: absolute;
  width: 142px;
  height: 80px;
  left: 12px;
  bottom: 10px;
  z-index: 3;
}

.player-container {
  z-index: 4;
}
</style>
