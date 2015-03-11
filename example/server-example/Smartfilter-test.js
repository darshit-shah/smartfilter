//create new instance of node-cross-filter
var smartfilter = new require('smartfilter');
//database connection setting.
var dbConfig = { type: "database", databaseType: 'mysql', database: 'DarshitShah', host: "54.251.110.52", port: "3306", user: "guest", password: "guest", multipleStatements: false };
var mysmartfilter = new smartfilter();
//Step 1. Connect to mysql database
mysmartfilter.smartfilterRequest({ type: "connect", data: { tableName: "Stock", dbConfig: dbConfig} }, function (output) {
    if (output.type !== 'error') {
        /*
        Step 2. Add pivot on 'Type' field with 'Sum' of 'Volume' as measure
        Both traditional and node-cross-filter's approach will create a query something like "select Type, sum(Volume) from Stock group by Type"
        But node-cross-filter will store this query and corresponding result in cache and next time when same query is generated, it will just return result from cache without querying any database.
        */
        mysmartfilter.smartfilterRequest({ type: "pivot", data: { reference: 'myPivot', dimensions: ['type'], measures: [{ key: 'volume', aggregation: 'sum'}]} }, function (output) {
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
                        But here, node-cross-filter will apply its own logic to find its result. 
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
                                guess what, node-cross-filter has already cached this query's and its output in Step 4.
                                So result is returned directly from cache without even touching database.
                                */
                                mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'Qtr', filters: ['Q2'], filterType: 'in'} }, function (output) {
                                    if (output.type !== 'error') {
                                        console.log("Result:", output.data, '\n\n');
                                    }
                                    else {
                                        console.log("Error:", output, '\n\n');
                                    }
                                });
                            }
                            else {
                                console.log("Error:", output, '\n\n');
                            }
                        });
                    }
                    else {
                        console.log("Error:", output, '\n\n');
                    }
                });
            }
            else {
                console.log("Error:", output, '\n\n');
            }
        });
    }
    else {
        console.log("Error:", output, '\n\n');
    }
});