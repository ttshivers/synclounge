import shaka from 'shaka-player/dist/shaka-player.ui.debug';

export default (store) => {
  class MinimizeButton extends shaka.ui.Element {
    constructor(parent, controls) {
      super(parent, controls);

      // The actual button that will be displayed
      this.button = document.createElement('button');
      this.button.classList.add('shaka-minimize-button');
      this.button.classList.add('shaka-slplayer-button');
      this.button.classList.add('material-icons-round');
      this.button.textContent = 'expand_more';
      this.parent.appendChild(this.button);

      // Listen for clicks on the button to start the next playback
      this.eventManager.listen(this.button, 'click', () => {
        store.commit('slplayer/SET_IS_PLAYER_EXPANDED', false);
      });
    }
  }

  const factory = {
    create: (rootElement, controls) => new MinimizeButton(rootElement, controls),
  };

  shaka.ui.Controls.registerElement('minimize', factory);
};
