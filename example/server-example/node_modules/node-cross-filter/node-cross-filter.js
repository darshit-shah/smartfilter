"use strict";
function nodeCrossFilter() {
    this.debug = true;
    this.tablename = "";
    this.staticFilters = {};
    this.filteredDimension = {};

    this.pivotList = {};
    this.pivotListResult = {};
    this.pivotListResultKey = [];
    this.pivotKeyList = [];

    this.oldResults = [];

    this.myRequestStack = [];
    this.processRequestRunning = false;
    this.cReq = null;
}

nodeCrossFilter.prototype.getCount = function (cb) {
    var _this = this;
    var filterCondition = this.createWhereCondition(undefined);
    var startTime = new Date().getTime();
    var query = {};
    if (filterCondition !== undefined) {
        query.filter = filterCondition;
    }
    query.select = [{ field: 'pk_ID', aggregation: 'count', alias: 'totalCount'}];
    query.table = _this.tableName;
    _this.createToExternalDatabase('', query, function (data, isCachedResult) {
        cb(data);
        data = null;
    });
}

nodeCrossFilter.prototype.getData = function (from, to, cb) {
    var _this = this;
    if (typeof from === 'function') {
        cb = from;
        to = undefined;
        from = undefined;
    }
    else if (typeof to === 'function') {
        cb = to;
        to = from;
        from = 0;
    }

    var filterCondition = _this.createWhereCondition(undefined);

    var query = {};
    query.table = _this.tableName;
    if (filterCondition !== undefined) {
        query.filter = filterCondition;
    }
    if (from != undefined) {
        query.limit = from + "," + to;
    }

    _this.createToExternalDatabase('', query, function (data, isCachedResult) {
        cb(data);
        data = null;
    });
}

nodeCrossFilter.prototype.dimension = function (dimension, measure, cb) {
    var _this = this;
    if (_this.debug)
        console.log({ dimension: dimension, measure: measure });
    if (_this.pivotKeyList.indexOf(dimension) == -1) {
        _this.pivotKeyList.push(dimension);
        _this.pivotList[dimension] = [];
        _this.filteredDimension[dimension] = {};
        _this.filteredDimension[dimension].filters = [];
        _this.filteredDimension[dimension].filterType = undefined;
    }
    _this.pivotList[dimension].push(measure);
    _this.execute(0, '', cb);
}

