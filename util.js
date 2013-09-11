
function Device(location, ip, endpointReference, manufacturer, model, friendlyName, presentationUrl) {
    this.location = location; // Unique reference to a thing on the local network, something that can provide metadata
    this.manufacturer = manufacturer;
    this.model = model;
    this.friendlyName = friendlyName;
    this.ip = ip;
    this.presentationUrl = presentationUrl; // Settings or info page
    this.endpointReference = endpointReference; // Reference to the metadata
}

function getXmlDataForTag(xml, tagName) {
    var elements = xml.getElementsByTagName(tagName);
    if (elements && elements.length > 0) {
        var childNodes = elements[0].childNodes;
        if (childNodes && childNodes.length > 0) {
            return childNodes[0].data;
        }
    }
}

function createNewUuid() {
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    return uuid;
}

function createMulticastSocket(ip, port, ttl, callback) {
    chrome.socket.create("udp", function (socket) {
        var socketId = socket.socketId;
        chrome.socket.setMulticastTimeToLive(socketId, ttl, function (result) {
            if (result != 0) {
                console.log("cms.smttl: " + result);
            }
            chrome.socket.bind(socketId, "0.0.0.0", port, function (result) {
                console.log("cms.bind: " + result);
                if (result == 0) {
                       chrome.socket.joinGroup(socketId, ip, function (result) {
                        if (result != 0) {
                            console.log("cms.joinGroup: " + result);
                        } else {
                            console.log("cms: " + socketId)
                            callback(socket);
                        }
                    });             
                }
            });
        });
    });
};

function fullyQualifyUrl(domain, url) {
    var uri = new Uri(url);
    // If the url is fully qualified then there's nothing to do
    if (uri.protocol().toLowerCase() == 'http') {
        return url;
    } else {
        // set the protocol
        uri.protocol('http');
        // If it's relative, get the base of the domain and prepend it
        if (!uri.host()) {
            var domainUri = new Uri(domain);
            uri.host(domainUri.host());
        }
        return uri.toString();
    }
}
