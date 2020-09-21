import { v4 as uuidv4 } from 'uuid';
import { subtitlePositions, subtitleSizes, subtitleColors } from '@/utils/subtitleutils';

const state = () => ({
  session: null,
  xplexsessionId: uuidv4(),
  plexDecision: null,
  mediaIndex: 0,
  offsetMs: 0,
  playerState: 'stopped',
  plexTimelineUpdaterCancelToken: null,
  playerDestroyCancelToken: null,
  isPlayerInitialized: false,

  // This is used to signal whether to mask the player state (time, etc) when sending updates
  // before the media is loaded
  maskPlayerState: false,
  isInPictureInPicture: false,

  subtitleSize: subtitleSizes.Normal,
  subtitlePosition: subtitlePositions.Bottom,
  subtitleColor: subtitleColors.White,
  streamingProtocol: 'dash',
  forceTranscodeRetry: false,

  showPlayer: false,
  isPlayerExpanded: true,
});

export default state;
