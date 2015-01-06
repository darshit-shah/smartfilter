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
    field: 'Type', 
    key: 'Volume', 
    aggregation: 'sum'
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
    field: 'Qtr', 
    filters: ['Q1', 'Q2'], 
    filterType: 'in'
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
To be finished.

#### Count
To be finished.
