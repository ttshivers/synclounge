<template>
  <v-footer
    height="100"
    class="pa-0"
    fixed
  >
    <v-card
      class="flex"
      flat
      tile
    >
      <v-container
        fluid
        class="py-0"
      >
        <v-row>
          <v-col
            cols="auto"
            class="py-0"
          >
            <div
              class="player-placeholder"
            />
          </v-col>

          <v-col class="py-0">
            Metadata here
          </v-col>
        </v-row>
      </v-container>
    </v-card>
  </v-footer>
</template>

<script>
export default {
  name: 'TheVideoPlayerFooter',
};
</script>

<style scoped>
.player-placeholder {
  width: 142px;
  height: 80px;
  background-color: rgba(0, 0, 0, 0.75);
  transition: opacity 0.2s;
  opacity: 1;
  z-index: 5;
}

.hover {
  opacity: 0;
}
</style>
