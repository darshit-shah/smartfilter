"use strict";
function smartfilter() {
    var debug = false;

    var tableName = "";
    //var staticFilters = {};
    var filteredDimension = {};

    //var pivotList = {};
    var pivotListResult = {};
    var pivotListResultKey = [];
    //var pivotKeyList = [];

    var oldResults = [];

    var myRequestStack = [];
    var processRequestRunning = false;
    var cReq = null;
    var dbConfig = undefined;
    var objConnection = undefined;
    var cConn = undefined;

    var pivotMap = [];

    /*function getCount(cb) {

    var filterCondition = createWhereCondition(undefined);
    var startTime = new Date().getTime();
    var query = {};
    if (filterCondition !== undefined) {
    query.filter = filterCondition;
    }
    query.select = [{ field: 'pk_ID', aggregation: 'count', alias: 'totalCount'}];
    query.table = tableName;
    createToExternalDatabase('', query, function (data, isCachedResult) {
    cb(data);
    data = null;
    });
    }*/

    function getData(from, to, cb) {

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

        var filterCondition = createWhereCondition(undefined);

        var query = {};
        query.table = tableName;
        if (filterCondition !== undefined) {
            query.filter = filterCondition;
        }
        if (from != undefined) {
            query.limit = from + "," + to;
        }

        createToExternalDatabase('', query, function (data, isCachedResult) {
            cb(data);
            data = null;
        });
    }

    /*function dimension(dimension, measure, cb) {

    if (debug)
    console.log({ dimension: dimension, measure: measure });
    if (pivotKeyList.indexOf(dimension) == -1) {
    pivotKeyList.push(dimension);
    pivotList[dimension] = [];
    filteredDimension[dimension] = {};
    filteredDimension[dimension].filters = [];
    filteredDimension[dimension].filterType = undefined;
    }
    pivotList[dimension].push(measure);
    execute(0, null, cb);
    }*/

    /*************************************************************************************************************************/
    function pivot(reference, dimensions, measures, cb) {
        pivotMap.push({ reference: reference, dimensions: dimensions, measures: measures });
        executePivots(0, null, cb);
    }


    function executePivots(addReduceNone, dimension, cb) {
        if (debug)
            console.log('executePivots', dimension);
        getAllPivotResults(0, addReduceNone, dimension, function (data) {
            if (debug)
                console.log('executePivots', dimension, Object.keys(data));
            cb(data);
            data = null;
        });
    }

    function getAllPivotResults(index, addReduceNone, dimension, cb) {
        if (index < pivotMap.length) {
            if (pivotMap[index].dimensions.length === 1 && pivotMap[index].dimensions[0] === dimension) {
                getAllPivotResults(index + 1, addReduceNone, dimension, cb);
                return;
            }
            var filterCondition = createPivotWhereCondition(index);
            var i = index;
            var startTime = new Date().getTime();
            if (debug)
                console.log('Querying for for dimension \'' + pivotMap[index].dimensions + '\'');
            var query = {};
            query.table = tableName;
            query.select = [];
            for (var n = 0; n < pivotMap[index].dimensions.length; n++) {
                if (pivotMap[index].dimensions[n] !== "")
                    query.select.push({ field: pivotMap[index].dimensions[n], alias: pivotMap[index].dimensions[n] });
            }
            var measures = pivotMap[index].measures;
            for (var j = 0; j < measures.length; j++) {
                if (measures[j].alias === undefined)
                    measures[j].alias = measures[j].aggregation + '(' + measures[j].key + ')';
                if (measures[j].key !== "")
                    query.select.push({ field: measures[j].key, aggregation: measures[j].aggregation, alias: measures[j].alias });
                else
                    query.select.push({ field: 'pk_ID', aggregation: measures[j].aggregation, alias: measures[j].alias });
            }
            query.groupby = [];
            for (var n = 0; n < pivotMap[index].dimensions.length; n++) {
                if (pivotMap[index].dimensions[n] !== "") {
                    query.groupby.push(pivotMap[index].dimensions[n]);
                }
            }
            if (filterCondition !== undefined) {
                query.filter = filterCondition;
            }

            createToExternalDatabasePivot(query, function (data, isCachedResult) {
                if (debug) {
                    console.log(data.length + ' rows Returned for dimensions \'' + pivotMap[i].dimensions + '\' in ' + (new Date().getTime() - startTime) / 1000 + ' seconds from ' + (isCachedResult ? 'memory' : 'db') + '. addReduceNone: ' + addReduceNone);
                }


                //add to existing
                if (addReduceNone === 1) {
                    for (var j = 0; j < data.length; j++) {
                        var pivotMapDimensionKey = [];
                        for (var n = 0; n < pivotMap[i].dimensions.length; n++) {
                            pivotMapDimensionKey.push(data[j][pivotMap[i].dimensions[n]]);
                        }
                        //var keyIndex = pivotListResultKey[pivotMap[i].dimensions.join("_$#$_")].indexOf(pivotMapDimensionKey.join("_$#$_"));
                        var keyIndex = pivotListResultKey[pivotMap[i].reference].indexOf(pivotMapDimensionKey.join("_$#$_"));
                        if (keyIndex === -1) {
                            pivotListResult[pivotMap[i].reference].push(data[j]);
                            pivotListResultKey[pivotMap[i].reference].push(pivotMapDimensionKey.join("_$#$_"));
                        }
                        else {
                            for (var k = 0; k < measures.length; k++) {
                                pivotListResult[pivotMap[i].reference][keyIndex][measures[k].alias] += data[j][measures[k].alias];
                            }
                        }
                    }
                }
                //remove from existing
                else if (addReduceNone === 2) {
                    for (var j = 0; j < data.length; j++) {
                        var pivotMapDimensionKey = [];
                        for (var n = 0; n < pivotMap[i].dimensions.length; n++) {
                            pivotMapDimensionKey.push(data[j][pivotMap[i].dimensions[n]]);
                        }
                        var keyIndex = pivotListResultKey[pivotMap[i].reference].indexOf(pivotMapDimensionKey.join("_$#$_"));
                        if (keyIndex === -1) {
                            // not possible
                            throw ("node-cross-filter, reduce part could not found existing row.");
                        }
                        else {

                            if (pivotMap[i].dimensions.length === 1 && pivotMap[i].dimensions[0] === dimension) {
                                pivotListResult[pivotMap[i].reference].splice(keyIndex, 1);
                                pivotListResultKey[pivotMap[i].reference].splice(keyIndex, 1);
                            }
                            else {
                                for (var k = 0; k < measures.length; k++) {
                                    pivotListResult[pivotMap[i].reference][keyIndex][measures[k].alias] -= data[j][measures[k].alias];
                                }
                            }
                        }
                    }
                }
                //replace entire result
                else {
                    pivotListResult[pivotMap[i].reference] = data;
                    pivotListResultKey[pivotMap[i].reference] = [];
                    for (var j = 0; j < data.length; j++) {
                        var pivotMapDimensionKey = [];
                        for (var n = 0; n < pivotMap[i].dimensions.length; n++) {
                            pivotMapDimensionKey.push(data[j][pivotMap[i].dimensions[n]]);
                        }
                        pivotListResultKey[pivotMap[i].reference].push(pivotMapDimensionKey.join("_$#$_"));
                    }
                }
                setTimeout(function () {
                    getAllPivotResults(index + 1, addReduceNone, dimension, cb);
                }, 1);
            });
        }
        else {
            //            if (pivotListResult.finalPivot != undefined)
            //                console.log(pivotListResult.finalPivot.length);
            cb(pivotListResult);
        }
    }

    function createPivotWhereCondition(index) {
        var filterList = Object.keys(filteredDimension);
        var filterCondition = undefined;
        if (filterList.length > 0) {
            filterCondition = { and: [] };
            for (var i = 0; i < filterList.length; i++) {
                if (filteredDimension[filterList[i]] != null && filteredDimension[filterList[i]].filters != null && filteredDimension[filterList[i]].filters.length > 0
                    && (pivotMap[index].dimensions.length === 1 && pivotMap[index].dimensions[0] === filterList[i]) == false) {
                    if (filteredDimension[filterList[i]].filterType === 'in') {
                        filterCondition.and.push({ field: filterList[i], operator: 'eq', value: filteredDimension[filterList[i]].filters });
                    }
                    else if (filteredDimension[filterList[i]].filterType === 'range') {
                        filterCondition.and.push({ field: filterList[i], operator: 'gteq', value: filteredDimension[filterList[i]].filters[0] });
                        filterCondition.and.push({ field: filterList[i], operator: 'lteq', value: filteredDimension[filterList[i]].filters[1] });
                    }
                }
            }
        }
        if (filterCondition !== undefined && filterCondition.and.length === 0)
            filterCondition = undefined;
        //    if (debug)
        //        console.log('actual filter: ', (filterCondition != undefined ? filterCondition.and : 'none'));
        return filterCondition;
    }

    function createToExternalDatabasePivot(query, cb) {
        //        for (var i = 0; i < oldResults.length; i++) {
        //            if (oldResults[i].query === JSON.stringify(query)) {
        //                if (debug)
        //                    console.log(oldResults[i].query);
        //                cb(oldResults[i].result, true);
        //                return;
        //            }
        //        }
        queryExecutor(query, cb);
    }

    /******************************************************************************************************************************************************************/
    function filter(filterType, dimension, values, cb) {
        if (filteredDimension[dimension] === undefined) {
            filteredDimension[dimension] = {};
            filteredDimension[dimension].filters = [];
        }
        filteredDimension[dimension].filterType = filterType;
        var existingCondition = filteredDimension[dimension].filters;
        var newCondition = [];
        var addReduceNone = 0; //None = 0, Add = 1, Reduce = 2
        if (typeof values === "string") {
            newCondition = [values];
        }
        else if (filterType === 'range') {
            if (values.length === 2) {
                //left  is same
                if (existingCondition.length === 2 && existingCondition[0] === values[0]) {
                    // added
                    if (existingCondition[1] <= values[1]) {
                        if (isFinite(+existingCondition[1])) {
                            newCondition[0] = existingCondition[1] + 1;
                            newCondition[1] = values[1];
                            addReduceNone = 1;
                        }
                        else if ((new Date(existingCondition[1])).getTime() != 0) {
                            var dt = new Date(existingCondition[1]);
                            dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
                            dt.setSeconds(dt.getSeconds() + 1);
                            newCondition[0] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
                            newCondition[1] = values[1];
                            addReduceNone = 1;
                        }
                        else {
                            //nothing
                        }
                    }
                    //reduced
                    else {
                        if (isFinite(+existingCondition[1])) {
                            newCondition[1] = existingCondition[1] - 1;
                            newCondition[0] = values[1];
                            addReduceNone = 2;
                        }
                        else if ((new Date(existingCondition[1])).getTime() != 0) {
                            var dt = new Date(existingCondition[1]);
                            dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
                            dt.setSeconds(dt.getSeconds() - 1);
                            newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
                            newCondition[0] = values[0];
                            addReduceNone = 2;
                        }
                        else {
                            //nothing
                        }
                    }
                }
                //right is same
                else if (existingCondition.length === 2 && existingCondition[1] === values[1]) {
                    // added
                    if (values[0] <= existingCondition[0]) {
                        if (isFinite(+existingCondition[0])) {
                            newCondition[1] = existingCondition[0] - 1;
                            newCondition[0] = values[0];
                            addReduceNone = 1;
                        }
                        else if ((new Date(existingCondition[0])).getTime() != 0) {
                            var dt = new Date(existingCondition[0]);
                            dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
                            dt.setSeconds(dt.getSeconds() - 1);
                            newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
                            newCondition[0] = values[0];
                            addReduceNone = 1;
                        }
                        else {
                            //nothing
                        }
                    }
                    //reduced
                    else {
                        if (isFinite(+existingCondition[0])) {
                            newCondition[0] = existingCondition[0] + 1;
                            newCondition[1] = values[1];
                            addReduceNone = 2;
                        }
                        else if ((new Date(existingCondition[0])).getTime() != 0) {
                            var dt = new Date(existingCondition[0]);
                            dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
                            dt.setSeconds(dt.getSeconds() + 1);
                            newCondition[0] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
                            newCondition[1] = values[1];
                            addReduceNone = 2;
                        }
                        else {
                            //nothing
                        }
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
        if (debug) {
            console.log('old filter:', filteredDimension[dimension].filters);
            console.log('original filter: ', values);
            console.log('changed  filter: ', newCondition);
            console.log('merge type: ', (addReduceNone === 0 ? 'replace' : (addReduceNone === 1 ? 'Add' : 'Reduce')));
        }
        filteredDimension[dimension].filters = newCondition;
        //    if (debug)
        //        console.log(['existingCondition', existingCondition, values, newCondition, addReduceNone]);
        executePivots(addReduceNone, dimension, function (data) {
            filteredDimension[dimension].filters = values;
            cb(data);
            data = null;
        });
    }

    /*function execute(addReduceNone, dimension, cb) {
    if (debug)
    console.log('execute', dimension);
    updateAllResults(0, addReduceNone, dimension, function (data) {
    if (debug)
    console.log('execute', dimension, data);
    cb(data);
    data = null;
    });
    }

    function createWhereCondition(dimension) {

    var filterList = Object.keys(filteredDimension);
    var filterCondition = undefined;
    if (filterList.length > 0) {
    filterCondition = { and: [] };
    for (var i = 0; i < filterList.length; i++) {
    if (filteredDimension[filterList[i]].filters.length > 0 && dimension !== filterList[i]) {
    if (filteredDimension[filterList[i]].filterType === 'in') {
    filterCondition.and.push({ field: filterList[i], operator: 'eq', value: filteredDimension[filterList[i]].filters });
    }
    else if (filteredDimension[filterList[i]].filterType === 'range') {
    filterCondition.and.push({ field: filterList[i], operator: 'gteq', value: filteredDimension[filterList[i]].filters[0] });
    filterCondition.and.push({ field: filterList[i], operator: 'lteq', value: filteredDimension[filterList[i]].filters[1] });
    }
    }
    }
    }
    if (filterCondition !== undefined && filterCondition.and.length === 0)
    filterCondition = undefined;
    //    if (debug)
    //        console.log('actual filter: ', (filterCondition != undefined ? filterCondition.and : 'none'));
    return filterCondition;
    }

    function updateAllResults(index, addReduceNone, dimension, cb) {

    if (index < pivotKeyList.length) {
    var filterCondition = createWhereCondition(pivotKeyList[index]);
    if (debug) {
    console.log("dimension === pivotKeyList[index]", dimension, pivotKeyList[index], dimension === pivotKeyList[index]);
    }
    if (dimension === pivotKeyList[index]) {
    updateAllResults(index + 1, addReduceNone, dimension, cb);
    return;
    }
    var i = index;
    var startTime = new Date().getTime();
    if (debug)
    console.log('Querying for for dimension \'' + pivotKeyList[i] + '\'');
    var query = {};
    query.table = tableName;
    query.select = [];
    if (pivotKeyList[i] !== "")
    query.select.push({ field: pivotKeyList[i], alias: pivotKeyList[i] });
    var measures = pivotList[pivotKeyList[i]];
    for (var j = 0; j < measures.length; j++) {
    if (measures[j].alias === undefined)
    measures[j].alias = measures[j].aggregation + '(' + measures[j].key + ')';
    if (measures[j].key !== "")
    query.select.push({ field: measures[j].key, aggregation: measures[j].aggregation, alias: measures[j].alias });
    else
    query.select.push({ field: 'pk_ID', aggregation: measures[j].aggregation, alias: measures[j].alias });
    }
    query.groupby = [];
    if (pivotKeyList[i] !== "")
    query.groupby.push(pivotKeyList[i]);
    if (filterCondition !== undefined) {
    query.filter = filterCondition;
    }
    createToExternalDatabase(pivotKeyList[index], query, function (data, isCachedResult) {
    if (debug)
    console.log('Result Returned for dimension \'' + pivotKeyList[i] + '\' in ' + (new Date().getTime() - startTime) / 1000 + ' seconds from ' + (isCachedResult ? 'memory' : 'db'));

    //add to existing
    if (addReduceNone === 1) {
    for (var j = 0; j < data.length; j++) {
    var keyIndex = pivotListResultKey[pivotKeyList[i]].indexOf(data[j][pivotKeyList[i]]);
    if (keyIndex === -1) {
    pivotListResult[pivotKeyList[i]].push(data[j]);
    pivotListResultKey[pivotKeyList[i]].push(data[j][pivotKeyList[i]]);
    }
    else {
    for (var k = 0; k < measures.length; k++) {
    pivotListResult[pivotKeyList[i]][keyIndex][measures[k].alias] += data[j][measures[k].alias];
    }
    }
    }
    }
    //remove from existing
    else if (addReduceNone === 2) {
    for (var j = 0; j < data.length; j++) {
    var keyIndex = pivotListResultKey[pivotKeyList[i]].indexOf(data[j][pivotKeyList[i]]);
    if (keyIndex === -1) {
    // not possible
    throw ("node-cross-filter, reduce part could not found existing row.");
    }
    else {

    if (pivotKeyList[i] === dimension) {
    pivotListResult[pivotKeyList[i]].splice(keyIndex, 1);
    pivotListResultKey[pivotKeyList[i]].splice(keyIndex, 1);
    }
    else {
    for (var k = 0; k < measures.length; k++) {
    pivotListResult[pivotKeyList[i]][keyIndex][measures[k].alias] -= data[j][measures[k].alias];
    }
    }
    }
    }
    }
    //replace entire result
    else {
    pivotListResult[pivotKeyList[i]] = data;
    pivotListResultKey[pivotKeyList[i]] = [];
    for (var j = 0; j < data.length; j++) {
    pivotListResultKey[pivotKeyList[i]].push(data[j][pivotKeyList[i]]);
    }
    }
    setTimeout(function () {
    updateAllResults(index + 1, addReduceNone, dimension, cb);
    }, 1);
    });
    }
    else {
    cb(pivotListResult);
    }
    }

    function createToExternalDatabase(dimension, query, cb) {


    for (var i = 0; i < oldResults.length; i++) {
    if (oldResults[i].query === JSON.stringify(query)) {
    cb(oldResults[i].result, true);
    return;
    }
    }

    queryExecutor(query, function (err, rows, fields) {
    if (err) {
    console.log(['error', err]);
    delete pivotList[dimension];
    delete pivotListResult[dimension];
    var localIndex = pivotKeyList.indexOf(dimension);
    pivotListResultKey.splice(localIndex, 1);
    pivotKeyList.splice(localIndex, 1);
    cReq.cb({ type: 'error', data: err });
    return;
    }
    else {
    oldResults.push({ query: JSON.stringify(query), result: rows });
    rows = null;
    cb(oldResults[oldResults.length - 1].result, false);
    }
    });
    }*/

    function connect(tblName, config, cb) {

        tableName = tblName;
        var connectionIdentifier = require('node-database-connectors');
        dbConfig = config;
        objConnection = connectionIdentifier.identify(dbConfig);
        objConnection.connect(dbConfig, function (err, c) {
            if (err) {
                cReq.cb({ type: 'error', data: err });
            }
            else {
                cConn = c;
                cReq.cb({ type: 'connectSuccess', data: 'connected successfully' });
            }
            cb();
        });
    }

    function queryExecutor(query, cb) {

        if (debug)
            console.log('query', query);
        var queryString = objConnection.prepareQuery(query);
        if (debug)
            console.log('queryString:\n', queryString);

        for (var i = 0; i < oldResults.length; i++) {
            if (oldResults[i].query === queryString) {
                cb(JSON.parse(JSON.stringify(oldResults[i].result)), true);
                return;
            }
        }
        cConn.query(queryString, function (err, rows, fields) {
            oldResults.push({ query: queryString, result: JSON.parse(JSON.stringify(rows)) });
            cb(rows, false);
            err = null;
            rows = null;
            fields = null;
        });
    }

    function processRequestStack() {

        cReq = null;
        if (myRequestStack.length > 0) {
            processRequestRunning = true;
            cReq = myRequestStack.shift();
            if (debug)
                console.log('processing request:', cReq);
            if (cReq.type.toLowerCase() === "connect") {
                connect(cReq.data.tableName, cReq.data.dbConfig, function (data) {
                    processRequestRunning = false;
                    processRequestStack();
                });
            }
            //            else if (cReq.type.toLowerCase() === "dimension") {
            //                dimension(cReq.data.field, { key: cReq.data.key, aggregation: cReq.data.aggregation }, function (data) {
            //                    cReq.cb({ type: 'data', data: data });
            //                    processRequestRunning = false;
            //                    processRequestStack();
            //                });
            //            }
            else if (cReq.type.toLowerCase() === "filter") {
                filter(cReq.data.filterType, cReq.data.field, cReq.data.filters, function (data) {
                    cReq.cb({ type: 'data', data: data });
                    processRequestRunning = false;
                    processRequestStack();
                });
            }
            else if (cReq.type.toLowerCase() === "data") {
                getData(cReq.data.from, cReq.data.to, function (data) {
                    cReq.cb({ type: 'records', data: data });
                    processRequestRunning = false;
                    processRequestStack();
                });
            }
            else if (cReq.type.toLowerCase() === "count") {
                getCount(function (data) {
                    cReq.cb({ type: 'count', data: data });
                    processRequestRunning = false;
                    processRequestStack();
                });
            }
            else if (cReq.type.toLowerCase() === "pivot") {
                if (cReq.data.reference == undefined) {
                    cReq.cb({ type: 'error', data: 'reference is missing for pivot' });
                    processRequestRunning = false;
                    processRequestStack();
                }
                else {
                    pivot(cReq.data.reference, cReq.data.dimensions, cReq.data.measures, function (data) {
                        cReq.cb({ type: 'data', data: data });
                        processRequestRunning = false;
                        processRequestStack();
                    });
                }
            }
            else {

                if (cConn != null)
                    cConn.end();

                console.log('unknown type: ' + cReq.type + ' would end connection');
            }
        }
    }

    this.smartfilterRequest = function (m, cb) {

        m.cb = cb;
        myRequestStack.push(m);

        if (processRequestRunning === false) {
            processRequestStack();
        }
    }

    return this;
}

module.exports = smartfilter;
