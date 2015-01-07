var express = require('express');
var connect = require('connect');
var nodeCrossFilter = require('node-cross-filter');
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
            if (socket.crossFilterProcess === undefined) {
                socket.crossFilterProcess = new nodeCrossFilter();
                socket.crossFilterProcess.requestCrossfilterService({ type: "connect", data: data }, function (output) {
                    socket.emit(output.type, output.data);
                });
            }
            else {
                socket.emit('error', 'Connect is one time excercise');
            }
        });
        socket.on('dimension', function (data) {
            socket.crossFilterProcess.requestCrossfilterService({ type: "dimension", data: data }, function (output) {
                socket.emit(output.type, output.data);
            });
        });
        socket.on('filter', function (data) {
            socket.crossFilterProcess.requestCrossfilterService({ type: "filter", data: data }, function (output) {
                socket.emit(output.type, output.data);
            });
        });
        socket.on('disconnect', function (data) {
            socket.crossFilterProcess.requestCrossfilterService({ type: "disconnect", data: data }, function (output) {
                socket.emit(output.type, output.data);
            });
        });
        socket.on('data', function (data) {
            socket.crossFilterProcess.requestCrossfilterService({ type: "data", data: data }, function (output) {
                socket.emit(output.type, output.data);
            });
        });
        socket.on('count', function (data) {
            socket.crossFilterProcess.requestCrossfilterService({ type: "count", data: data }, function (output) {
                socket.emit(output.type, output.data);
            });
        });
    });

    //    var crossFilter = io
    //    .of('/crossFilter')
    //    .on('connection', function (socket) {
    //        socket.on('setup', function (data) {
    //            if (socket.crossFilterProcess === undefined) {
    //                socket.crossFilterProcess = childProcess.fork(__dirname + '/AxiomCrossFilterService.js');
    //                socket.crossFilterProcess.on("message", function (output) {
    //                    socket.emit(output.type, output.data);
    //                });
    //                socket.crossFilterProcess.send({ type: "setup", data: data });
    //            }
    //            else {
    //                socket.emit('errorMessage', 'Setup is one time excercise');
    //            }
    //        });
    //        socket.on('addToPivotList', function (data) {
    //            socket.crossFilterProcess.send({ type: "addToPivotList", data: data });
    //        });
    //        socket.on('filterFixDimension', function (data) {
    //            socket.crossFilterProcess.send({ type: "filterFixDimension", data: data });
    //        });
    //        socket.on('disconnect', function (data) {
    //            socket.crossFilterProcess.send({ type: "disconnect", data: data });
    //        });
    //        socket.on('getData', function (data) {
    //            socket.crossFilterProcess.send({ type: "getData", data: data });
    //        });
    //        socket.on('getCount', function (data) {
    //            socket.crossFilterProcess.send({ type: "getCount", data: data });
    //        });
    //    });
}