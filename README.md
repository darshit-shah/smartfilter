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

##### Debug Mode

By default debug mode is on which will print debugger information on console. You can tuen it off anytime using following code

```js

nodeCrossFilter.debug = false;

```

### How To?

node-cross-filter is build on message passing mechanism. This means whatever you want to do you only need to call single service "requestCrossfilterService". This service will accept "options" as first parameter and "callback_method" as second parameter. It will identify what to do from "options" which you have provided and once it is done, it will call "callback_method" which will have output.


#### Connect

First of all you have to connect to a specific table of your database. To enable this, you need to pass database configuration and table name. 

Here is a sample code to connect to "Stock" table of given mysql database. 

```js

var dbConfig = { type: "database", databaseType: 'mysql', database: 'DarshitShah', host: "54.251.110.52", port: "3306", user: "guest", password: "guest", multipleStatements: false };
nodeCrossFilter.requestCrossfilterService({ 
  type: "setup", 
  data: { 
    tableName: "Stock", 
    dbConfig: dbConfig
  } 
}, function (output) {
  if (output.type !== 'error') {
    console.log('Success', output);
  }
  else {
    console.log('Fail', output);
  }
});

```
