var express = require('express');
var connect = require('connect');
var childProcess = require('child_process');
var app = module.exports = express.createServer();

var MemoryStore = new express.session.MemoryStore();

app.configure(function () {
    app.use(express.static(__dirname + '/public'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ store: MemoryStore, secret: 'Th!$!$$@mple', key: 'sid' })); //Th!$!$$@mple
    app.use(connect.compress());
});

app.listen(3000, function () {
    console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
    connectSocket();
});

function connectSocket() {
    var io = require('socket.io').listen(app, { log: false });
    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file

    // enable all transports (optional if you want flashsocket support, please note that some hosting
    // providers do not allow you to create servers that listen on a port different than 80 or their
    // default port)
    io.set('transports', [
        'websocket'
      , 'flashsocket'
      , 'htmlfile'
      , 'xhr-polling'
      , 'jsonp-polling'
    ]);

    var crossFilter = io
        .of('/crossFilter')
        .on('connection', function (socket) {
            socket.on('connect', function (data) {
                if (socket.mysmartfilter === undefined) {
                    socket.mySmartfilter = childProcess.fork(__dirname + '/smartfilterService.js');
                    socket.mySmartfilter.on("message", function (output) {
                        socket.emit(output.type, output.data);
                    });
                    socket.mySmartfilter.send({ type: "connect", data: data });
                }
                else {
                    socket.emit('errorMessage', 'Setup is one time excercise');
                }
            });
            socket.on('pivot', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "pivot", data: data });
            });
            socket.on('filter', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "filter", data: data });
            });
            socket.on('disconnect', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "disconnect", data: data });
            });
            socket.on('data', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "data", data: data });
            });
//            socket.on('count', function (data) {
//                if (socket.mySmartfilter)
//                    socket.mySmartfilter.send({ type: "count", data: data });
//            });
        });
}