nodeCrossFilter.prototype.filter = function (filterType, dimension, values, cb) {
    var _this = this;
    if (_this.filteredDimension[dimension] === undefined) {
        _this.filteredDimension[dimension] = {};
        _this.filteredDimension[dimension].filters = [];
    }
    _this.filteredDimension[dimension].filterType = filterType;
    var existingCondition = _this.filteredDimension[dimension].filters;
    var newCondition = [];
    var addReduceNone = -1; //None = 0, Add = 1, Reduce = 2
    if (typeof values === "string") {
        newCondition = [values];
        addReduceNone = 0;
    }
    else if (filterType === 'range') {
        if (values.length === 2) {
            //left  is same
            if (existingCondition.length === 2 && existingCondition[0] === values[0]) {
                // added
                if (existingCondition[1] <= values[1]) {
                    addReduceNone = 1;
                    newCondition[0] = existingCondition[1];
                    newCondition[1] = values[1];
                }
                //reduced
                else {
                    addReduceNone = 2;
                    newCondition[0] = values[1];
                    newCondition[1] = existingCondition[1];
                }
            }
            //right is same
            else if (existingCondition.length === 2 && existingCondition[1] === values[1]) {
                // added
                if (values[0] <= existingCondition[0]) {
                    addReduceNone = 1;
                    newCondition[0] = values[0];
                    newCondition[1] = existingCondition[0];
                }
                //reduced
                else {
                    addReduceNone = 2;
                    newCondition[0] = existingCondition[0];
                    newCondition[1] = values[0];
                }
            }
            //nothing is same
            else {
                newCondition[0] = values[0];
                newCondition[1] = values[1];
            }
        }
    }
    else if (filterType === 'in') {
        //first time filter
        if (existingCondition.length === 0) {
            newCondition = values;
            addReduceNone = 0;
        }
        else {
            //most likely removed some values
            if (existingCondition.length > values.length) {
                //if existing/2 < new then try to alter condition else dont alter condition
                if (existingCondition.length / 2 < values.length) {
                    //all new values should be part of existing values
                    var allNewValuesFound = true;
                    var existingFoundIndexes = [];
                    for (var i = 0; i < values.length && allNewValuesFound === true; i++) {
                        //current value is not part of existing condition
                        var existingIndex = existingCondition.indexOf(values[i]);
                        if (existingIndex === -1) {
                            allNewValuesFound = false;
                        }
                        else {
                            //do nothing
                            existingFoundIndexes.push(existingIndex);
                        }
                    }
                    //actually new values are subset of old values
                    if (allNewValuesFound === true) {
                        for (var i = 0; i < existingCondition.length; i++) {
                            if (existingFoundIndexes.indexOf(i) === -1) {
                                newCondition.push(existingCondition[i]);
                            }
                        }
                        addReduceNone = 2;
                    }
                    else {
                        newCondition = values;
                        addReduceNone = 0;
                    }
                }
                else {
                    newCondition = values;
                    addReduceNone = 0;
                }
            }
            //most likely added some values
            else {
                //all existing values should be part of new values
                var allExistingValuesFound = true;
                var newValuesFoundIndexes = [];
                for (var i = 0; i < existingCondition.length && allExistingValuesFound === true; i++) {
                    //current value is not part of new condition
                    var newValueIndex = values.indexOf(existingCondition[i]);
                    if (newValueIndex === -1) {
                        allExistingValuesFound = false;
                    }
                    else {
                        //do nothing
                        newValuesFoundIndexes.push(newValueIndex);
                    }
                }
                //actually old values are subset of new values
                if (allExistingValuesFound === true) {
                    for (var i = 0; i < values.length; i++) {
                        if (newValuesFoundIndexes.indexOf(i) === -1) {
                            newCondition.push(values[i]);
                        }
                    }
                    addReduceNone = 1;
                }
                else {
                    newCondition = values;
                    addReduceNone = 0;
                }
            }
        }
    }

    _this.filteredDimension[dimension].filters = newCondition;
    if (_this.debug) {
        console.log('original filter: ', values);
        console.log('changed  filter: ', newCondition);
        console.log('merge type: ', (addReduceNone === 0 ? 'replace' : (addReduceNone === 1 ? 'Add' : 'Reduce')));
    }
    //    if (_this.debug)
    //        console.log(['existingCondition', existingCondition, values, newCondition, addReduceNone]);
    _this.execute(addReduceNone, dimension, function (data) {
        _this.filteredDimension[dimension].filters = values;
        cb(data);
        data = null;
    });
}

nodeCrossFilter.prototype.execute = function (addReduceNone, dimension, cb) {
    var _this = this;
    _this.updateAllResults(0, addReduceNone, dimension, function (data) {
        //        if (_this.debug)
        //            console.log('execute', data);
        cb(data);
        data = null;
    });
}

nodeCrossFilter.prototype.createWhereCondition = function (dimension) {
    var _this = this;
    var filterList = Object.keys(_this.filteredDimension);
    var filterCondition = undefined;
    if (filterList.length > 0) {
        filterCondition = { and: [] };
        for (var i = 0; i < filterList.length; i++) {
            if (_this.filteredDimension[filterList[i]].filters.length > 0 && dimension !== filterList[i]) {
                if (_this.filteredDimension[filterList[i]].filterType === 'in') {
                    filterCondition.and.push({ field: filterList[i], operator: 'eq', value: _this.filteredDimension[filterList[i]].filters });
                }
                else if (_this.filteredDimension[filterList[i]].filterType === 'range') {
                    filterCondition.and.push({ field: filterList[i], operator: 'gteq', value: _this.filteredDimension[filterList[i]].filters[0] });
                    filterCondition.and.push({ field: filterList[i], operator: 'lteq', value: _this.filteredDimension[filterList[i]].filters[1] });
                }
            }
        }
    }
    if (filterCondition !== undefined && filterCondition.and.length === 0)
        filterCondition = undefined;
    //    if (_this.debug)
    //        console.log('actual filter: ', (filterCondition != undefined ? filterCondition.and : 'none'));
    return filterCondition;
}

