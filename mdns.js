// Handle all mdns related network stuff

var DNSQuery = {
	transactionId = 0;
	flags = 0;
	questionResources = DNSQuestionEntry[];
	answerResources = DNSResourceRecord[];
	authorityResources = DNSResourceRecord[];
	additionalResources = DNSResourceRecord[];
}

var DNSQuestionEntry = {
	name = '';
	type = 0;	
}
	
var DNSResourceRecord = {
	name = '';
	type = 0;
	class = 1;
	ttl = 0;
	data = new ArrayBuffer();
}
	
