var smartfilter = new require('smartfilter');
process.on('message', function (m) {
    if (this.smartfilter === undefined) {
        this.smartfilter = new smartfilter();
    }
    this.smartfilter.smartfilterRequest(m, function (data) {
        process.send(data);
        data = null;
    });
});