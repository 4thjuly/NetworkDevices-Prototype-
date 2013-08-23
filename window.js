
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM Content Loaded");  
});

function ListController($scope) {
    $scope.deviceList = [ ];
 
    $scope.refresh = function() {
        console.log("Refresh");
		// TODO - Disable refresh button for a second to make it obvious something is happening
        $scope.deviceList = [ ];
        ssdpSearch(onDeviceFound);
        wsdSearch(onDeviceFound);
    };
      
    function onDeviceFound(foundDevice) {
        $scope.$apply(function() {
            var deviceList = $scope.deviceList;
			// NB Assumes the list of devices is small 
            for (var i = 0; i < deviceList.length; i++) {
                var device = deviceList[i];
                if (foundDevice.location == device.location) {
                    // Already in the list, ignore it
                    return;
                }
				if (foundDevice.friendlyName.localeCompare(device.friendlyName) < 1) {
					// Insert it here
					deviceList.splice(i, 0, foundDevice);
					return;
				}
            }
            // Append it on the end
            deviceList.push(foundDevice);
        });
    }  
	
	$scope.refresh();
 
}


