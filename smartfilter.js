"use strict";
function smartfilter() {
    var debug = false;

    var tableName = "";
    var staticFilters = [];
    var filteredDimension = {};

    var pivotListResult = {};
    var pivotListResultKey = {};

    var oldResults = {};
    var oldFilterConditions = [];

    var myRequestStack = [];
    var processRequestRunning = false;
    var cReq = null;
    var dbConfig = undefined;
    var objConnection = undefined;
    var cConn = undefined;

    var pivotMap = [];

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

        var filterCondition = createPivotWhereCondition(-1);

        var query = {};
        query.table = tableName;
        if (filterCondition !== undefined) {
            query.filter = filterCondition;
        }
        if (from != undefined) {
            query.limit = from + "," + to;
        }

        createToExternalDatabasePivot(query, function (data, isCachedResult) {
            cb(data);
            data = null;
        });
    }

    function pivot(reference, dimensions, measures, cb) {
        deletePivot(reference);
        pivotMap.push({ reference: reference, dimensions: dimensions, measures: measures });
        executePivots(0, null, cb);
    }

    function removePivot(reference, cb) {
        deletePivot(reference);
        executePivots(0, null, cb);
    }

    function deletePivot(reference) {
        delete pivotListResult[reference];
        delete pivotListResultKey[reference];
        for (var i = 0; i < pivotMap.length; i++) {
            if (pivotMap[i].reference == reference) {
                pivotMap.splice(i, 1);
                i--;
            }
        }
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

    function prepareQueryJSON(index, dimension) {
        var filterCondition = createPivotWhereCondition(index);
        if (oldFilterConditions.indexOf(JSON.stringify(filterCondition)) == -1)
            oldFilterConditions.push(JSON.stringify(filterCondition));
        //var i = index;
        //var startTime = new Date().getTime();
        if (debug)
            console.log('Querying for for dimension \'' + pivotMap[index].dimensions + '\'');
        var query = {};
        query.table = tableName;
        query.select = [];
        for (var n = 0; n < pivotMap[index].dimensions.length; n++) {
            if (typeof pivotMap[index].dimensions[n] === "string") {
                if (pivotMap[index].dimensions[n] !== "") {
                    query.select.push({ field: pivotMap[index].dimensions[n], alias: pivotMap[index].dimensions[n] });
                }
            }
            else if (Array.isArray(pivotMap[index].dimensions[n].values)) {
                var caseStatement = { field: pivotMap[index].dimensions[n].values[0].key, expression: { cases: [], 'default': { value: 'unknown'}} };
                if (pivotMap[index].dimensions[n].alias != null)
                    caseStatement.alias = pivotMap[index].dimensions[n].alias;
                if (pivotMap[index].dimensions[n]['default'] != null)
                    caseStatement.expression['default'].value = '"' + pivotMap[index].dimensions[n]['default'] + '"';
                for (var i = 0; i < pivotMap[index].dimensions[n].values.length; i++) {
                    caseStatement.expression.cases.push({ operator: pivotMap[index].dimensions[n].values[i].type, value: pivotMap[index].dimensions[n].values[i].value, out: { value: '"' + pivotMap[index].dimensions[n].values[i].display + '"'} });
                }
                query.select.push(caseStatement);
            }
        }
        var measures = pivotMap[index].measures;
        for (var j = 0; j < measures.length; j++) {
            if (measures[j].alias === undefined)
                measures[j].alias = measures[j].aggregation + '(' + measures[j].key + ')';
            if (measures[j].key !== "")
                query.select.push({ field: measures[j].key, aggregation: measures[j].aggregation, alias: measures[j].alias, encloseField: measures[j].encloseField });
            else
                query.select.push({ field: 'pk_ID', aggregation: measures[j].aggregation, alias: measures[j].alias });
        }
        query.groupby = [];
        for (var n = 0; n < pivotMap[index].dimensions.length; n++) {
            if (typeof pivotMap[index].dimensions[n] === "string") {
                if (pivotMap[index].dimensions[n] !== "") {
                    query.groupby.push({ field: pivotMap[index].dimensions[n] });
                }
            }
            else if (Array.isArray(pivotMap[index].dimensions[n].values)) {
                var caseStatement = { field: pivotMap[index].dimensions[n].values[0].key, expression: { cases: [], 'default': { value: 'unknown'}} };
                if (pivotMap[index].dimensions[n]['default'] != null)
                    caseStatement.expression['default'].value = '"' + pivotMap[index].dimensions[n]['default'] + '"';
                for (var i = 0; i < pivotMap[index].dimensions[n].values.length; i++) {
                    caseStatement.expression.cases.push({ operator: pivotMap[index].dimensions[n].values[i].type, value: pivotMap[index].dimensions[n].values[i].value, out: { value: '"' + pivotMap[index].dimensions[n].values[i].display + '"'} });
                }
                query.groupby.push(caseStatement);
            }
        }
        query.sortby = [];
        for (var n = 0; n < pivotMap[index].dimensions.length; n++) {
            if (typeof pivotMap[index].dimensions[n] === "string") {
                if (pivotMap[index].dimensions[n] !== "") {
                    query.sortby.push({ field: pivotMap[index].dimensions[n], order: 'asc' });
                }
            }
            else if (Array.isArray(pivotMap[index].dimensions[n].values)) {
                query.sortby.push({ field: pivotMap[index].dimensions[n].alias, order: 'asc' });
            }
        }
        if (filterCondition !== undefined) {
            query.filter = filterCondition;
        }
        return { query: query, measures: measures };
    }

    function getAllPivotResults(index, addReduceNone, dimension, cb) {
        if (index < pivotMap.length) {
            if (pivotMap[index].dimensions.length === 1 && pivotMap[index].dimensions[0] === dimension) {
                getAllPivotResults(index + 1, addReduceNone, dimension, cb);
                return;
            }

            var output = prepareQueryJSON(index, dimension);
            var query = output.query;
            var measures = output.measures;
            var i = index;
            var startTime = new Date();
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
            cb(pivotListResult);
        }
    }

    function createPivotWhereCondition(index) {
        var filterList = Object.keys(filteredDimension);
        var filterCondition = { and: [] };
        var filtersTobeApplied = [].concat(staticFilters);
        for (var i = 0; i < filterList.length; i++) {
            if (filteredDimension[filterList[i]] != null && filteredDimension[filterList[i]].filters != null && filteredDimension[filterList[i]].filters.length > 0
                    && (index == -1 || (pivotMap[index] && pivotMap[index].dimensions.length === 1 && pivotMap[index].dimensions[0] === filterList[i]) == false)) {
                filtersTobeApplied.push({ filterType: filteredDimension[filterList[i]].filterType, field: filterList[i], filters: filteredDimension[filterList[i]].filters });
            }
        }
        if (filtersTobeApplied.length > 0) {
            for (var i = 0; i < filtersTobeApplied.length; i++) {
                if (filtersTobeApplied[i].filterType === 'in') {
                    filterCondition.and.push({ field: filtersTobeApplied[i].field, operator: 'eq', value: filtersTobeApplied[i].filters });
                }
                else if (filtersTobeApplied[i].filterType === 'range') {
                    filterCondition.and.push({ field: filtersTobeApplied[i].field, operator: 'gteq', value: filtersTobeApplied[i].filters[0] });
                    filterCondition.and.push({ field: filtersTobeApplied[i].field, operator: 'lteq', value: filtersTobeApplied[i].filters[1] });
                }
                else if (filtersTobeApplied[i].filterType === 'withinAll') {
                    for (var j = 0; j < filtersTobeApplied[i].filters.length; j++) {
                        var filterJSON = [];
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'eq', value: filtersTobeApplied[i].filters[j] });
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'match', value: filtersTobeApplied[i].filters[j] + ',%' });
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'match', value: '%, ' + filtersTobeApplied[i].filters[j] });
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'match', value: '%, ' + filtersTobeApplied[i].filters[j] + ',%' });
                        filterCondition.and.push(JSON.parse(JSON.stringify({ or: filterJSON })));
                        filterJSON = null;
                    }
                }
                else if (filtersTobeApplied[i].filterType === 'withinAny') {
                    filterCondition.and.push({ or: [] });
                    for (var j = 0; j < filtersTobeApplied[i].filters.length; j++) {
                        var filterJSON = [];
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'eq', value: filtersTobeApplied[i].filters[i] });
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'match', value: filtersTobeApplied[i].filters[j] + ',%' });
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'match', value: '%, ' + filtersTobeApplied[i].filters[j] });
                        filterJSON.push({ field: filtersTobeApplied[i].field, operator: 'match', value: '%, ' + filtersTobeApplied[i].filters[j] + ',%' });
                        filterCondition.and[filterCondition.and.length - 1].or.push({ or: filterJSON });
                    }
                }
            }
        }
        if (filterCondition.and.length === 0)
            filterCondition = undefined;
        if (debug)
            console.log('actual filter: ', (filterCondition != undefined ? filterCondition.and : 'none'));
        return filterCondition;
    }

    function createToExternalDatabasePivot(query, cb) {
        queryExecutor(query, cb);
    }

    function staticFilter(filters, cb) {
        staticFilters = filters;
        for (var i = 0; i < staticFilters.length; i++) {
            staticFilters[i].filters = staticFilters[i].filters.sort();
        }
        oldResults = {};
        executePivots(0, null, cb);
    }

    function filter(filterType, dimension, values, cb) {
        values = values.sort();
        if (filteredDimension[dimension] === undefined) {
            filteredDimension[dimension] = {};
            filteredDimension[dimension].filters = [];
        }
        filteredDimension[dimension].filterType = filterType;
        var existingCondition = filteredDimension[dimension].filters;
        filteredDimension[dimension].filters = values;
        var addReduceNone = 0; //None = 0, Add = 1, Reduce = 2
        var currCondition = createPivotWhereCondition(0);
        var filterConditionIndex = oldFilterConditions.indexOf(JSON.stringify(currCondition));
        //console.log("###################  test #################", oldFilterConditions, JSON.stringify(currCondition));
        if (filterConditionIndex > -1) {
            //dont change condition
            //console.log("###################  found #################");
        }
        else {
            var newCondition = [];

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
            else {
                newCondition = values;
                addReduceNone = 0;
            }
            if (debug) {
                console.log('old filter:', filteredDimension[dimension].filters);
                console.log('original filter: ', values);
                console.log('changed  filter: ', newCondition);
                console.log('merge type: ', (addReduceNone === 0 ? 'replace' : (addReduceNone === 1 ? 'Add' : 'Reduce')));
            }
            filteredDimension[dimension].filters = newCondition;
            if (debug)
                console.log(['existingCondition', existingCondition, values, newCondition, addReduceNone]);
        }
        executePivots(addReduceNone, dimension, function (data) {
            filteredDimension[dimension].filters = values;
            updateOldResults(data, dimension, cb);
            //cb(data);
            data = null;
        });
    }

    function updateOldResults(data, dimension, cb) {
        for (var i = 0; i < pivotMap.length; i++) {
            var query = prepareQueryJSON(i, dimension);
            var queryString = objConnection.prepareQuery(query);
            oldResults[queryString] = { result: JSON.parse(JSON.stringify(data[pivotMap[i].reference])) };
        }
        cb(data);
        data = null;
    }

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
            console.log('query', JSON.stringify(query));
        var queryString = objConnection.prepareQuery(query);
        if (debug)
            console.log('queryString:\n', queryString);

        if (oldResults[queryString] != undefined) {
            cb(JSON.parse(JSON.stringify(oldResults[queryString].result)), true);
            return;
        }
        //        for (var i = 0; i < oldResults.length; i++) {
        //            if (oldResults[i].query === queryString) {
        //                cb(JSON.parse(JSON.stringify(oldResults[i].result)), true);
        //                return;
        //            }
        //        }
        cConn.query(queryString, function (err, rows, fields) {
            if (err) {
                cReq.cb({ type: 'error', data: err });
            }
            else {
                //oldResults.push({ query: queryString, result: JSON.parse(JSON.stringify(rows)) });
                oldResults[queryString] = { result: JSON.parse(JSON.stringify(rows)) };
                cb(JSON.parse(JSON.stringify(rows)), false);
            }
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
            else if (cReq.type.toLowerCase() === "filter") {
                filter(cReq.data.filterType, cReq.data.field, cReq.data.filters, function (data) {
                    cReq.cb({ type: 'data', data: data });
                    processRequestRunning = false;
                    processRequestStack();
                });
            }
            else if (cReq.type.toLowerCase() === "staticfilter") {
                staticFilter(cReq.data, function (data) {
                    cReq.cb({ type: 'data', data: data });
                    processRequestRunning = false;
                    processRequestStack();
                });
            }
            else if (cReq.type.toLowerCase() === "data") {
                var from, to;
                if (cReq.data == undefined) {
                    getData(function (data) {
                        cReq.cb({ type: 'records', data: data });
                        processRequestRunning = false;
                        processRequestStack();
                    });
                }
                else if (cReq.data.from == undefined) {
                    getData(function (data) {
                        cReq.cb({ type: 'records', data: data });
                        processRequestRunning = false;
                        processRequestStack();
                    });
                }
                else if (cReq.data.to == undefined) {
                    getData(cReq.data.from, function (data) {
                        cReq.cb({ type: 'records', data: data });
                        processRequestRunning = false;
                        processRequestStack();
                    });
                }
                else {
                    getData(cReq.data.from, cReq.data.to, function (data) {
                        cReq.cb({ type: 'records', data: data });
                        processRequestRunning = false;
                        processRequestStack();
                    });
                }
            }
            else if (cReq.type.toLowerCase() === "count") {
                getCount(function (data) {
                    cReq.cb({ type: 'count', data: data });
                    processRequestRunning = false;
                    processRequestStack();
                });
            }
            else if (cReq.type.toLowerCase() === "removepivot") {
                if (cReq.data.reference == undefined) {
                    cReq.cb({ type: 'error', data: 'reference is missing for removing pivot' });
                    processRequestRunning = false;
                    processRequestStack();
                }
                else {
                    removePivot(cReq.data.reference, function (data) {
                        cReq.cb({ type: 'data', data: data });
                        processRequestRunning = false;
                        processRequestStack();
                    });
                }
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
