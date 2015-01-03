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

#### Configurations

Right now only once configuration property is available to turn debug mode on/off.
By default debug mode is on which will print debugger information on console. You can tuen it off anytime using following code

```js

nodeCrossFilter.debug = false;

```

#### Methods

For methods also we have only single method requestCrossfilterService which will take options as input and will get output in callback function.

##### Setup

First of all you have to configure setup info which includes table name and database configurations. Here is a sample code to connect "Stock" table of mysql database 

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
