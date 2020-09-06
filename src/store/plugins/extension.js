const extensionId = 'fdjamakpfbbddfjaooikfcpapjohcfmg';

const extensionStateWatcher = () => {
  if (window.chrome?.runtime?.connect) {
    // window.chrome.runtime.sendMessage(extensionId, null, (response) => {
    //   if (window.chrome.runtime.lastError) {
    //     console.log('got this', window.chrome.runtime.lastError);
    //   } else {

    //   }
    //   console.log(response);
    // });

    const port = window.chrome.runtime.connect(extensionId, {
      name: 'Synclounge',
    });

    port.onDisconnect.addListener((e) => {
      if (window.chrome.runtime.lastError) {
        console.log('Error connecting to extension:', window.chrome.runtime.lastError.message);
      } else {
        console.log(e);
      }
    });

    port.onMessage.addListener((msg) => {
      if (msg.joke === 'Knock knock') {
        port.postMessage({ question: "Who's there?" });
      } else if (msg.answer === 'Madame') {
        port.postMessage({ question: 'Madame who?' });
      } else if (msg.answer === 'Madame... Bovary') {
        port.postMessage({ question: "I don't get it." });
      }
    });
  }
};

export default extensionStateWatcher;