nodeCrossFilter.prototype.updateAllResults = function (index, addReduceNone, dimension, cb) {
    var _this = this;
    if (index < _this.pivotKeyList.length) {
        var filterCondition = _this.createWhereCondition(_this.pivotKeyList[index]);
        if (dimension === _this.pivotKeyList[index]) {
            _this.updateAllResults(index + 1, addReduceNone, dimension, cb);
            return;
        }
        var i = index;
        var startTime = new Date().getTime();
        //        if (_this.debug)
        //            console.log('Querying for for dimension \'' + _this.pivotKeyList[i] + '\'');
        var query = {};
        query.table = _this.tableName;
        query.select = [];
        query.select.push({ field: _this.pivotKeyList[i], alias: _this.pivotKeyList[i] });
        var measures = _this.pivotList[_this.pivotKeyList[i]];
        for (var j = 0; j < measures.length; j++) {
            if (measures[j].alias === undefined)
                measures[j].alias = measures[j].aggregation + '(' + measures[j].key + ')';
            query.select.push({ field: measures[j].key, aggregation: measures[j].aggregation, alias: measures[j].alias });
        }
        query.groupby = [];
        query.groupby.push(_this.pivotKeyList[i]);
        if (filterCondition !== undefined) {
            query.filter = filterCondition;
        }
        _this.createToExternalDatabase(_this.pivotKeyList[index], query, function (data, isCachedResult) {
            if (_this.debug)
                console.log('Result Returned for dimension \'' + _this.pivotKeyList[i] + '\' in ' + (new Date().getTime() - startTime) / 1000 + ' seconds from ' + (isCachedResult ? 'memory' : 'db'));

            //add to existing
            if (addReduceNone === 1) {
                for (var j = 0; j < data.length; j++) {
                    var keyIndex = _this.pivotListResultKey[_this.pivotKeyList[i]].indexOf(data[j][_this.pivotKeyList[i]]);
                    if (keyIndex === -1) {
                        _this.pivotListResult[_this.pivotKeyList[i]].push(data[j]);
                        _this.pivotListResultKey[_this.pivotKeyList[i]].push(data[j][_this.pivotKeyList[i]]);
                    }
                    else {
                        for (var k = 0; k < measures.length; k++) {
                            _this.pivotListResult[_this.pivotKeyList[i]][keyIndex][measures[k].alias] += data[j][measures[k].alias];
                        }
                    }
                }
            }
            //remove from existing
            else if (addReduceNone === 2) {
                for (var j = 0; j < data.length; j++) {
                    var keyIndex = _this.pivotListResultKey[_this.pivotKeyList[i]].indexOf(data[j][_this.pivotKeyList[i]]);
                    if (keyIndex === -1) {
                        // not possible
                        throw ("node-cross-filter, reduce part could not found existing row.");
                    }
                    else {

                        if (_this.pivotKeyList[i] === dimension) {
                            _this.pivotListResult[_this.pivotKeyList[i]].splice(keyIndex, 1);
                            _this.pivotListResultKey[_this.pivotKeyList[i]].splice(keyIndex, 1);
                        }
                        else {
                            for (var k = 0; k < measures.length; k++) {
                                _this.pivotListResult[_this.pivotKeyList[i]][keyIndex][measures[k].alias] -= data[j][measures[k].alias];
                            }
                        }
                    }
                }
            }
            //replace entire result
            else {
                _this.pivotListResult[_this.pivotKeyList[i]] = data;
                _this.pivotListResultKey[_this.pivotKeyList[i]] = [];
                for (var j = 0; j < data.length; j++) {
                    _this.pivotListResultKey[_this.pivotKeyList[i]].push(data[j][_this.pivotKeyList[i]]);
                }
            }
            setTimeout(function () {
                _this.updateAllResults(index + 1, addReduceNone, dimension, cb);
            }, 1);
        });
    }
    else {
        cb(_this.pivotListResult);
    }
}

