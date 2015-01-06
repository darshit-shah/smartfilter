# node-cross-filter

server side cross filter which will fire queries into mysql database and store results in memory. Once results are in memory it will try to alter next filter conditions in such a way that it can use existing result and only leftout part will be queried from database.

## Install

```sh

$ npm install node-cross-filter

```

## Introduction

This is a node.js module bundled with Node Package Manager(NPM). It is written in pure javascript and does not require any compilation.

Here is an example how to include it:

```js

var nodeCrossFilter = require('node-cross-filter');

```

You can use above line for multiple time in your applocation. Each include will create new object of node-cross-filter as each object will store database configuration, dimensions, filters and previous results in memory.

By default debug mode is on which will print debugger information on console. You can tuen it off anytime using following code

```js

nodeCrossFilter.debug = false;

```

## How To?

node-cross-filter is build on message passing mechanism. This means whatever you want to do you only need to call single service 'requestCrossfilterService'. This service will accept 'options' as first parameter and 'callback_method' as second parameter. It will identify what to do from 'options' which you have provided and once it is done, it will call 'callback_method' which will have output.

```js

nodeCrossFilter.requestCrossfilterService(options, callback_method);

```

Here, 'options' is a JSON parameter which contains two keys
1) type: here you need to tell what operations you want to perform. Right now you can specify one of ['connct', 'dimension', 'filter', 'data', 'count']
2) data: here you need to specify supporting data for specified type. Details about supporting data is given further in this document.




#### Connect

First of all you have to connect to a specific table of your database. For this, you need to pass database connection configurations and table name as supporting data.

Here is a sample code to connect to 'Stock' table of given mysql database. 

```js

//Database connection settings
var dbConfig = { 
  type: 'database',//type of connection. Currently connection to only database is available
  databaseType: 'mysql', //type of database. Currently you can connect to only mysql database
  host: '54.251.110.52', //host name of mysql database
  port: '3306', //port on which mysql is listening
  user: 'guest', //username to connect to database
  password: 'guest', //password to access the database
  database: 'DarshitShah' //Name of database
};

//call requestCrossfilterService service with type = 'connect'.
nodeCrossFilter.requestCrossfilterService({ 
  type: 'connect', //name of operation you want to perform
  data: { 
    tableName: 'Stock', //Name of the table on which you want to create node-cross-filter object
    dbConfig: dbConfig //database configuration
    } 
  }, function (output) {
    if (output.type !== 'error') {
      //In this case operation is completed successsfully.
      console.log('Success', output);
    }
    else {
      //In this case some error has occured.
      console.log('Fail', output);
    }
  });

```




#### Dimension

Once you are successfully connected, you can add dimension to create new pivot definition. For this you need to provide Dimension Field, Measure Field and Aggregation Type on measure as supporting data.

Here is a sample code to create a pivot on 'Type' as Dimension and 'Sum' of 'Volume' as Measure.

```js

nodeCrossFilter.requestCrossfilterService({ 
  type: 'dimension', 
  data: { 
    field: 'Type', //Column name of Dimension field
    key: 'Volume', //Column name of Measure field
    aggregation: 'sum'//type of aggregation which needs to be applied on measure
    } 
  }, function (output) {
    if (output.type !== 'error') {
      //In this case operation is completed successsfully.
      console.log('Success', output);
    }
    else {
      //In this case some error has occured.
      console.log('Fail', output);
    }
  });

```




#### Filter

After you have created a pivot definition, you can specify your filter condition. To apply a filter you need to provide Column Name on which you want to apply a filter, type of filter (like 'in' or 'range') and array of values as supporting parameters.

Here is a sample code to add filter on 'Qtr' column, with type of filter as 'in' and array of values as ['Q1', 'Q2']

```js

nodeCrossFilter.requestCrossfilterService({ 
  type: 'filter', 
  data: { 
    field: 'Qtr', //Column name on which filter needs to be applied
    filterType: 'in', //type of filter. 'in' means from list of values, 'range' means between
    filters: ['Q1', 'Q2'] // Qtr should be either 'Q1' or 'Q2'
    }    
  }, function (output) {
    if (output.type !== 'error') {
      //In this case operation is completed successsfully.
      console.log('Success', output);
    }
    else {
      //In this case some error has occured.
      console.log('Fail', output);
    }
  });

```




#### Data

Now if you want to fetch raw records from base table after applying all filter conditions, you can use below code.

