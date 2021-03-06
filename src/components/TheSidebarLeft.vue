<template>
  <v-navigation-drawer
    app
    temporary
    :value="isLeftSidebarOpen"
    disable-route-watcher
    @input="SET_LEFT_SIDEBAR_OPEN"
  >
    <v-list-item v-if="GET_PLEX_USER">
      <v-list-item-avatar>
        <v-img
          :src="GET_PLEX_USER.thumb"
        />
      </v-list-item-avatar>

      <v-list-item-content>
        <v-list-item-title style="font-weight: bold;">
          {{ GET_PLEX_USER.username }}
        </v-list-item-title>
      </v-list-item-content>
    </v-list-item>
    <v-divider />

    <v-list
      dense
      nav
    >
      <TheSettingsDialog v-slot="{ on, attrs }">
        <v-list-item
          v-bind="attrs"
          v-on="on"
        >
          <v-list-item-icon>
            <v-icon>settings</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <v-list-item-title>Settings</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </TheSettingsDialog>

      <v-list-item
        :router="true"
        :to="{name: 'SignOut'}"
      >
        <v-list-item-icon>
          <v-icon>cancel</v-icon>
        </v-list-item-icon>

        <v-list-item-content>
          <v-list-item-title>Sign out</v-list-item-title>
        </v-list-item-content>
      </v-list-item>

      <v-subheader>About</v-subheader>

      <v-list-item
        :href="GET_RELEASE_URL"
        target="_blank"
      >
        <v-list-item-icon>
          <v-icon>info</v-icon>
        </v-list-item-icon>

        <v-list-item-content>
          <v-list-item-title>v{{ GET_VERSION }}</v-list-item-title>
        </v-list-item-content>
      </v-list-item>

      <v-list-item
        :href="GET_DISCORD_URL"
        target="_blank"
      >
        <v-list-item-icon>
          <v-icon>chat</v-icon>
        </v-list-item-icon>

        <v-list-item-content>
          <v-list-item-title>Discord</v-list-item-title>
        </v-list-item-content>
      </v-list-item>

      <v-list-item
        :href="GET_REPOSITORY_URL"
        target="_blank"
      >
        <v-list-item-icon>
          <v-icon>code</v-icon>
        </v-list-item-icon>

        <v-list-item-content>
          <v-list-item-title>GitHub</v-list-item-title>
        </v-list-item-content>
      </v-list-item>

      <DonateDialog v-slot="{ on, attrs }">
        <v-list-item
          v-bind="attrs"
          v-on="on"
        >
          <v-list-item-icon>
            <v-icon>favorite</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <v-list-item-title>Donate</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </DonateDialog>
    </v-list>

    <template #append>
      <v-divider />
      <div
        class="text-center pa-2"
        style="opacity: 0.7; font-size: 12px;"
      >
        <div>
          Build <a
            class="text-decoration-none"
            :href="GET_COMMIT_URL"
          >
            #{{ GET_GIT_HASH.substring(0, 7) }}
          </a>
        </div>
        <div>Last updated {{ updatedAt }}</div>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script>
import { mapGetters, mapMutations, mapState } from 'vuex';
import { formatDistanceToNow } from 'date-fns';

export default {
  name: 'TheSidebarLeft',

  components: {
    TheSettingsDialog: () => import('@/components/TheSettingsDialog.vue'),
    DonateDialog: () => import('@/components/DonateDialog.vue'),
  },

  computed: {
    ...mapState(['isLeftSidebarOpen']),

    ...mapGetters([
      'GET_REPOSITORY_URL',
      'GET_VERSION',
      'GET_GIT_HASH',
      'GET_DISCORD_URL',
      'GET_RELEASE_URL',
      'GET_COMMIT_URL',
    ]),

    ...mapGetters('plex', [
      'GET_PLEX_USER',
    ]),

    date() {
      return new Date(parseInt(process.env.VUE_APP_GIT_DATE, 10) * 1000);
    },

    updatedAt() {
      return `${formatDistanceToNow(this.date)} ago`;
    },
  },

  methods: {
    ...mapMutations([
      'SET_LEFT_SIDEBAR_OPEN',
    ]),

    getTimeFromMs(ms) {
      const hours = ms / (1000 * 60 * 60);
      const absoluteHours = Math.floor(hours);
      const h = absoluteHours > 9 ? absoluteHours : `0${absoluteHours}`;
      const minutes = (hours - absoluteHours) * 60;
      const absoluteMinutes = Math.floor(minutes);
      const m = absoluteMinutes > 9 ? absoluteMinutes : `0${absoluteMinutes}`;
      const seconds = (minutes - absoluteMinutes) * 60;
      const absoluteSeconds = Math.floor(seconds);
      const s = absoluteSeconds > 9 ? absoluteSeconds : `0${absoluteSeconds}`;
      return `${h}:${m}:${s}`;
    },
  },
};
</script>
