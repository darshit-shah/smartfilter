# SmartFilter

SmartFilter is a node module bundled with Node Package Manager(NPM). It is a javascript and does not require any compilation.

## What is SmartFilter?

SmartFilter is inspired from a library called [Crossfilter](http://square.github.io/crossfilter/) which is fast browser side in-memory filtering mechanism across multiple dimensions and measures. One of the major limitations of using Crossfilter is to keep data in memory on client side in a browser. There are few modules available to create Crossfilter like functionality on server side. However, in big data world it is costly to transfer data from a source to either client or server side functions. `SmartFilter does not need raw data in memory either on client side or on server side.`  It creates data-provider specific query and fetch results directly from the source. Currently, it supports MySQL as a data source, however soon we will bring Elasticsearch, Hadoop and Big table connectors.

## How SmartFilter works?

SmartFilter creates `dynamic queries with filter conditions` based on previous filters applied on data source. Unlike usual ways of applying all filters, SmartFilter helps you fire a query only if it is required and reduces load on your database. Thus it automatically improves interactions with your Big data sources.

SmartFilter comprises of another module called “node-database-connectors” for converting given JSON parameters to the relevant data-source specific query. Right now it supports MySQL, Elasticsearch and Google-big-query as data sources. So a common filter structure allows us to fire queries on data sources of your choice.

Let me explain with an example, which will compare traditional approach and SmartFilter’s approach to perform same operations.

###### Connect to your own data-provider
For this example, I am taking a reference of MySQL database, which has a table named “Stock” having 6500 rows and following columns
1. Type: This is a string type of column having only two distinct values. "Loss" or "Gain"
2. Qtr: This is also a string type of column having four values. "Q1", "Q2", "Q3" or "Q4"
3. Volume: This is numeric type of column.

###### Add pivot on "Type" field with "Sum" of "Volume" as measure
Both traditional and SmartFilter's approach will create a query something like *"select Type, sum(Volume) from Stock group by Type".*

In addition, `SmartFilter will store this query and corresponding result in cache` and next time when same query is generated, it will just return result from cache without querying the database.

###### Apply Filter Qtr = 'Q1'
Here also both will create a query like *"select Type, sum(Volume) from Stock where Qtr in ['Q1'] group by Type".*

Same as step 2, SmartFilter will also store query and result in cache to use when needed.

###### Apply Filter Qtr in ['Q1', 'Q2']

In Traditional Case it will fire new query like *"select Type, sum(Volume) from Stock where Qtr in ['Q1', 'Q2'] group by Type"*

But here, SmartFilter will `apply its own logic` to find its result. By comparing Step 3 and current filter conditions, it will identify that there is a `scope of improving filter condition`. Instead of fetching all records where *Qtr is either Q1 or Q2*, it should just fetch records where *Qtr is Q2* and `use existing cached result for Qtr = Q1 from above step`. So final query would be *"select Type, sum(Volume) from Stock where Qtr in ['Q2'] group by Type".* Once result is available, `it will merge it with result from above step` and final result is produced for given filter condition. And at the end it will store query and result in cache.

###### Apply Filter Qtr = 'Q2'

Again here in traditional approach you will fire query like *"select Type, sum(Volume) from Stock where Qtr in ['Q2'] group by Type"*

guess what, SmartFilter has already cached this query's and its output in Step 4. So `result is returned directly from cache without even touching database`.


## API Reference

```sh

$ npm install smartfilter

```

## Introduction

This is a node.js module bundled with Node Package Manager(NPM). It is written in pure javascript and does not require any compilation.

Here is an example how to include it:

```js

var smartfilter = require('smartfilter');
var mysmartfilter = new smartfilter();

```

You can create new object of SmartFilter number of times. Each object will store database configuration, dimensions, filters and previous results in memory seperatly.

## How To?

SmartFilter is build on message passing mechanism. This means whatever you want to do you only need to call single service 'smartfilterRequest'. This service will accept 'options' as first parameter and 'callback_method' as second parameter. It will identify what to do from 'options' which you have provided and once it is done, it will call 'callback_method' which will have output.

```js

mysmartfilter.smartfilterRequest(options, callback_method);

```

Here, 'options' is a JSON parameter which contains two keys
1) type: here you need to tell what operations you want to perform. Right now you can specify one of ['connct', 'dimension', 'filter', 'data', 'count']
2) data: here you need to specify supporting data for specified type. Details about supporting data is given further in this document.




#### Connect To Database

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

