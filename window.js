// TODO
// - Some packets get dropped on ChromeOS due to the firewall. Not sure how to fix.
// - Remove duplicates (same or null presentation url, same friendly name and IP)
// - Add mDNS support (printers, computers etc)

document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM Content Loaded");  
});

function ListController($scope) {
    $scope.deviceList = [ ];
	var presentationUrls = { }; // To help with de-duping 
	
    $scope.refresh = function() {
        console.log("Refresh");
		// Disable refresh button for a second to make it obvious something is happening
		var refreshBtn = document.getElementById('refreshBtn');
		refreshBtn.disabled = true;
		setTimeout(function(){refreshBtn.disabled = false; }, 1000);
		// Clear the old list, look for new stuff
        $scope.deviceList = [ ];
		presentationUrls = { };
		searchForDevices(onDeviceFound);
	};
    
	// Specifically, seach for anything that has a 'friendly name', ideally a web page we can nav to
	// This, for example, will skip lots of misc mdns services
	function searchForDevices(onDeviceFound) {
        ssdpSearch(onDeviceFound);
        wsdSearch(onDeviceFound);
        mdnsSearch(onDeviceFound);
	}
	
    function onDeviceFound(foundDevice) {
        $scope.$apply(function() {
            var deviceList = $scope.deviceList;
			
			// Hide things without presentation urls (might make this a setting)
//			if (!foundDevice.presentationUrl) { 
//				console.log('odf: Ignoring hidden device: ' + foundDevice.friendlyName);
//				return; 
//			}
				
			// Skip devices with the same presentation url (merge the details)
			var prevDevice = presentationUrls[foundDevice.presentationUrl]; 
			if (prevDevice) {
				// HACK: Pick the longest friendly name
				if (foundDevice.friendlyName.length > prevDevice.friendlyName.length) {
					prevDevice.friendlyName = foundDevice.friendlyName;
				}
				// HACK: Pick more details over less
				if (!prevDevice.model) {
					prevDevice.model = foundDevice.model;
					prevDevice.manufacturer = foundDevice.manufacturer;
				}
				return;
			}
			
			// NB Assumes the list of devices is small 
            for (var i = 0; i < deviceList.length; i++) {
                var device = deviceList[i];
                if (foundDevice.location == device.location) {
                    // Already in the list, ignore it
					console.log('odf: Ignoring dup: ' + foundDevice.friendlyName);
                    return;
                } else if ((foundDevice.friendlyName == device.friendlyName) && (foundDevice.ip == device.ip)) {
					if (foundDevice.presentationUrl == device.presentationUrl) {
						// Even if locations differ, if everything else is the same may as way skip it
						console.log('odf: Ignoring dup: ' + foundDevice.friendlyName);
						return;
					}
					// TODO: Someway to de-dup different presentation urls for the same friendly name and ip? 
					// Maybe just ignore?
				} else if (foundDevice.friendlyName.localeCompare(device.friendlyName) < 1) {
					// Insert it here
					deviceList.splice(i, 0, foundDevice);
					presentationUrls[foundDevice.presentationUrl] = foundDevice;
					return;
				}
            }
            // Append it on the end
            deviceList.push(foundDevice);
			presentationUrls[foundDevice.presentationUrl] = foundDevice;
        });
    }  
	
	$scope.refresh();
 
}


