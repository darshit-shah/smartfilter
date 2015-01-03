var db = require('mysql');

//connect
var fieldIdentifier_left = '`'
fieldIdentifier_right = '`';
exports.connect = function (json, cb) {
    connect(json, cb);
}
function connect(json, cb) {
    var connection = db.createConnection({
        host: json.host,
        port: json.port,
        user: json.user,
        database: json.database,
        password: json.password
    });
    connection.connect(function (err) {
        if (err) {
            console.log(['c.connect', err]);
        }
        else {
            connection.on('error', function (e) {
                console.log(['error', e]);
            });
        }
        cb(err, connection);
    });
}

//disconnect
exports.disconnect = function () {
    return disconnect(arguments[0]);
}
function disconnect(connection) {
    connection.end();
}

//prepare query
exports.prepareQuery = function () {
    return prepareQuery(arguments[0]);
}
function prepareQuery(json) {
    var table = json.table ? json.table : null;
    var select = json.select ? json.select : null
        , filter = json.filter ? json.filter : null
        , groupby = json.groupby ? json.groupby : null
        , sortby = json.sortby ? json.sortby : null
        , limit = json.limit ? json.limit : null
        , join = json.join ? json.join : null
        , having = json.having ? json.having : null;
    var arrSelect = []
    , arrFilter = []
    , arrGroupBy = []
    , arrSortBy = []
    , arrHaving = []
    , strJOIN = ''
    , objAggregation = [];

    //select
    arrSelect = createSelect(select);

    //from/join
    strJOIN = createJOIN(join);
    if (strJOIN.length > 0) {
        table = strJOIN;
    }
    else {
        table = encloseField(table);
    }

    //aggregation
    arrHaving = createAggregationFilter(having);

    //filter
    arrFilter = createFilter(filter);

    //group by
    if (groupby != null) {
        for (var g = 0; g < groupby.length; g++) {
            arrGroupBy.push(encloseField(groupby[g]));
        };
    }

    //order by
    if (sortby != null) {
        for (var s = 0; s < sortby.length; s++) {
            var field = encloseField(sortby[s].field);
            var order = sortby[s].order ? sortby[s].order : 'ASC';
            arrSortBy.push(field + ' ' + order);
        }
    }

    //build select query
    var query = 'SELECT ' + arrSelect.join();
    if (table != '') {
        query += ' FROM ' + table + '';
    }
    if (arrFilter.length > 0) {
        query += ' WHERE ' + arrFilter.join('');
    }
    if (arrGroupBy.length > 0) {
        query += ' GROUP BY ' + arrGroupBy.join();
    }
    if (arrHaving.length > 0) {
        query += ' HAVING ' + arrHaving.join('');
    }
    if (arrSortBy.length > 0) {
        query += ' ORDER BY ' + arrSortBy.join();
    }
    if (limit != null) {
        query += ' LIMIT ' + limit;
    }
    query += ';';
    return query;
}


//Create select expression
function createSelect(arr) {
    var tempArr = [];
    if (arr != null) {
        for (var s = 0; s < arr.length; s++) {
            var obj = arr[s];
            var field = encloseField(obj.field);
            var table = encloseField((obj.table ? obj.table : ''));
            var alias = encloseField((obj.alias ? obj.alias : obj.field));
            var expression = obj.expression ? obj.expression : null;
            var aggregation = obj.aggregation ? obj.aggregation : null;
            var selectText = '';
            if (expression != null) {
                var selectText = '(CASE WHEN ';
                for (var e = 0; e < expression.length; e++) {
                    var operator = expression[e].operator;
                    var value = expression[e].value;
                    var out = expression[e].out;
                    var operatorSign = '';
                    if (operator.toString().toLowerCase() == 'eq') operatorSign = '=';
                    else if (operator.toString().toLowerCase() == 'match') operatorSign = 'LIKE';
                    selectText += table + '.' + field + ' ' + operatorSign + ' "' + value + '" THEN ' + out;
                }
                selectText += ' ELSE ' + table + '.' + field + ' END)';
            }
            else {
                selectText = table + '.' + field;
            }

            if (aggregation != null) {
                selectText = aggregation + '(' + selectText + ')';
            }
            selectText += ' as ' + alias;
            tempArr.push(selectText);
            selectText = null;
        };
    }
    else {
        tempArr.push('*');
    }
    return tempArr;
}

//Create select expression
function createAggregationFilter(obj) {
    var tempHaving = [];
    if (obj != null) {
        tempHaving = createFilter(obj);
    }
    return tempHaving;
}

//Create filter conditions set
function createFilter(arr) {
    var tempArrFilter = [];
    if (arr != null) {
        if (arr.hasOwnProperty('and') || arr.hasOwnProperty('AND') || arr.hasOwnProperty('or') || arr.hasOwnProperty('OR')) {//multiple conditions
            tempArrFilter = createMultipleConditions(arr);
        }
        else {//single condition
            var conditiontext = createSingleCondition(arr);
            tempArrFilter.push(conditiontext);
        }
    }
    return tempArrFilter;
}

