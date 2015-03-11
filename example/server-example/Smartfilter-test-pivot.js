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
                dimensions: ["MfgPlantRg"],
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
                mysmartfilter.smartfilterRequest({
                    type: "pivot",
                    data: {
                        reference: 'finalPivot',
                        dimensions: [
                            'isPlant',
                            'isIT',
                            'ModeOfTransport',
                            'Dchl'
                        ],
                        measures: [
                            {
                                key: 'UpdatedVolumn',
                                aggregation: 'count',
                                alias: 'count'
                            },
                            {
                                key: 'UpdatedVolumn',
                                aggregation: 'sum',
                                alias: 'Volume'
                            },
                            {
                                key: 'FreightCost',
                                aggregation: 'sum',
                                alias: 'Freight'
                            },
                            {
                                key: 'Outbound',
                                aggregation: 'sum',
                                alias: 'Outbound'
                            },
                            {
                                key: 'HandlingCost',
                                aggregation: 'sum',
                                alias: 'CFA'
                            },
                            {
                                key: 'PackingHouseCharge',
                                aggregation: 'sum',
                                alias: 'Packing'
                            },
                            {
                                key: 'AGT',
                                aggregation: 'sum',
                                alias: 'AGT'
                            },
                            {
                                key: 'TollTax',
                                aggregation: 'sum',
                                alias: 'TollTax'
                            },
                            {
                                key: 'EntryTax',
                                aggregation: 'sum',
                                alias: 'EntryTax'
                            },
                            {
                                key: 'Demurrage',
                                aggregation: 'sum',
                                alias: 'Demurrage'
                            },
                            {
                                key: 'Stock',
                                aggregation: 'sum',
                                alias: 'Stock'
                            }
                        ]
                    }
                }, function (output) {
                    if (output.type !== 'error') {
                        //                mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'mfgplantrg', filters: ['1'], filterType: 'in'} }, function (output) {
                        //                    if (output.type !== 'error') {
                        //                        mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'custplantrg', filters: ['1'], filterType: 'in'} }, function (output) {
                        //                            if (output.type !== 'error') {
                        //                                mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'plantrg', filters: ['1'], filterType: 'in'} }, function (output) {
                        //                                    if (output.type !== 'error') {
                        //                                        mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'year', filters: ['2014'], filterType: 'in'} }, function (output) {
                        //                                            if (output.type !== 'error') {
                        //                                                mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'month', filters: ['12'], filterType: 'in'} }, function (output) {
                        //                                                    if (output.type !== 'error') {
                        //                                                        mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'modeoftransport', filters: ['4', '0004'], filterType: 'in'} }, function (output) {
                        //                                                            if (output.type !== 'error') {
                        //                                                                mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'isPlant', filters: ['1'], filterType: 'in'} }, function (output) {
                        //                                                                    if (output.type !== 'error') {
                        //                                                                        mysmartfilter.smartfilterRequest({ type: "filter", data: { field: 'modeoftransport', filters: ['0004'], filterType: 'in'} }, function (output) {
                        //                                                                            if (output.type !== 'error') {
                        console.log("Result:", JSON.stringify(output), '\n\n');
                        //                                                                            }
                        //                                                                        });
                        //                                                                    }
                        //                                                                });
                        //                                                            }
                        //                                                        });
                        //                                                    }
                        //                                                });
                        //                                            }
                        //                                        });
                        //                                    }
                        //                                });
                        //                            }
                        //                        });
                        //                    }
                        //                });
                    }
                });
            }
        });
    }
});