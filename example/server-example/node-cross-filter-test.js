var nodeCrossFilter = require('node-cross-filter');
var dbConfig = { type: "database", databaseType: 'mysql', database: 'DarshitShah', host: "54.251.110.52", port: "3306", user: "guest", password: "guest", multipleStatements: false };
console.log('connnecting to database...\n\n');
nodeCrossFilter.requestCrossfilterService({ type: "setup", data: { tableName: "Stock", dbConfig: dbConfig} }, function (output) {
    if (output.type !== 'error') {
        //add dimension: 'Type'
        nodeCrossFilter.requestCrossfilterService({ type: "dimension", data: { field: 'Type', key: 'volume', aggregation: 'sum'} }, function (output) {
            if (output.type !== 'error') {
                console.log("Result:", output.data, '\n\n');
                //add filter: Qtr in ["Q1"]
                nodeCrossFilter.requestCrossfilterService({ type: "filter", data: { field: 'Qtr', filters: ['Q1'], filterType: 'in'} }, function (output) {
                    if (output.type !== 'error') {
                        console.log("Result:", output.data, '\n\n');
                        //add filter: Qtr in ["Q1", "Q2"]
                        nodeCrossFilter.requestCrossfilterService({ type: "filter", data: { field: 'Qtr', filters: ['Q1', 'Q2'], filterType: 'in'} }, function (output) {
                            if (output.type !== 'error') {
                                console.log("Result:", output.data, '\n\n');
                                //add filter: Qtr in ["Q2"]'
                                nodeCrossFilter.requestCrossfilterService({ type: "filter", data: { field: 'Qtr', filters: ['Q2'], filterType: 'in'} }, function (output) {
                                    if (output.type !== 'error') {
                                        console.log("Result:", output.data, '\n\n');
                                        process.exit(0);
                                    }
                                    else {
                                        process.exit(0);
                                    }
                                });
                            }
                            else {
                                process.exit(0);
                            }
                        });
                    }
                    else {
                        process.exit(0);
                    }
                });
            }
            else {
                process.exit(0);
            }
        });
    }
    else {
        process.exit(0);
    }
});