function createMultipleConditions(obj) {
    this.tempArrFilters = [];
    var conditionType = Object.keys(obj)[0]; //AND/OR/NONE
    if (conditionType.toString().toLowerCase() != 'none') {
        var listOfConditions = obj[conditionType]; //all conditions
        for (var c = 0; c < listOfConditions.length; c++) {
            var tempConditionType = Object.keys(listOfConditions[c])[0];
            //console.log('*************' + tempConditionType + '*******************');
            if (tempConditionType.toString().toLowerCase() == 'and' || tempConditionType.toString().toLowerCase() == 'or') {
                createMultipleConditions(listOfConditions[c]);
            }
            else if (tempConditionType.toString().toLowerCase() == 'none') {
                var conditiontext = createSingleCondition(listOfConditions[c].none);
                tempArrFilters.push(conditiontext);
            }
            else {
                var conditiontext = createSingleCondition(listOfConditions[c]);
                tempArrFilters.push(conditiontext);
            }
        }
    }
    else {//single condition
        if (listOfConditions.length > 0) {
            var conditiontext = createSingleCondition(listOfConditions.none);
            tempArrFilters.push(conditiontext);
        }
    }
    var tempConditionSet = '(' + tempArrFilters.join(' ' + conditionType + ' ') + ')';
    tempArrFilters = [];
    tempArrFilters.push(tempConditionSet);
    return tempArrFilters;
}

function encloseField(a) {
    return fieldIdentifier_left + a + fieldIdentifier_right;
}

function operatorSign(operator, value) {
    var sign = '';
    if (operator.toString().toLowerCase() == 'eq') {
        if (Object.prototype.toString.call(value) === '[object Array]') {
            sign = 'IN';
        }
        else if (typeof value == 'string') {
            if (value == null)
                sign = 'IS';
            else
                sign = '=';
        }
    }
    else if (operator.toString().toLowerCase() == 'noteq') {
        if (Object.prototype.toString.call(value) === '[object Array]') {
            sign = 'NOT IN';
        }
        else if (typeof value == 'string') {
            if (value == null)
                sign = 'IS NOT';
            else
                sign = '<>';
        }
    }
    else if (operator.toString().toLowerCase() == 'match') {
        sign = 'LIKE';
    }
    else if (operator.toString().toLowerCase() == 'notmatch') {
        sign = 'NOT LIKE';
    }
    else if (operator.toString().toLowerCase() == 'gt') {
        sign = '>';
    }
    else if (operator.toString().toLowerCase() == 'lt') {
        sign = '<';
    }
    else if (operator.toString().toLowerCase() == 'gteq') {
        sign = '>=';
    }
    else if (operator.toString().toLowerCase() == 'lteq') {
        sign = '<=';
    }
    return sign;
}

function createSingleCondition(obj) {
    var field = obj.field
    , table = obj.table ? obj.table : ''
    , aggregation = obj.aggregation ? obj.aggregation : null
    , operator = obj.operator
    , value = obj.value;

    var conditiontext = '';
    if (aggregation != null)
        conditiontext = aggregation + '(' + encloseField(table) + '.' + encloseField(field) + ')';
    else
        conditiontext = '' + encloseField(table) + '.' + encloseField(field) + '';

    var sign = operatorSign(operator, value);
    if (sign.indexOf('IN') > -1) {//IN condition has different format
        conditiontext += ' ' + sign + ' ("' + value.join('","') + '")';
    }
    else {
        conditiontext += ' ' + sign + ' "' + value + '"';
    }
    return conditiontext;
}

//create join conditions
function createJOIN(join) {
    var joinText = '';
    if (join != null) {
        var fromTbl = join.table;
        var joinwith = join.joinwith;
        joinText += encloseField(fromTbl);
        for (var j = 0; j < joinwith.length; j++) {
            var table = joinwith[j].table
            , type = joinwith[j].type ? joinwith[j].type : 'INNER'
            , joincondition = joinwith[j].joincondition;

            joinText += ' ' + type.toString().toUpperCase() + ' JOIN ' + encloseField(table) + ' ON ' + joincondition.on + ' ' + operatorSign(joincondition.operator, '') + ' ' + joincondition.value
        }
    }
    return joinText;
}


//run query
exports.execQuery = function () {
    return execQuery(arguments);
}
function execQuery() {
    var query = arguments[0][0];
    var connection = null;
    var format = null;
    if (arguments[0].length > 1) {
        format = arguments[0][2];
    }
    if (arguments[0].length > 0) {
        connection = arguments[0][1];
        //Commenting pipe and returning full JSON;
        //return connection.query(query).stream({ highWaterMark: 5 }).pipe(objectToCSV(format));
        connection.query(query, function (err, result, fields) {
            cb(arguments[0][3]);
        });
    }
    else {
        return {
            status: false,
            content: {
                result: 'Connection not specified.'
            }
        };
    }
}
/*
function objectToCSV(format) {
var stream = require('stream')
var liner = new stream.Transform({ objectMode: true })
var csv = [];
var isFirstChunk = true;
liner._transform = function (chunk, encoding, done) {
if (format == 'csv') {
var keys = Object.keys(chunk);
csv = [];
if (isFirstChunk == true) {
for (var i = 0; i < keys.length; i++) {
csv.push(keys[i]);
}
}
else {
for (var i = 0; i < keys.length; i++) {
csv.push(chunk[keys[i]]);
}
}
this.push(csv.join());
}
else if (format == 'jsonArray') {
var strChunk = '';
if (isFirstChunk == true) {
strChunk += '[' + JSON.stringify(chunk);
}
else {
strChunk += ',' + JSON.stringify(chunk);
}
this.push(strChunk);
}
else {
this.push(chunk);
}
isFirstChunk = false;
done()
}

liner._flush = function (done) {
if (format == 'jsonArray') {
this.push(']');
}
done()
}

return liner;
}
*/