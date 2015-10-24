"use strict";
function smartfilter() {
	var debug = false;
	var forceOrderBy = false;

	var tableName = "";
	var staticFilters = [];
	var filteredDimension = {};

	var pivotListResult = {};
	var pivotListFilters = {};
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
	var flush = false;
	var useAddReduce = false;

	function flushCache(cb) {
		oldResults = {};
		flush = true;
		//    var keys = Object.keys(filteredDimension);
		//    for (var i = 0; i < keys.length; i++) {
		//      filteredDimension[keys[i]].filters = [];
		//    }
		if (cb)
			cb();
	}

	function getData(from, to, cb, field) {

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
		if (field != undefined) {
			query.select = [];
			for (var i = 0; i < field.length; i++) {
				if (field[i].alias == undefined) {
					field[i].alias = field[i].key;
				}
				query.select.push({ field: field[i].key, alias: field[i].alias });
			}
		}

		createToExternalDatabasePivot(query, function (data, isCachedResult) {
			cb(data);
			data = null;
		});
	}

	function getCount(cb) {
		var filterCondition = createPivotWhereCondition(-1);
		console.log([filterCondition, tableName]);
		var query = {};
		query.table = tableName;
		if (filterCondition !== undefined) {
			query.filter = filterCondition;
		}
		query.select = [];
		query.select.push({ field: 'count(1)', alias: 'count', encloseField: false });

		createToExternalDatabasePivot(query, function (data, isCachedResult) {
			cb(data);
			data = null;
		});
	}

	function pivot(reference, dimensions, measures, allResults, cb) {
		deletePivot(reference);
		pivotMap.push({ reference: reference, dimensions: dimensions, measures: measures });
		if (allResults == true) {
			executePivots(0, null, cb);
		}
		else {
			executePivots(0, null, cb, reference);
		}
	}

	function removePivot(reference, cb) {
		deletePivot(reference);
		//executePivots(0, null, cb);
		cb("Pivot Removed");
	}

	function deletePivot(reference) {
		delete pivotListResult[reference];
		delete pivotListResultKey[reference];
		delete pivotListFilters[reference]
		for (var i = 0; i < pivotMap.length; i++) {
			if (pivotMap[i].reference == reference) {
				pivotMap.splice(i, 1);
				i--;
			}
		}
	}

	function executePivots(addReduceNone, dimension, cb, reference) {
		if (debug)
			console.log('executePivots', dimension);
		getAllPivotResults(0, addReduceNone, dimension, reference, function (data) {
			if (debug)
				console.log('executePivots', dimension, Object.keys(data.data));
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
				var caseStatement = { field: pivotMap[index].dimensions[n].values[0].key, expression: { cases: [], 'default': { value: 'unknown' } } };
				if (pivotMap[index].dimensions[n].alias != null)
					caseStatement.alias = pivotMap[index].dimensions[n].alias;
				if (pivotMap[index].dimensions[n]['default'] != null)
					caseStatement.expression['default'].value = '"' + pivotMap[index].dimensions[n]['default'] + '"';
				for (var i = 0; i < pivotMap[index].dimensions[n].values.length; i++) {
					caseStatement.expression.cases.push({ operator: pivotMap[index].dimensions[n].values[i].type, value: pivotMap[index].dimensions[n].values[i].value, out: { value: '"' + pivotMap[index].dimensions[n].values[i].display + '"' } });
				}
				query.select.push(caseStatement);
			}
			else {
				if (pivotMap[index].dimensions[n].alias == null)
					pivotMap[index].dimensions[n].alias = pivotMap[index].dimensions[n].key;
				query.select.push({ field: pivotMap[index].dimensions[n].key, alias: pivotMap[index].dimensions[n].alias, encloseField: pivotMap[index].dimensions[n].encloseField });
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
				var caseStatement = { field: pivotMap[index].dimensions[n].values[0].key, expression: { cases: [], 'default': { value: 'unknown' } } };
				if (pivotMap[index].dimensions[n]['default'] != null)
					caseStatement.expression['default'].value = '"' + pivotMap[index].dimensions[n]['default'] + '"';
				for (var i = 0; i < pivotMap[index].dimensions[n].values.length; i++) {
					caseStatement.expression.cases.push({ operator: pivotMap[index].dimensions[n].values[i].type, value: pivotMap[index].dimensions[n].values[i].value, out: { value: '"' + pivotMap[index].dimensions[n].values[i].display + '"' } });
				}
				query.groupby.push(caseStatement);
			}
			else {
				query.groupby.push({ field: pivotMap[index].dimensions[n].key, encloseField: pivotMap[index].dimensions[n].encloseField });
			}
		}
		if (forceOrderBy == true) {
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
				else {
					query.sortby.push({ field: pivotMap[index].dimensions[n].key, encloseField: pivotMap[index].dimensions[n].encloseField });
				}
			}
		}
		if (filterCondition !== undefined) {
			query.filter = filterCondition;
		}
		return { query: query, measures: measures };
	}

	function getAllPivotResults(index, addReduceNone, dimension, reference, cb) {
		if (index < pivotMap.length) {
			if (pivotMap[index].dimensions.length === 1 && (pivotMap[index].dimensions[0] === dimension || pivotMap[index].dimensions[0].key === dimension)) {
				getAllPivotResults(index + 1, addReduceNone, dimension, reference, cb);
				return;
			}

			if (reference != undefined && reference != pivotMap[index].reference) {
				getAllPivotResults(index + 1, addReduceNone, dimension, reference, cb);
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
						var aliasArr = [];
						for (var n = 0; n < pivotMap[i].dimensions.length; n++) {
							var alias = '';
							if (typeof pivotMap[i].dimensions[n] === 'string') {
								alias = pivotMap[i].dimensions[n];
							}
							else {
								if (pivotMap[i].dimensions[n].alias == undefined) {
									alias = pivotMap[i].dimensions[n].key;
								}
								else {
									alias = pivotMap[i].dimensions[n].alias;
								}
							}
							if (aliasArr.indexOf(alias) == -1) {
								aliasArr.push(alias);
								pivotMapDimensionKey.push(data[j][alias]);
							}
						}
						//var keyIndex = pivotListResultKey[pivotMap[i].dimensions.join("_$#$_")].indexOf(pivotMapDimensionKey.join("_$#$_"));
						var keyIndex = pivotListResultKey[pivotMap[i].reference].indexOf(pivotMapDimensionKey.join("_$#$_"));
						if (keyIndex === -1) {
							pivotListResult[pivotMap[i].reference].push(data[j]);
							pivotListResultKey[pivotMap[i].reference].push(pivotMapDimensionKey.join("_$#$_"));
							pivotListFilters[pivotMap[i].reference].push(query.filter);
						} else {
							var measureAlias = [];
							for (var k = 0; k < measures.length; k++) {
								if (measureAlias.indexOf(measures[k].alias) == -1) {
									pivotListResult[pivotMap[i].reference][keyIndex][measures[k].alias] += data[j][measures[k].alias];
									measureAlias.push(measures[k].alias);
								}
							}
						}
					}
				}
				//remove from existing
				else if (addReduceNone === 2) {
					for (var j = 0; j < data.length; j++) {
						var pivotMapDimensionKey = [];
						var aliasArr = [];
						for (var n = 0; n < pivotMap[i].dimensions.length; n++) {
							var alias = '';
							if (typeof pivotMap[i].dimensions[n] === 'string') {
								alias = pivotMap[i].dimensions[n];
							}
							else {
								if (pivotMap[i].dimensions[n].alias == undefined) {
									alias = pivotMap[i].dimensions[n].key;
								}
								else {
									alias = pivotMap[i].dimensions[n].alias;
								}
							}
							if (aliasArr.indexOf(alias) == -1) {
								aliasArr.push(alias);
								pivotMapDimensionKey.push(data[j][alias]);
							}
						}
						var keyIndex = pivotListResultKey[pivotMap[i].reference].indexOf(pivotMapDimensionKey.join("_$#$_"));
						if (keyIndex === -1) {
							// not possible
							throw ("node-cross-filter, reduce part could not found existing row.");
						}
						else {
							if (aliasArr.length == 1 && (pivotMap[i].dimensions[0] == dimension || pivotMap[i].dimensions[0].key == dimension)) {
								pivotListResult[pivotMap[i].reference].splice(keyIndex, 1);
								pivotListResultKey[pivotMap[i].reference].splice(keyIndex, 1);
								pivotListFilters[pivotMap[i].reference].splice(keyIndex, 1);
							}
							else {
								var measureAlias = [];
								var zeroCount = 0;
								for (var k = 0; k < measures.length; k++) {
									if (measureAlias.indexOf(measures[k].alias) == -1) {
										pivotListResult[pivotMap[i].reference][keyIndex][measures[k].alias] -= data[j][measures[k].alias];
										if (pivotListResult[pivotMap[i].reference][keyIndex][measures[k].alias] == 0) {
											zeroCount++;
										}
										measureAlias.push(measures[k].alias);
									}
								}
								if (measureAlias.length == zeroCount) {
									pivotListResult[pivotMap[i].reference].splice(keyIndex, 1);
									pivotListResultKey[pivotMap[i].reference].splice(keyIndex, 1);
									pivotListFilters[pivotMap[i].reference].splice(keyIndex, 1);
								}
							}
						}
					}
				}
				//replace entire result
				else {
					pivotListResult[pivotMap[i].reference] = data;
					pivotListFilters[pivotMap[i].reference] = [query.filter];
					pivotListResultKey[pivotMap[i].reference] = [];
					for (var j = 0; j < data.length; j++) {
						var pivotMapDimensionKey = [];
						var aliasArr = [];
						for (var n = 0; n < pivotMap[i].dimensions.length; n++) {
							var alias = '';
							if (typeof pivotMap[i].dimensions[n] === 'string') {
								alias = pivotMap[i].dimensions[n];
							}
							else {
								if (pivotMap[i].dimensions[n].alias == undefined) {
									alias = pivotMap[i].dimensions[n].key;
								}
								else {
									alias = pivotMap[i].dimensions[n].alias;
								}
							}
							if (aliasArr.indexOf(alias) == -1) {
								aliasArr.push(alias);
								pivotMapDimensionKey.push(data[j][alias]);
							}
						}
						pivotListResultKey[pivotMap[i].reference].push(pivotMapDimensionKey.join("_$#$_"));
					}
				}
				setTimeout(function () {
					getAllPivotResults(index + 1, addReduceNone, dimension, reference, cb);
				}, 1);
			});
		}
		else {
			var allFilters = [].concat(staticFilters);
			var keys = Object.keys(filteredDimension);
			for (var i = 0; i < keys.length; i++) {
				allFilters.push(filteredDimension[keys[i]]);
			}
			if (reference == undefined) {
				cb({ data: pivotListResult, filters: allFilters }); //, appliedFilters: pivotListFilters
			}
			else {
				var json = { data: {}, appliedFilters: {}, filters: [] };
				json.data[reference] = pivotListResult[reference];
				//json.appliedFilters[reference] = pivotListFilters[reference];
				json.filters = allFilters;
				cb(json);
				json = null;
			}
		}
	}

	function createPivotWhereCondition(index) {
		var filterList = Object.keys(filteredDimension);
		var filterCondition = { and: [] };
		var filtersTobeApplied = [].concat(staticFilters);
		for (var i = 0; i < filterList.length; i++) {
			if (filteredDimension[filterList[i]] != null && filteredDimension[filterList[i]].filters != null && filteredDimension[filterList[i]].filters.length > 0
				&& (index == -1 || (pivotMap[index] && pivotMap[index].dimensions.length === 1 && (pivotMap[index].dimensions[0] === filterList[i] || pivotMap[index].dimensions[0].key === filterList[i])) == false)) {
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
		flushCache();
		executePivots(0, null, cb);
	}

	function filter(filterType, dimension, values, cb) {
		if (values.length > 0 && typeof values != "string") {
			//numeric type
			if (isFinite(+values[0])) {
				values = values.sort(function (a, b) {
					return +a - +b;
				});
			}
			//date type
			else if ((new Date(values[0])).getTime() != 0) {
				values = values.sort(function (a, b) {
					return (new Date(a)).getTime() - (new Date(b)).getTime();
				});
			}
			// string types
			else if (typeof values[0] == 'string') {
				values = values.sort();
			}
			//other types
			else {
				// do nothing
			}
		}
		//values = values.sort();
		if (filteredDimension[dimension] === undefined) {
			filteredDimension[dimension] = {};
			filteredDimension[dimension].field = dimension;
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
			else if (flush === true || useAddReduce === false) {
				newCondition = values;
			}
			else if (filterType === 'range') {
				if (values.length === 2) {
					//left  is same
					if (existingCondition.length === 2 && existingCondition[0] === values[0]) {
						// number type
						if (isFinite(+existingCondition[1])) {
							// added
							if (+existingCondition[1] <= +values[1]) {
								newCondition[0] = +existingCondition[1] + 0.0000000001;
								newCondition[1] = +values[1];
								addReduceNone = 1;
							}
							//reduced
							else {
								newCondition[0] = +values[1] + 0.0000000001;
								newCondition[1] = +existingCondition[1];
								addReduceNone = 2;
							}
						}
						//date type
						else if ((new Date(existingCondition[1])).getTime() != 0) {
							// added
							if (new Date(existingCondition[1]) <= new Date(values[1])) {
								var dt = new Date(existingCondition[1]);
								dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
								if (dt.getSeconds() == 0) {
									dt.setDate(dt.getDate() + 1);
									newCondition[0] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
								}
								else {
									dt.setMilliseconds(dt.getMilliseconds() + 1);
									newCondition[0] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
								}
								newCondition[1] = values[1];
								addReduceNone = 1;
							}
							//reduced
							else {
								var dt = new Date(values[1]);
								dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
								if (dt.getSeconds() == 0) {
									dt.setDate(dt.getDate() + 1);
									newCondition[0] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
								}
								else {
									dt.setMilliseconds(dt.getMilliseconds() + 1);
									newCondition[0] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
								}
								newCondition[1] = existingCondition[1];
								//console.log(values, existingCondition, newCondition);
								//process.exit(0);
								addReduceNone = 2;
							}
						}
						//other type
						else {
							newCondition[0] = values[0];
							newCondition[1] = values[1];
						}
					}
					//right is same
					else if (existingCondition.length === 2 && existingCondition[1] === values[1]) {
						//number type
						if (isFinite(+existingCondition[0])) {
							// added
							if (+values[0] <= +existingCondition[0]) {
								newCondition[0] = +values[0];
								newCondition[1] = +existingCondition[0] - 0.0000000001;
								addReduceNone = 1;
							}
							//reduced
							else {
								newCondition[0] = +existingCondition[0];
								newCondition[1] = +values[0] - 0.0000000001;
								addReduceNone = 2;
							}
						}
						//date type
						else if ((new Date(existingCondition[0])).getTime() != 0) {
							if (new Date(values[0]) <= new Date(existingCondition[0])) {
								newCondition[0] = values[0];
								var dt = new Date(existingCondition[0]);
								dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
								if (dt.getSeconds() == 0) {
									dt.setDate(dt.getDate() - 1);
									newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
								}
								else {
									dt.setMilliseconds(dt.getMilliseconds() - 1);
									newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
								}
								addReduceNone = 1;
							}
							else {
								newCondition[0] = existingCondition[0];
								var dt = new Date(values[0]);
								dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
								if (dt.getSeconds() == 0) {
									dt.setDate(dt.getDate() - 1);
									newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
								}
								else {
									dt.setMilliseconds(dt.getMilliseconds() - 1);
									newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
								}
								addReduceNone = 2;
							}
						}
						//other type
						else {
							newCondition[0] = values[0];
							newCondition[1] = values[1];
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
			flush = false;
			data = null;
		});
	}

	function updateOldResults(data, dimension, cb) {
		for (var i = 0; i < pivotMap.length; i++) {
			var query = prepareQueryJSON(i, dimension);
			var queryString = objConnection.prepareQuery(query);
			oldResults[queryString] = { result: JSON.parse(JSON.stringify(data.data[pivotMap[i].reference])) };
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
					data.type = 'data';
					if (cReq.data.reference) {
						data.reference = cReq.data.reference;
					}
					cReq.cb(data);
					processRequestRunning = false;
					processRequestStack();
				});
			}
			else if (cReq.type.toLowerCase() === "staticfilter") {
				staticFilter(cReq.data, function (data) {
					data.type = 'data';
					if (cReq.data.reference) {
						data.reference = cReq.data.reference;
					}
					cReq.cb(data);
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
					}, cReq.data.field);
				}
				else if (cReq.data.to == undefined) {
					getData(cReq.data.from, function (data) {
						cReq.cb({ type: 'records', data: data });
						processRequestRunning = false;
						processRequestStack();
					}, cReq.data.field);
				}
				else {
					getData(cReq.data.from, cReq.data.to, function (data) {
						cReq.cb({ type: 'records', data: data });
						processRequestRunning = false;
						processRequestStack();
					}, cReq.data.field);
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
					pivot(cReq.data.reference, cReq.data.dimensions, cReq.data.measures, cReq.data.allResults, function (data) {
						data.type = 'data';
						cReq.cb(data);
						processRequestRunning = false;
						processRequestStack();
					});
				}
			}
			else if (cReq.type.toLowerCase() === "flushcache") {
				flushCache();
				var data = {};
				data.type = 'data';
				cReq.cb(data);
				processRequestRunning = false;
				processRequestStack();
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
