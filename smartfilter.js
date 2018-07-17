"use strict";
var executionEngine = require('node-database-executor');
var utils = require('axiom-utils');
var async = require('async');

function smartfilter() {
  var debug = false;
  var forceOrderBy = false;
  var InstanceMap = {}
  var myRequestStack = [];
  var processRequestRunning = false;
  var cReq = null;
  var lastError = null;

  function flushCache(instance, cb) { // 
    if (InstanceMap[instance].shouldCacheResults) {
      executionEngine.flushCache(InstanceMap[instance].dbConfig, InstanceMap[instance].tableName);
    }
    executePivots(instance, 0, null, cb);
  }


  /**
   * [getData description]
   * @param  {Number | Function}   from     [description]
   * @param  {Number | Function}   to       [description]
   * @param  {Function} cb       [description]
   * @param  {String}   field    [description]
   * @param  {String}   instance [description]
   * @param  {Array}   sort     expects  keys field and/or order (refer node-db-connectors for syntax)
   */
  function getData(from, to, cb, field, instance, sortBy) {
    if (typeof from === 'function') {
      cb = from;
      to = undefined;
      from = undefined;
    } else if (typeof to === 'function') {
      cb = to;
      to = from;
      from = 0;
    }

    var filterCondition = createPivotWhereCondition(-1, instance);

    var query = {};
    if (filterCondition !== undefined) {
      query.filter = filterCondition;
    }
    if (from != undefined) {
      query.limit = from + "," + to;
    }
    query.select = [];
    if (field != undefined) {
      if (typeof field == 'string') {
        field = [field];
      }
      for (var i = 0; i < field.length; i++) {
        //console.log(field)
        if (typeof field[i] == 'string') {
          field[i] = { key: field[i] };
        }
        if (field[i].alias == undefined) {
          field[i].alias = field[i].key;
        }
        query.select.push({
          field: field[i].key,
          alias: field[i].alias
        });
      }
    }
    if (sortBy != undefined && Array.isArray(sortBy) && sortBy.length > 0) {
      query.sortby = sortBy
    }
    var tableName = InstanceMap[instance].tableName;
    var dbConfig = InstanceMap[instance].dbConfig;
    var shouldCacheResults = InstanceMap[instance].shouldCacheResults;
    createToExternalDatabasePivot(dbConfig, tableName, shouldCacheResults, query, function(data, isCachedResult) {
      cb(data);
      data = null;
    });
  }

  function getCount(instance, cb) {
    var filterCondition = createPivotWhereCondition(-1, instance);
    // console.log([filterCondition]);
    var query = {};
    if (filterCondition !== undefined) {
      query.filter = filterCondition;
    }
    query.select = [];
    query.select.push({
      field: 'count(1)',
      alias: 'count',
      encloseField: false
    });

    var tableName = InstanceMap[instance].tableName;
    var dbConfig = InstanceMap[instance].dbConfig;
    var shouldCacheResults = InstanceMap[instance].shouldCacheResults;
    createToExternalDatabasePivot(dbConfig, tableName, shouldCacheResults, query, function(data, isCachedResult) {
      cb(data);
      data = null;
    });
  }

  function pivot(instance, reference, dimensions, measures, allResults, sortBy, cb) {
    if (!InstanceMap.hasOwnProperty(instance)) {
      cb({ type: 'error', error: { message: 'InstanceRefernce not found' } })

    } else {
      deletePivot(instance, reference);
      InstanceMap[instance].pivotMap.push({
        reference: reference,
        dimensions: dimensions,
        measures: measures,
        sortBy: sortBy
      });


      if (allResults == true) {
        executePivots(instance, 0, null, cb);
      } else {
        executePivots(instance, 0, null, cb, reference);
      }
    }


  }

  function removePivot(instance, reference, cb) {
    if (InstanceMap.hasOwnProperty(instance)) {
      deletePivot(instance, reference);
    }
    cb("Pivot Removed");

  }

  function deletePivot(instance, reference) {
    if (InstanceMap.hasOwnProperty(instance)) {
      InstanceMap[instance].pivotListResult[reference] ? delete InstanceMap[instance].pivotListResult[reference] : "";
      InstanceMap[instance].pivotListResultKey[reference] ? delete InstanceMap[instance].pivotListResultKey[reference] : "";
      InstanceMap[instance].pivotListFilters[reference] ? delete InstanceMap[instance].pivotListFilters[reference] : "";
      for (var i = 0; i < InstanceMap[instance].pivotMap.length > 0 && InstanceMap[instance].pivotMap.length; i++) {
        if (InstanceMap[instance].pivotMap[i].reference == reference) {
          InstanceMap[instance].pivotMap.splice(i, 1);
          i--;
        }
      }
    }
  }

  function executePivots(instance, addReduceNone, dimension, cb, reference) {
    if (debug)
      console.log('executePivots', dimension);
    getAllPivotResults(0, addReduceNone, dimension, reference, instance, function(data) {
      if (debug)
        console.log('executePivots', dimension, Object.keys(data.data));
      // console.log("******** PivotMap *********", JSON.stringify(InstanceMap[instance].pivotMap))
      // console.log("******** filteredDimension *********", JSON.stringify(InstanceMap[instance].filteredDimension))
      // console.log("******** pivotListResult *********", JSON.stringify(InstanceMap[instance].pivotListResult))
      // console.log("******** pivotListResultKey *********", JSON.stringify(InstanceMap[instance].pivotListResultKey))
      // console.log("******** pivotListFilters *********", JSON.stringify(InstanceMap[instance].pivotListFilters))
      cb(data);
      data = null;
    });
  }

  function prepareQueryJSON(instance, index, dimension) {
    var filterCondition = createPivotWhereCondition(index, instance);
    if (InstanceMap[instance].oldFilterConditions.indexOf(JSON.stringify(filterCondition)) == -1)
      InstanceMap[instance].oldFilterConditions.push(JSON.stringify(filterCondition));
    //var i = index;
    //var startTime = new Date().getTime();
    if (debug)
      console.log('Querying for for dimension \'' + InstanceMap[instance].pivotMap[index].dimensions + '\'');
    var query = {};
    query.select = [];
    for (var n = 0; n < InstanceMap[instance].pivotMap[index].dimensions.length; n++) {
      if (typeof InstanceMap[instance].pivotMap[index].dimensions[n] === "string") {
        if (InstanceMap[instance].pivotMap[index].dimensions[n] !== "") {
          query.select.push({
            field: InstanceMap[instance].pivotMap[index].dimensions[n],
            alias: InstanceMap[instance].pivotMap[index].dimensions[n]
          });
        }
      } else if (Array.isArray(InstanceMap[instance].pivotMap[index].dimensions[n].values)) {
        var caseStatement = {
          field: InstanceMap[instance].pivotMap[index].dimensions[n].values[0].key,
          expression: {
            cases: [],
            'default': {
              value: 'unknown'
            }
          }
        };
        if (InstanceMap[instance].pivotMap[index].dimensions[n].alias != null)
          caseStatement.alias = InstanceMap[instance].pivotMap[index].dimensions[n].alias;
        if (InstanceMap[instance].pivotMap[index].dimensions[n]['default'] != null)
          caseStatement.expression['default'].value = '"' + InstanceMap[instance].pivotMap[index].dimensions[n]['default'] + '"';
        for (var i = 0; i < InstanceMap[instance].pivotMap[index].dimensions[n].values.length; i++) {
          caseStatement.expression.cases.push({
            operator: InstanceMap[instance].pivotMap[index].dimensions[n].values[i].type,
            value: InstanceMap[instance].pivotMap[index].dimensions[n].values[i].value,
            out: {
              value: '"' + InstanceMap[instance].pivotMap[index].dimensions[n].values[i].display + '"'
            }
          });
        }
        query.select.push(caseStatement);
      } else {
        if (InstanceMap[instance].pivotMap[index].dimensions[n].alias == null)
          InstanceMap[instance].pivotMap[index].dimensions[n].alias = InstanceMap[instance].pivotMap[index].dimensions[n].key;
        query.select.push({
          field: InstanceMap[instance].pivotMap[index].dimensions[n].key,
          alias: InstanceMap[instance].pivotMap[index].dimensions[n].alias,
          encloseField: InstanceMap[instance].pivotMap[index].dimensions[n].encloseField
        });
      }
    }
    var measures = InstanceMap[instance].pivotMap[index].measures;
    for (var j = 0; j < measures.length; j++) {
      if (measures[j].alias === undefined)
        measures[j].alias = measures[j].aggregation + '(' + measures[j].key + ')';
      if (measures[j].key !== "")
        query.select.push({
          field: measures[j].key,
          aggregation: measures[j].aggregation,
          alias: measures[j].alias,
          encloseField: measures[j].encloseField
        });
      else
        query.select.push({
          field: 'pk_ID',
          aggregation: measures[j].aggregation,
          alias: measures[j].alias
        });
    }
    query.groupby = [];
    for (var n = 0; n < InstanceMap[instance].pivotMap[index].dimensions.length; n++) {
      if (typeof InstanceMap[instance].pivotMap[index].dimensions[n] === "string") {
        if (InstanceMap[instance].pivotMap[index].dimensions[n] !== "") {
          query.groupby.push({
            field: InstanceMap[instance].pivotMap[index].dimensions[n]
          });
        }
      } else if (Array.isArray(InstanceMap[instance].pivotMap[index].dimensions[n].values)) {
        var caseStatement = {
          field: InstanceMap[instance].pivotMap[index].dimensions[n].values[0].key,
          expression: {
            cases: [],
            'default': {
              value: 'unknown'
            }
          }
        };
        if (InstanceMap[instance].pivotMap[index].dimensions[n]['default'] != null)
          caseStatement.expression['default'].value = '"' + InstanceMap[instance].pivotMap[index].dimensions[n]['default'] + '"';
        for (var i = 0; i < InstanceMap[instance].pivotMap[index].dimensions[n].values.length; i++) {
          caseStatement.expression.cases.push({
            operator: InstanceMap[instance].pivotMap[index].dimensions[n].values[i].type,
            value: InstanceMap[instance].pivotMap[index].dimensions[n].values[i].value,
            out: {
              value: '"' + InstanceMap[instance].pivotMap[index].dimensions[n].values[i].display + '"'
            }
          });
        }
        query.groupby.push(caseStatement);
      } else {
        query.groupby.push({
          field: InstanceMap[instance].pivotMap[index].dimensions[n].key,
          encloseField: InstanceMap[instance].pivotMap[index].dimensions[n].encloseField
        });
      }
    }
    if (forceOrderBy == true) {
      query.sortby = [];
      for (var n = 0; n < InstanceMap[instance].pivotMap[index].dimensions.length; n++) {
        if (typeof InstanceMap[instance].pivotMap[index].dimensions[n] === "string") {
          if (InstanceMap[instance].pivotMap[index].dimensions[n] !== "") {
            query.sortby.push({
              field: InstanceMap[instance].pivotMap[index].dimensions[n],
              order: 'asc'
            });
          }
        } else if (Array.isArray(InstanceMap[instance].pivotMap[index].dimensions[n].values)) {
          query.sortby.push({
            field: InstanceMap[instance].pivotMap[index].dimensions[n].alias,
            order: 'asc'
          });
        } else {
          query.sortby.push({
            field: InstanceMap[instance].pivotMap[index].dimensions[n].key,
            encloseField: InstanceMap[instance].pivotMap[index].dimensions[n].encloseField
          });
        }
      }
    }
    var sortBy = InstanceMap[instance].pivotMap[index].sortBy;
    if (sortBy != undefined && sortBy.length > 0) {
      query.sortby = query.hasOwnProperty('sortby') ? query.sortby : [];

      if (typeof InstanceMap[instance].pivotMap[index].sortBy === "string") {
        InstanceMap[instance].pivotMap[index].sortBy = InstanceMap[instance].pivotMap[index].sortBy.split(",")
      }
      if (Array.isArray(InstanceMap[instance].pivotMap[index].sortBy)) {
        InstanceMap[instance].pivotMap[index].sortBy.forEach(function(e, i) {
          query.sortby.push({
            field: typeof e == "string" ? e : e.field,
            order: typeof e == "string" ? 'asc' : e.order,
            encloseField: e == "string" ? undefined : e.encloseField
          })
        });
      }
    }
    if (filterCondition !== undefined) {
      query.filter = filterCondition;
    }
    return {
      query: query,
      measures: measures
    };
  }

  function getAllPivotResults(index, addReduceNone, dimension, reference, instance, cb) {
    // console.log(InstanceMap, instance)
    if (index < InstanceMap[instance].pivotMap.length) {
      if (InstanceMap[instance].pivotMap[index].dimensions.length === 1 && (InstanceMap[instance].pivotMap[index].dimensions[0] === dimension || InstanceMap[instance].pivotMap[index].dimensions[0].key === dimension)) {
        getAllPivotResults(index + 1, addReduceNone, dimension, reference, instance, cb);
        return;
      }

      if (reference != undefined && reference != InstanceMap[instance].pivotMap[index].reference) {
        getAllPivotResults(index + 1, addReduceNone, dimension, reference, instance, cb);
        return;
      }

      var output = prepareQueryJSON(instance, index, dimension);
      var query = output.query;
      var measures = output.measures;
      var i = index;
      var startTime = new Date();
      var tableName = InstanceMap[instance].tableName;
      var dbConfig = InstanceMap[instance].dbConfig;
      var shouldCacheResults = InstanceMap[instance].shouldCacheResults;
      createToExternalDatabasePivot(dbConfig, tableName, shouldCacheResults, query, function(data, isCachedResult) {
        if (debug) {
          console.log(data.length + ' rows Returned for dimensions \'' + InstanceMap[instance].pivotMap[i].dimensions + '\' in ' + (new Date().getTime() - startTime) / 1000 + ' seconds from ' + (isCachedResult ? 'memory' : 'db') + '. addReduceNone: ' + addReduceNone);
        }


        //add to existing
        if (addReduceNone === 1) {
          for (var j = 0; j < data.length; j++) {
            var pivotMapDimensionKey = [];
            for (var n = 0; n < InstanceMap[instance].pivotMap[i].dimensions.length; n++) {
              if (typeof InstanceMap[instance].pivotMap[index].dimensions[n] === "string") {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n]]);
              } else if (typeof InstanceMap[instance].pivotMap[index].dimensions[n].alias != undefined) {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n].alias]);
              } else {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n].key]);
              }
            }
            //var keyIndex = pivotListResultKey[pivotMap[i].dimensions.join("_$#$_")].indexOf(pivotMapDimensionKey.join("_$#$_"));
            var keyIndex = InstanceMap[instance].pivotListResultKey[InstanceMap[instance].pivotMap[i].reference].indexOf(pivotMapDimensionKey.join("_$#$_"));
            if (keyIndex === -1) {
              InstanceMap[instance].pivotListResult[InstanceMap[instance].pivotMap[i].reference].push(data[j]);
              InstanceMap[instance].pivotListResultKey[InstanceMap[instance].pivotMap[i].reference].push(pivotMapDimensionKey.join("_$#$_"));
              InstanceMap[instance].pivotListFilters[InstanceMap[instance].pivotMap[i].reference].push(query.filter);
            } else {

              for (var k = 0; k < measures.length; k++) {
                InstanceMap[instance].pivotListResult[InstanceMap[instance].pivotMap[i].reference][keyIndex][measures[k].alias] += data[j][measures[k].alias];
              }
            }
          }
        }
        //remove from existing
        else if (addReduceNone === 2) {
          for (var j = 0; j < data.length; j++) {
            var pivotMapDimensionKey = [];
            for (var n = 0; n < InstanceMap[instance].pivotMap[i].dimensions.length; n++) {
              if (typeof InstanceMap[instance].pivotMap[index].dimensions[n] === "string") {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n]]);
              } else if (typeof InstanceMap[instance].pivotMap[index].dimensions[n].alias != undefined) {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n].alias]);
              } else {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n].key]);
              }
            }
            var keyIndex = InstanceMap[instance].pivotListResultKey[InstanceMap[instance].pivotMap[i].reference].indexOf(pivotMapDimensionKey.join("_$#$_"));
            if (keyIndex === -1) {
              // not possible
              throw ("node-cross-filter, reduce part could not found existing row.");
            } else {

              if (InstanceMap[instance].pivotMap[i].dimensions.length === 1 && InstanceMap[instance].pivotMap[i].dimensions[0] === dimension) {
                InstanceMap[instance].pivotListResult[InstanceMap[instance].pivotMap[i].reference].splice(keyIndex, 1);
                InstanceMap[instance].pivotListResultKey[InstanceMap[instance].pivotMap[i].reference].splice(keyIndex, 1);
                InstanceMap[instance].pivotListFilters[InstanceMap[instance].pivotMap[i].reference].splice(keyIndex, 1);
              } else {
                for (var k = 0; k < measures.length; k++) {
                  InstanceMap[instance].pivotListResult[InstanceMap[instance].pivotMap[i].reference][keyIndex][measures[k].alias] -= data[j][measures[k].alias];
                }
              }
            }
          }
        }
        //replace entire result
        else {
          // if (InstanceMap[instance].smartDecision) {


          InstanceMap[instance].pivotListResult[InstanceMap[instance].pivotMap[i].reference] = data;
          InstanceMap[instance].pivotListFilters[InstanceMap[instance].pivotMap[i].reference] = [query.filter];
          InstanceMap[instance].pivotListResultKey[InstanceMap[instance].pivotMap[i].reference] = [];
          for (var j = 0; j < data.length; j++) {
            var pivotMapDimensionKey = [];
            for (var n = 0; n < InstanceMap[instance].pivotMap[i].dimensions.length; n++) {
              if (typeof InstanceMap[instance].pivotMap[index].dimensions[n] === "string") {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n]]);
              } else if (typeof InstanceMap[instance].pivotMap[index].dimensions[n].alias != undefined) {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n].alias]);
              } else {
                pivotMapDimensionKey.push(data[j][InstanceMap[instance].pivotMap[i].dimensions[n].key]);
              }
            }
            InstanceMap[instance].pivotListResultKey[InstanceMap[instance].pivotMap[i].reference].push(pivotMapDimensionKey.join("_$#$_"));
          }
          // }
        }
        setTimeout(function() {
          getAllPivotResults(index + 1, addReduceNone, dimension, reference, instance, cb);
        }, 1);
      });
    } else {
      var allFilters = [].concat(InstanceMap[instance].staticFilters);
      var keys = Object.keys(InstanceMap[instance].filteredDimension);
      for (var i = 0; i < keys.length; i++) {
        allFilters.push(InstanceMap[instance].filteredDimension[keys[i]]);
      }
      if (reference == undefined) {
        cb({
          data: InstanceMap[instance].pivotListResult,
          filters: allFilters
        }); //, appliedFilters: pivotListFilters
      } else {
        var json = {
          data: {},
          appliedFilters: {},
          filters: []
        };
        json.data[reference] = InstanceMap[instance].pivotListResult[reference];
        //json.appliedFilters[reference] = pivotListFilters[reference];
        json.filters = allFilters;
        cb(json);
        json = null;
      }
    }
  }

  function createPivotWhereCondition(index, instance) {
    //console.log(InstanceMap[instance], instance, "create pivot condition---------------")
    var filterList = Object.keys(InstanceMap[instance].filteredDimension);
    var filterCondition = {
      and: []
    };
    var filtersTobeApplied = [].concat(InstanceMap[instance].staticFilters);
    for (var i = 0; i < filterList.length; i++) {
      if (InstanceMap[instance].filteredDimension[filterList[i]] != null && InstanceMap[instance].filteredDimension[filterList[i]].filters != null && InstanceMap[instance].filteredDimension[filterList[i]].filters.length > 0 && (index == -1 || (InstanceMap[instance].pivotMap[index] && InstanceMap[instance].pivotMap[index].dimensions.length === 1 && (InstanceMap[instance].pivotMap[index].dimensions[0] === filterList[i] || InstanceMap[instance].pivotMap[index].dimensions[0].key === filterList[i])) == false)) {
        filtersTobeApplied.push({
          filterType: InstanceMap[instance].filteredDimension[filterList[i]].filterType,
          field: filterList[i],
          filters: InstanceMap[instance].filteredDimension[filterList[i]].filters,
          encloseField: InstanceMap[instance].filteredDimension[filterList[i]].encloseField
        });
      }
    }
    if (filtersTobeApplied.length > 0) {
      for (var i = 0; i < filtersTobeApplied.length; i++) {
        if (filtersTobeApplied[i].filterType === 'in') {
          filterCondition.and.push({
            field: filtersTobeApplied[i].field,
            operator: 'eq',
            value: filtersTobeApplied[i].filters,
            encloseField: filtersTobeApplied[i].encloseField
          });
        } else if (filtersTobeApplied[i].filterType === 'range') {
          filterCondition.and.push({
            field: filtersTobeApplied[i].field,
            operator: 'gteq',
            value: filtersTobeApplied[i].filters[0],
            encloseField: filtersTobeApplied[i].encloseField
          });
          filterCondition.and.push({
            field: filtersTobeApplied[i].field,
            operator: 'lteq',
            value: filtersTobeApplied[i].filters[1],
            encloseField: filtersTobeApplied[i].encloseField
          });
        } else if (filtersTobeApplied[i].filterType === 'withinAll') {
          for (var j = 0; j < filtersTobeApplied[i].filters.length; j++) {
            var filterJSON = [];
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'eq',
              value: filtersTobeApplied[i].filters[j],
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'match',
              value: filtersTobeApplied[i].filters[j] + ',%',
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'match',
              value: '%,' + filtersTobeApplied[i].filters[j],
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'match',
              value: '%,' + filtersTobeApplied[i].filters[j] + ',%',
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterCondition.and.push(JSON.parse(JSON.stringify({
              or: filterJSON
            })));
            filterJSON = null;
          }
        } else if (filtersTobeApplied[i].filterType === 'withinAny') {
          filterCondition.and.push({
            or: []
          });
          for (var j = 0; j < filtersTobeApplied[i].filters.length; j++) {
            var filterJSON = [];
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'eq',
              value: filtersTobeApplied[i].filters[j],
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'match',
              value: filtersTobeApplied[i].filters[j] + ',%',
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'match',
              value: '%,' + filtersTobeApplied[i].filters[j],
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterJSON.push({
              field: filtersTobeApplied[i].field,
              operator: 'match',
              value: '%,' + filtersTobeApplied[i].filters[j] + ',%',
              encloseField: filtersTobeApplied[i].encloseField
            });
            filterCondition.and[filterCondition.and.length - 1].or.push({
              or: filterJSON
            });
          }
        } else if (filtersTobeApplied[i].encloseField == false) {
          filterCondition.and.push({
            field: filtersTobeApplied[i].field,
            encloseField: false
          });
        }
      }
    }
    if (filterCondition.and.length === 0)
      filterCondition = undefined;
    if (debug)
      console.log('actual filter: ', (filterCondition != undefined ? filterCondition.and : 'none'));
    return filterCondition;
  }

  function createToExternalDatabasePivot(dbConfig, tableName, shouldCacheResults, query, cb) {
    query.table = tableName;
    executionEngine.executeQuery({
      query: query,
      dbConfig: dbConfig,
      shouldCache: shouldCacheResults,
    }, function(output) {
      if (output.status == false) {
        cReq.cb({ type: 'error', data: output });
        lastError = output;
        processRequestRunning = false;
        processRequestStack();
      } else {
        cb(JSON.parse(JSON.stringify(output.content)), false);

      }
    });
  }

  function staticFilter(filters, instance, cb) {
    InstanceMap[instance].staticFilters = filters;
    for (var i = 0; i < InstanceMap[instance].staticFilters.length; i++) {
      if (InstanceMap[instance].staticFilters[i].filters != undefined)
        InstanceMap[instance].staticFilters[i].filters = InstanceMap[instance].staticFilters[i].filters.sort();
    }
    var keys = Object.keys(InstanceMap[instance].filteredDimension);
    for (var i = 0; i < keys.length; i++) {
      InstanceMap[instance].filteredDimension[keys[i]].filters = [];
    }
    executePivots(instance, 0, null, cb);
    // flushCache(instance, cb);
  }

  function filter(filterType, dimension, values, instance, cb) {
    if (values.length > 0 && typeof values != "string") {
      //numeric type
      if (isFinite(+values[0])) {
        values = values.sort(function(a, b) {
          return +a - +b;
        });
      }
      //date type
      else if ((new Date(values[0])).getTime() != 0) {
        values = values.sort(function(a, b) {
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

    if (InstanceMap.hasOwnProperty(instance)) {
      if (InstanceMap[instance].filteredDimension[dimension] === undefined) {
        InstanceMap[instance].filteredDimension[dimension] = {};
        InstanceMap[instance].filteredDimension[dimension].field = dimension;
        InstanceMap[instance].filteredDimension[dimension].filters = [];
      }
      InstanceMap[instance].filteredDimension[dimension].filterType = filterType;

      //values = values.sort();
      if (InstanceMap[instance].smartDecision == true) {
        var addReduceNone = optimizeFilters(instance, filterType, dimension, values)
      } else {

        InstanceMap[instance].filteredDimension[dimension].filters = values;

      }
      executePivots(instance, InstanceMap[instance].smartDecision ? addReduceNone : 0, dimension, function(data) {
        InstanceMap[instance].filteredDimension[dimension].filters = values;


        cb(data);
        data = null;
      });
    } else {
      cb({ type: 'error', message: 'instanceReference not found' })
    }

  }


  function optimizeFilters(instance, filterType, dimension, values) {

    var existingCondition = InstanceMap[instance].filteredDimension[dimension].filters;
    InstanceMap[instance].filteredDimension[dimension].filters = values;
    var addReduceNone = 0; //None = 0, Add = 1, Reduce = 2
    var currCondition = createPivotWhereCondition(0, instance);
    var filterConditionIndex = InstanceMap[instance].oldFilterConditions.indexOf(JSON.stringify(currCondition));
    // console.log("###################  test #################", InstanceMap[instance].oldFilterConditions, JSON.stringify(currCondition),JSON.stringify(existingCondition));
    if (filterConditionIndex > -1) {
      //dont change condition
      //console.log("###################  found #################");
    } else {
      var newCondition = [];

      if (typeof values === "string") {
        newCondition = [values];
      } else if (filterType === 'range') {
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
                } else {
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
                } else {
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
                } else {
                  dt.setMilliseconds(dt.getMilliseconds() - 1);
                  newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + ' ' + dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
                }
                addReduceNone = 1;
              } else {
                newCondition[0] = existingCondition[0];
                var dt = new Date(values[0]);
                dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset());
                if (dt.getSeconds() == 0) {
                  dt.setDate(dt.getDate() - 1);
                  newCondition[1] = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
                } else {
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
      } else if (filterType === 'in') {
        //first time filter
        if (existingCondition.length === 0) {
          newCondition = values;
          addReduceNone = 0;
        } else {
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
                } else {
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
              } else {
                newCondition = values;
                addReduceNone = 0;
              }
            } else {
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
              } else {
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
            } else {
              newCondition = values;
              addReduceNone = 0;
            }
          }
        }
      } else {
        newCondition = values;
        addReduceNone = 0;
      }
      if (debug) {
        console.log('old filter:', InstanceMap[instance].filteredDimension[dimension].filters);
        console.log('original filter: ', values);
        console.log('changed  filter: ', newCondition);
        console.log('merge type: ', (addReduceNone === 0 ? 'replace' : (addReduceNone === 1 ? 'Add' : 'Reduce')));
      }
      InstanceMap[instance].filteredDimension[dimension].filters = newCondition;
      if (debug)
        console.log(['existingCondition', existingCondition, values, newCondition, addReduceNone]);
    }
    return addReduceNone;
  }



  function connect(tblName, config, smartDecision, shouldCacheResults, cb) {

    var ref = utils.uuid();
    InstanceMap[ref] = {
      staticFilters: [],
      filteredDimension: {},
      pivotListResult: {},
      pivotListFilters: {},
      pivotListResultKey: {},
      oldFilterConditions: [],
      smartDecision: smartDecision,
      shouldCacheResults: shouldCacheResults,
      tableName: tblName,
      dbConfig: config,
      pivotMap: [],
    }
    cb({ status: true, content: ref })

  }


  function processRequestStack() {

    cReq = null;
    if (myRequestStack.length > 0) {
      processRequestRunning = true;
      cReq = myRequestStack.shift();
      if (debug)
        console.log('processing request:', cReq);
      if (cReq.type.toLowerCase() === "connect") {

        connect(cReq.data.tableName, cReq.data.dbConfig, cReq.makeSmartDecision, cReq.shouldCacheResults, function(data) {
          cReq.cb(data)
          processRequestRunning = false;
          processRequestStack();
        });
      } else if (cReq.type.toLowerCase() === "filter") {
        filter(cReq.data.filterType, cReq.data.field, cReq.data.filters, cReq.instanceReference, function(data) {
          data.type = 'data';
          if (cReq.data.reference) {
            data.reference = cReq.data.reference;
          }
          cReq.cb(data);
          processRequestRunning = false;
          processRequestStack();
        });
      } else if (cReq.type.toLowerCase() === "staticfilter") {
        staticFilter(cReq.data, cReq.instanceReference, function(data) {
          data.type = 'data';
          if (cReq.data.reference) {
            data.reference = cReq.data.reference;
          }
          cReq.cb(data);
          processRequestRunning = false;
          processRequestStack();
        });
      } else if (cReq.type.toLowerCase() === "data") {
        var from, to;
        if (cReq.data == undefined) {
          getData(undefined, undefined, function(data) {
            cReq.cb({
              type: 'records',
              data: data
            });
            processRequestRunning = false;
            processRequestStack();
          }, undefined, cReq.instanceReference, cReq.data.sortBy);
        } else if (cReq.data.from == undefined) {
          getData(undefined, undefined, function(data) {
            cReq.cb({
              type: 'records',
              data: data
            });
            processRequestRunning = false;
            processRequestStack();
          }, cReq.data.field, cReq.instanceReference, cReq.data.sortBy);
        } else if (cReq.data.to == undefined) {
          getData(cReq.data.from, undefined, function(data) {
            cReq.cb({
              type: 'records',
              data: data
            });
            processRequestRunning = false;
            processRequestStack();
          }, cReq.data.field, cReq.instanceReference, cReq.data.sortBy);
        } else {
          getData(cReq.data.from, cReq.data.to, function(data) {
            cReq.cb({
              type: 'records',
              data: data
            });
            processRequestRunning = false;
            processRequestStack();
          }, cReq.data.field, cReq.instanceReference, cReq.data.sortBy);
        }
      } else if (cReq.type.toLowerCase() === "count") {
        getCount(cReq.instanceReference, function(data) {
          cReq.cb({
            type: 'count',
            data: data
          });
          processRequestRunning = false;
          processRequestStack();
        });
      } else if (cReq.type.toLowerCase() === "removepivot") {
        if (cReq.data.reference == undefined) {
          cReq.cb({
            type: 'error',
            data: 'reference is missing for removing pivot'
          });
          processRequestRunning = false;
          processRequestStack();
        } else {
          removePivot(cReq.instanceReference, cReq.data.reference, function(data) {
            cReq.cb({
              type: 'data',
              data: data
            });
            processRequestRunning = false;
            processRequestStack();
          });
        }
      } else if (cReq.type.toLowerCase() === "pivot") {
        if (cReq.data.reference == undefined) {
          cReq.cb({
            type: 'error',
            data: 'reference is missing for pivot'
          });
          processRequestRunning = false;
          processRequestStack();
        } else {
          var cReqs = [cReq];
          var start=true;
          while(myRequestStack.length>0){
            if(myRequestStack[0].type.toLowerCase() === 'pivot'){
              cReqs.push(myRequestStack.shift());
            } else {
              break;
            }
          }
          async.eachLimit(cReqs,5,function(cReqLocal, callback){
            pivot(cReqLocal.instanceReference, cReqLocal.data.reference, cReqLocal.data.dimensions, cReqLocal.data.measures, cReqLocal.data.allResults, cReqLocal.data.sortBy, function(data) {
              data.type = 'data';
              cReqLocal.cb(data);
              callback(null, null);
            });
          },function(err,results){
            processRequestRunning = false;
            processRequestStack();
          })
        }
      } else if (cReq.type.toLowerCase() === "flushcache") {
        //executePivots(0, null, cb);
        flushCache(cReq.instanceReference, function(data) {
          data.type = 'data';
          cReq.cb(data);
          processRequestRunning = false;
          processRequestStack();
        });
      } else {

        if (cConn != null)
          cConn.end();

        console.log('unknown type: ' + cReq.type + ' would end connection');
      }
    }
  }

  this.smartfilterRequest = function(m, cb) {
    m.cb = cb;
    if (m.hasOwnProperty('instanceReference') || m.type == 'connect') {

      myRequestStack.push(m);
      if (debug) {
        console.log("myRequestStack.length", myRequestStack.length)
        console.log("processRequestRunning", processRequestRunning)
        if (cReq)
          console.log("cReq", JSON.stringify(cReq.type, null, 2), JSON.stringify(cReq.data, null, 2));
        console.log("lastError", lastError);
      }
      if (processRequestRunning === false) {
        processRequestStack();
      }
    } else {
      cb({ type: 'error', error: { message: 'InstanceRefernce required for non connect requests' } })
    }
  }


  return this;
}

module.exports = smartfilter;