```js

nodeCrossFilter.requestCrossfilterService({ 
  type: 'data', // fetch raw data
  data: {  }
  }, function (output) {
    if (output.type !== 'error') {
      //In this case operation is completed successsfully.
      console.log('Success', output);
    }
    else {
      //In this case some error has occured.
      console.log('Fail', output);
    }
  });

```




#### Count

Now if you just want count of raw records from base table after applying all filter conditions, you can use below code.

```js

nodeCrossFilter.requestCrossfilterService({ 
  type: 'count', //fetch count
  data: {  }
  }, function (output) {
    if (output.type !== 'error') {
      //In this case operation is completed successsfully.
      console.log('Success', output);
    }
    else {
      //In this case some error has occured.
      console.log('Fail', output);
    }
  });
  
```


## Why node-cross-filter?

In this section I want to explain "Why should anybody use node-cross-filter" instead of writing queries or logic manually in traditional way?

Let me explain you with appropriate example which will compare traditional approach and node-cross-filter's approach  of providing solution.

```js

//create new instance of node-cross-filter
var nodeCrossFilter = require('node-cross-filter');

//database connection setting.
var dbConfig = { type: "database", databaseType: 'mysql', database: 'DarshitShah', host: "54.251.110.52", port: "3306", user: "guest", password: "guest", multipleStatements: false };

//Step 1. Connect to mysql database
nodeCrossFilter.requestCrossfilterService({ type: "connect", data: { tableName: "Stock", dbConfig: dbConfig} }, function (output) {
    if (output.type !== 'error') {
        /*
        Step 2. Add pivot on 'Type' field with 'Sum' of 'Volume' as measure
        Both traditional and node-cross-filter's approach will create a query something like "select Type, sum(Volume) from Stock group by Type"
        But node-cross-filter will store this query and corresponding result in cache and next time when same query is generated, it will just return result from cache without querying any database.
        */
        nodeCrossFilter.requestCrossfilterService({ type: "dimension", data: { field: 'Type', key: 'volume', aggregation: 'sum'} }, function (output) {
            if (output.type !== 'error') {
                /*
                Step 3. Apply Filter Qtr = 'Q1'
                Here also both will create a query like "select Type, sum(Volume) from Stock where Qtr in ['Q1'] group by Type"
                And same as step 2, it will store query and result in cache
                */
                nodeCrossFilter.requestCrossfilterService({ type: "filter", data: { field: 'Qtr', filters: ['Q1'], filterType: 'in'} }, function (output) {
                    if (output.type !== 'error') {
                        console.log("Result:", output.data, '\n\n');
                        /*
                        Step 4. Apply Filter Qtr in ['Q1', 'Q2']
                        In Traditional Case it will fire new query like "select Type, sum(Volume) from Stock where Qtr in ['Q1', 'Q2'] group by Type"
                        But here, node-cross-filter will apply its own logic to find its result. 
                        By comparing Step 3 and current filter conditions, it will identify that there is a scope of improving filter condition. 
                        Instead of fetching all records where Qtr is either Q1 or Q2, it should just fetch records where Qtr is Q2 and use existing cached result for Qtr = Q1 from Step 3.
                        So final query would be "select Type, sum(Volume) from Stock where Qtr in ['Q2'] group by Type"
                        Once result is available, it will merge it with result from Step 3 and final result is produced for given filter condition.
                        And at the end it will store query and result in cache.
                        */
                        nodeCrossFilter.requestCrossfilterService({ type: "filter", data: { field: 'Qtr', filters: ['Q1', 'Q2'], filterType: 'in'} }, function (output) {
                            if (output.type !== 'error') {
                                console.log("Result:", output.data, '\n\n');
                                /*
                                Step 5. Apply Filter Qtr = 'Q2'
                                Again here in traditional approach you will fire query like "select Type, sum(Volume) from Stock where Qtr in ['Q2'] group by Type"
                                guess what, node-cross-filter has already cached this query's and its output in Step 4.
                                So result is returned directly from cache without even touching database.
                                */
                                nodeCrossFilter.requestCrossfilterService({ type: "filter", data: { field: 'Qtr', filters: ['Q2'], filterType: 'in'} }, function (output) {
                                    if (output.type !== 'error') {
                                        console.log("Result:", output.data, '\n\n');
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});

```

Also, it internally uses another module called "node-database-connectors" for converting sepcified JSON to relevant database specific query (Right now it supports mysql, elasticsearch and google-big-query). So whatever database it is, either it is mysql, elasticsearch or google-big-query. You don't need to learn how to write query in for respective database. Only thing you need to learn is "How to use node-cross-filter" to get desired output. And I guess it is damn simple, isn't it?

Later.