nodeCrossFilter.prototype.createToExternalDatabase = function (dimension, query, cb) {
    var _this = this;

    for (var i = 0; i < _this.oldResults.length; i++) {
        if (_this.oldResults[i].query === JSON.stringify(query)) {
            cb(_this.oldResults[i].result, true);
            return;
        }
    }

    _this.queryExecutor(query, function (err, rows, fields) {
        if (err) {
            console.log(['error', err]);
            delete _this.pivotList[dimension];
            delete _this.pivotListResult[dimension];
            var localIndex = _this.pivotKeyList.indexOf(dimension);
            _this.pivotListResultKey.splice(localIndex, 1);
            _this.pivotKeyList.splice(localIndex, 1);
            _this.cReq.cb({ type: 'error', data: err });
            return;
        }
        else {
            _this.oldResults.push({ query: JSON.stringify(query), result: rows });
            rows = null;
            cb(_this.oldResults[_this.oldResults.length - 1].result, false);
        }
    });
}

nodeCrossFilter.prototype.connect = function (tblName, config, cb) {
    var _this = this;
    _this.tableName = tblName;
    _this.connectionIdentifier = require('node-database-connectors');
    _this.dbConfig = config;
    _this.objConnection = _this.connectionIdentifier.identify(_this.dbConfig);
    _this.objConnection.connect(_this.dbConfig, function (err, c) {
        if (err) {
            _this.cReq.cb({ type: 'error', data: err });
        }
        else {
            _this.c = c;
            _this.cReq.cb({ type: 'connectSuccess', data: 'connected successfully' });
        }
        cb();
    });
}

nodeCrossFilter.prototype.requestCrossfilterService = function (m, cb) {
    var _this = this;
    m.cb = cb;
    _this.myRequestStack.push(m);

    if (_this.processRequestRunning === false) {
        _this.processRequestStack();
    }
}

nodeCrossFilter.prototype.queryExecutor = function (query, cb) {
    var _this = this;
    //    if (_this.debug)
    //        console.log('query', query);
    var queryString = _this.objConnection.prepareQuery(query);
    //    if (_this.debug)
    //        console.log('queryString:\n', queryString);
    _this.c.query(queryString, function (err, rows, fields) {
        cb(err, rows, fields);
        err = null;
        rows = null;
        fields = null;
    });
}

nodeCrossFilter.prototype.processRequestStack = function () {
    var _this = this;
    _this.cReq = null;
    if (_this.myRequestStack.length > 0) {
        _this.processRequestRunning = true;
        _this.cReq = _this.myRequestStack.shift();
        //        if (_this.debug)
        //            console.log('processing request:', _this.cReq);
        if (_this.cReq.type.toLowerCase() === "connect") {
            _this.connect(_this.cReq.data.tableName, _this.cReq.data.dbConfig, function (data) {
                _this.processRequestRunning = false;
                _this.processRequestStack();
            });
        }
        else if (_this.cReq.type.toLowerCase() === "dimension") {
            _this.dimension(_this.cReq.data.field, { key: _this.cReq.data.key, aggregation: _this.cReq.data.aggregation }, function (data) {
                _this.cReq.cb({ type: 'data', data: data });
                _this.processRequestRunning = false;
                _this.processRequestStack();
            });
        }
        else if (_this.cReq.type.toLowerCase() === "filter") {
            _this.filter(_this.cReq.data.filterType, _this.cReq.data.field, _this.cReq.data.filters, function (data) {
                _this.cReq.cb({ type: 'data', data: data });
                _this.processRequestRunning = false;
                _this.processRequestStack();
            });
        }
        else if (_this.cReq.type.toLowerCase() === "data") {
            _this.getData(_this.cReq.data.from, _this.cReq.data.to, function (data) {
                _this.cReq.cb({ type: 'records', data: data });
                _this.processRequestRunning = false;
                _this.processRequestStack();
            });
        }
        else if (_this.cReq.type.toLowerCase() === "count") {
            _this.getCount(function (data) {
                _this.cReq.cb({ type: 'count', data: data });
                _this.processRequestRunning = false;
                _this.processRequestStack();
            });
        }
        else {
            console.log('unknown type: ' + _this.cReq.type + ' would kill this process');
            process.exit(0);
        }
    }
}

process.on('message', function (m) {
    var _this = this;
    //    if (_this.debug)
    //        console.log('CHILD got message:', m);
    _this.requestCrossfilterService(m, function (data) {
        process.send(data);
        data = null;
    });
});

process.on('uncaughtException', function (err) {
    console.log('axiom uncaughtException in node-cross-filter.js', err);
});

process.on('exit', function () {
    var _this = this;
    if (_this.c != null)
        _this.c.end();
    console.log('About to exit.');
});

module.exports = new nodeCrossFilter();