//call smartfilterRequest service with type = 'connect'.
mysmartfilter.smartfilterRequest({ 
  type: 'connect', //name of operation you want to perform
  data: { 
    tableName: 'Stock', //Name of the table on which you want to create smartfilter object
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




#### Add Pivot

Once you are successfully connected, you can add dimension to create new pivot definition. For this you need to provide Dimension Field, Measure Field and Aggregation Type on measure as supporting data.

Here is a sample code to create a pivot on 'Type' as Dimension and 'Sum' of 'Volume' as Measure.

```js

mysmartfilter.smartfilterRequest({ 
  type: 'pivot', 
  data: { 
    reference: 'myPivot',
    dimensions: [//Multiple dimensions can be specified
      'Type'//Column name of Dimension field
    ],
    measures: [//Multiple measures can be specified
      {
        key: 'Volume', //Column name of Measure field
        aggregation: 'sum'//type of aggregation which needs to be applied on measure
      }
    ]
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




#### Apply Filter

After you have created a pivot definition, you can specify your filter condition. To apply a filter you need to provide Column Name on which you want to apply a filter, type of filter (like 'in' or 'range') and array of values as supporting parameters.

Here is a sample code to add filter on 'Qtr' column, with type of filter as 'in' and array of values as ['Q1', 'Q2']

```js

mysmartfilter.smartfilterRequest({ 
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




#### Fetch Raw Data

Now if you want to fetch raw records from base table after applying all filter conditions, you can use below code.

```js

mysmartfilter.smartfilterRequest({ 
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




#### Fully working sample

Below sample would also show difference in approach between traditional way and SmartFilter's way to interact with database in inline comment.

```js
var smartfilter = new require('smartfilter');

//database connection setting.
var dbConfig = { type: "database", databaseType: 'mysql', database: 'DarshitShah', host: "54.251.110.52", port: "3306", user: "guest", password: "guest", multipleStatements: false };

//create new instance of smartfilter
var mysmartfilter = new smartfilter();
//Step 1. Connect to mysql database
mysmartfilter.smartfilterRequest({ type: "connect", data: { tableName: "Stock", dbConfig: dbConfig} }, function (output) {
    if (output.type !== 'error') {
        /*
        Step 2. Add pivot on 'Type' field with 'Sum' of 'Volume' as measure
        Both traditional and SmartFilter's approach will create a query something like "select Type, sum(Volume) from Stock group by Type"
        But SmartFilter will store this query and corresponding result in cache and next time when same query is generated, it will just return result from cache without querying any database.
        */
        mysmartfilter.smartfilterRequest({ type: "pivot", data: { reference:'myPivot', dimensions:['Type'], measures:[{ key: 'volume', aggregation: 'sum'}]} }, function (output) {
            if (output.type !== 'error') {
                /*
                Step 3. Apply Filter Qtr = 'Q1'
                Here also both will create a query like "select Type, sum(Volume) from Stock where Qtr in ['Q1'] group by Type"
                And same as step 2, it will store query and result in cache
                */
                mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'Qtr', filters: ['Q1'], filterType: 'in'} }, function (output) {
                    if (output.type !== 'error') {
                        /*
                        Step 4. Apply Filter Qtr in ['Q1', 'Q2']
                        In Traditional Case it will fire new query like "select Type, sum(Volume) from Stock where Qtr in ['Q1', 'Q2'] group by Type"
                        But here, SmartFilter will apply its own logic to find its result. 
                        By comparing Step 3 and current filter conditions, it will identify that there is a scope of improving filter condition. 
                        Instead of fetching all records where Qtr is either Q1 or Q2, it should just fetch records where Qtr is Q2 and use existing cached result for Qtr = Q1 from Step 3.
                        So final query would be "select Type, sum(Volume) from Stock where Qtr in ['Q2'] group by Type"
                        Once result is available, it will merge it with result from Step 3 and final result is produced for given filter condition.
                        And at the end it will store query and result in cache.
                        */
                        mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'Qtr', filters: ['Q1', 'Q2'], filterType: 'in'} }, function (output) {
                            if (output.type !== 'error') {
                                /*
                                Step 5. Apply Filter Qtr = 'Q2'
                                Again here in traditional approach you will fire query like "select Type, sum(Volume) from Stock where Qtr in ['Q2'] group by Type"
                                guess what, SmartFilter has already cached this query's and its output in Step 4.
                                So result is returned directly from cache without even touching database.
                                */
                                mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'Qtr', filters: ['Q2'], filterType: 'in'} }, function (output) {
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
