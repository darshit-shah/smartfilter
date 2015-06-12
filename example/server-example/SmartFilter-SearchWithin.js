//create new instance of node-smart-filter
var smartfilter = new require('smartfilter');
//database connection setting.
var dbConfig = { type: "database", databaseType: 'mysql', database: 'axiomCore', host: "192.168.0.23", port: "3306", user: "usr", password: "usr", multipleStatements: false };
var mysmartfilter = new smartfilter();
//Step 1. Connect to mysql database
mysmartfilter.smartfilterRequest({ type: "connect", data: { tableName: "188_KarmanyData", dbConfig: dbConfig} }, function (output) {
    if (output.type !== 'error') {
        /*
        Step 2. Add pivot on 'Type' field with 'Sum' of 'Volume' as measure
        Both traditional and node-cross-filter's approach will create a query something like "select Type, sum(Volume) from Stock group by Type"
        But node-cross-filter will store this query and corresponding result in cache and next time when same query is generated, it will just return result from cache without querying any database.
        */
        mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'Socialsectorfocus', filters: ['Livelihood', 'Health'], filterType: 'withinAny'} }, function (output) {
            if (output.type !== 'error') {
                mysmartfilter.smartfilterRequest({ type: "data", data: {} }, function (output) {
                    if (output.type !== 'error') {
                        for (var i = 0; i < output.data.length; i++) {
                            console.log(i + 1, output.data[i]['OrganizationName'], output.data[i]['Socialsectorfocus']);
                        }
                        console.log("Result:", output.data.length, '\n\n');
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