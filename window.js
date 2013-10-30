// TODO
// - Some packets get dropped on ChromeOS due to the firewall. Not sure how to fix.
// - Remove duplicates (same or null presentation url, same friendly name and IP)
// - Add mDNS support (printers, computers etc)

document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM Content Loaded");  
});

function ListController($scope) {
    $scope.deviceList = [ ];
    $scope.hasHiddenItems = false;
    $scope.showHidden = false;
    var presentationUrls = { }; // To help with de-duping 
	
    $scope.onToggleHidden = function() {
        $scope.showHidden = !$scope.showHidden;
    }
    
    $scope.onRefresh = function() {
        console.log("Refresh");
        // Disable refresh button for a second to make it obvious something is happening
        var refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.disabled = true;
        setTimeout(function(){refreshBtn.disabled = false; }, 1000);
        // Clear the old list, look for new stuff
        $scope.deviceList = [ ];
        presentationUrls = { };
        $scope.hasHiddenItems = false;
        searchForDevices(onDeviceFound);
	};
    
    // Specifically, seach for anything that has a 'friendly name', ideally a web page we can nav to
    // This, for example, will skip lots of misc mdns services
	function searchForDevices(onDeviceFound) {
        ssdpSearch(onDeviceFound);
        wsdSearch(onDeviceFound);
        mdnsSearch(onDeviceFound);
        nbtSearch(onDeviceFound);
    }

    function isDupDevice(device1, device2) { 
        if (device1.location == device2.location) {
            // Already in the list, ignore it
            return true;
        } else if ((device1.friendlyName == device2.friendlyName) && (device1.ip == device2.ip) && (device1.presentationUrl == device2.presentationUrl)) {
            // Even if locations differ, if everything else is the same may as way skip it
            return true;
        }
        return false;
    }
    
    // Merge device2 into device1
    function mergeDevices(device1, device2) {
        // HACK: Pick the longest friendly name, assumption being its more descriptive
        if (device2.friendlyName.length > device1.friendlyName.length) {
            device1.friendlyName = device2.friendlyName;
        }
        // HACK: Pick more details over less. 
        // Specifically http devices found first by mdns and then later by ssdp or wsd 
        // wont have model
        if (!device1.model) {
            device1.model = device2.model;
            device1.manufacturer = device2.manufacturer;
        }
    }
                    
    function onDeviceFound(foundDevice) {
        $scope.$apply(function() {
            var deviceList = $scope.deviceList;
				
            if (foundDevice.presentationUrl) {
                foundDevice.hasSettings = true;
                // Merge devices with the same presentation url
                var prevDevice = presentationUrls[foundDevice.presentationUrl]; 
                if (prevDevice) {
                    mergeDevices(foundDevice, prevDevice);
                    // Remove the old device, add the new one (below)
                    deviceList.splice(deviceList.indexOf(prevDevice), 1);
                } 
            } else {
                // Hide things without presentation urls for settings
				console.log('odf: Hidden device: ' + foundDevice.friendlyName);
				$scope.hasHiddenItems = true;
            }
			
			// Add device to the list, NB Assumes the list of devices is small 
            for (var i = 0; i < deviceList.length; i++) {
                var device = deviceList[i];
                if (isDupDevice(device, foundDevice)) {
					console.log('odf: Ignoring dup: ' + foundDevice.friendlyName);
                    return;                
				} else if (foundDevice.friendlyName.localeCompare(device.friendlyName) < 1) {
					// Insert it here
                    break;
                }
            }
            // Add it to the list
            deviceList.splice(i, 0, foundDevice);
			presentationUrls[foundDevice.presentationUrl] = foundDevice;
        });
    }  
	
	$scope.onRefresh();
 
}


