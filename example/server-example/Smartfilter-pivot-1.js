//create new instance of node-cross-filter
var smartfilter = new require('smartfilter');
//database connection setting.
var dbConfig = { type: "database", databaseType: 'mysql', database: 'axiomacc', host: "192.168.0.116", port: "3306", user: "usr", password: "usr", multipleStatements: false };
var mysmartfilter = new smartfilter();
//Step 1. Connect to mysql database
mysmartfilter.smartfilterRequest({ type: "connect", data: { tableName: "i_finaltdcdata", dbConfig: dbConfig} }, function (output) {
    if (output.type !== 'error') {
        mysmartfilter.smartfilterRequest({ type: "pivot",
            data: {
                reference: 'Pivot1',
                dimensions: [
                "MfgPlantRg",
                { alias: 'Slab', 'default': '>=450', values: [{ key: 'Distance', type: 'lt', value: '50', display: '0-50' }, { key: 'Distance', type: 'lt', value: '100', display: '100-150' }, { key: 'Distance', type: 'lt', value: '300', display: '150-300' }, { key: 'Distance', type: 'lt', value: '450', display: '300-450'}] },
                { alias: 'Region', 'default': 'Unknown', values: [{ key: 'MfgPlantRg', type: 'eq', value: ['1', '2'], display: 'North-South'}] },
                { alias: 'MOT', 'default': 'Unknown', values: [{ key: 'SLoc', type: 'match', value: '%L%', display: 'Rail' }, { key: 'SLoc', type: 'match', value: '%D%', display: 'Road'}] }
                ],
                measures: [
                    {
                        key: 'MfgPlantRg',
                        aggregation: 'count',
                        alias: 'count'
                    }
                ]
            }
        }, function (output) {
            if (output.type !== 'error') {
                console.log(output.data);
                process.exit(0);
            }
            else {
                console.log(output);
                process.exit(0);
            }
        });
    }
    else {
        console.log(output);
        process.exit(0);
    }
});