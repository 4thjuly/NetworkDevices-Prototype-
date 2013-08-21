// TODO
// - Sort list alphabetically
// - Listen for multicasts not just unicasts
// - UI cleanup 'refresh' button (disable for a second or two

document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM Content Loaded");  
});

function ListController($scope) {
    $scope.deviceList = [ ];
 
    $scope.refresh = function() {
        console.log("Refresh");
        $scope.deviceList = [ ];
        ssdpSearch(onDeviceFound);
        wsdSearch(onDeviceFound);
    };
      
    function onDeviceFound(foundDevice) {
        $scope.$apply(function() {
            var deviceList = $scope.deviceList;
            for (var i = 0; i < deviceList.length; i++) {
                var device = deviceList[i];
                if (foundDevice.location == device.location) {
                    // Already in the list, ignore it
                    return;
                }
            }
            // Not in the list, add it
            deviceList.push(foundDevice);
        });
    }  
	
	$scope.refresh();
 
}
