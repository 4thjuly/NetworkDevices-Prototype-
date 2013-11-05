// App startup
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('window.html', {width: 500, height: 309});
});

chrome.runtime.onConnectExternal.addListener(function(port) {
    
    function onMsg(msg) {
        console.log('ome: ' + msg);
        nbtNameSearchForIP(msg.inputEntered.toUpperCase(), onNameSearchCompleted);
    }
    
    function onNameSearchCompleted(targetIP) {
        console.log('onsc: ' + targetIP);
        port.postMessage({ip: targetIP});
    }
    
    port.onMessage.addListener(onMsg);
});
