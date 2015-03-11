$(document).ready(function () {
    AxiomCrossFilterClient.onLoad();
});
AxiomCrossFilterClient = {
    dimension: {},
    onLoad: function () {
        "use strict";
        var self = this;
        self.crossFilter_socket = io.connect(self.getBaseUrlString() + '/crossFilter', {
            'reconnect': false,
            'reconnection limit': Infinity,
            'max reconnection attempts': Infinity
        });
        self.crossFilter_socket.on('connect', function (data) {
            document.querySelector("#divContainer").style.display = "block";
        });
        self.crossFilter_socket.on('error', function (data) {
            document.querySelector('#statusMessage').innerText = JSON.stringify(data);
            self.hideMessage();
        });
        self.crossFilter_socket.on('records', function (data) {
            self.hideMessage();
        });
        self.crossFilter_socket.on('count', function (data) {
            document.querySelector('#countOfRecords #chart').innerHTML = self.numberWithCommas(data[0].totalCount);
            document.querySelector('#countOfRecords').style.display = "block";
            //self.hideMessage();
        });
        self.crossFilter_socket.on('connectSuccess', function (data) {
            document.querySelector('#statusMessage').innerText = JSON.stringify(data);
            self.fetchCount();
        });
        self.crossFilter_socket.on('data', function (data) {
            var keys = Object.keys(data);
            for (var i = 0; i < keys.length; i++) {
                self.dimension[keys[i].toLowerCase()].data = data[keys[i]];
                var iDiv = document.querySelector('#crossFilterContainer #' + (keys[i].toLowerCase() === "" ? "noneID" : keys[i].toLowerCase()));
                if (iDiv === null) {
                    iDiv = document.createElement('div');
                    iDiv.id = (keys[i].toLowerCase() === "" ? "noneID" : keys[i].toLowerCase());
                    document.querySelector('#crossFilterContainer').appendChild(iDiv);
                }
                iDiv.style.border = '5px solid #EEE';
                iDiv.style.margin = '10px';
                iDiv.style.float = 'left';
                iDiv.style.fontSize = "14px";
                iDiv.style.background = "#FFF";
                iDiv.innerHTML = '<div style="font-size: 14px; margin-bottom: 5px; background: #EEE; text-align: center; font-weight: bold; padding: 3px;">' + keys[i] + '<span class="reset" id="' + (keys[i].toLowerCase() === "" ? "noneID" : keys[i].toLowerCase()) + '" style="float:right; margin-left:10px;" onclick="AxiomCrossFilterClient.reset(this)">Reset</span></div>';

                //iDiv.innerText =  JSON.stringify(data[keys[i]], null, 4);
                if (self.dimension[keys[i].toLowerCase()].chartType === "pie") {
                    var childElement = document.createElement('div')
                    childElement.id = 'chart';
                    childElement.style.margin = "5px";
                    iDiv.appendChild(childElement);
                    self.createPieChart(data[keys[i]], keys[i], self.dimension[keys[i].toLowerCase()].measure.name);
                }
                else if (self.dimension[keys[i].toLowerCase()].chartType === "range") {
                    var childElement = document.createElement('div')
                    childElement.id = 'chart';
                    childElement.style.margin = "5px";
                    iDiv.appendChild(childElement);
                    self.dimension[keys[i].toLowerCase()].filterType = 'range';
                    self.createRangeChart(data[keys[i]], keys[i], self.dimension[keys[i].toLowerCase()].measure.name, self.dimension[keys[i].toLowerCase()].width);
                }
                else {
                    //iDiv.innerHTML = '<div id="chart">' + data[keys[i]][0][self.dimension[keys[i].toLowerCase()].measure.name] + ':' + data[keys[i]][0][] + '</div>';
                    var stringArr = [];
                    var childElement = document.createElement('div')
                    childElement.id = 'chart';
                    childElement.style.margin = "5px";
                    iDiv.appendChild(childElement);
                    stringArr.push('<table id="chart">');

                    for (var j = -1; j < data[keys[i]].length; j++) {
                        if(j==-1){
                            stringArr.push('<tr>');
                        }
                        else{
                            var myIndex = self.dimension[keys[i].toLowerCase()].filters.indexOf((data[keys[i]][j][keys[i]] == null ? "" : data[keys[i]][j][keys[i]]).toString());
                            if (myIndex !== -1 || self.dimension[keys[i].toLowerCase()].filters.length === 0) {
                                stringArr.push('<tr onclick="AxiomCrossFilterClient.filterSingleValue(\'' + keys[i] + '\',\'' + data[keys[i]][j][keys[i]] + '\')">');
                            }
                            else {
                                stringArr.push('<tr style="color:#CCC" onclick="AxiomCrossFilterClient.filterSingleValue(\'' + keys[i] + '\',\'' + data[keys[i]][j][keys[i]] + '\')">');
                            }
                        }
                        stringArr.push('<td>');
                        if(j==-1){
                            stringArr.push(keys[i].toLowerCase() === "" ? "noneID" : keys[i].toLowerCase());
                        }
                        else{
                            stringArr.push(data[keys[i]][j][keys[i]]);
                        }
                        stringArr.push('</td>');
                        stringArr.push('<td>');
                        if(j==-1){
                            stringArr.push(self.dimension[keys[i].toLowerCase()].measure.name);
                        }
                        else{
                            stringArr.push(self.numberWithCommas(data[keys[i]][j][self.dimension[keys[i].toLowerCase()].measure.name]));
                        }
                        stringArr.push('</td>');
                        stringArr.push('</tr>');
                    }
                    stringArr.push('</table>');
                    childElement.innerHTML = stringArr.join("\n");
                }
                if (self.dimension[keys[i].toLowerCase()].filters.length === 0) {
                    document.querySelector('.reset#' + (keys[i].toLowerCase() === "" ? "noneID" : keys[i].toLowerCase())).style.display = "none";
                }
                else {
                    document.querySelector('.reset#' + (keys[i].toLowerCase() === "" ? "noneID" : keys[i].toLowerCase())).style.display = "block";
                }
            }
            data = null;

            //self.fetchCount();
            self.hideMessage();
            document.querySelector('#statusMessage').innerText = 'Success!!!';

        });
        self.crossFilter_socket.on('message', function (data) {
            document.querySelector('#statusMessage').innerText = JSON.stringify(data);
            self.hideMessage();
        });
    },
    createRangeChart: function (data, key, measure, width) {
        "use strict";
        var self = this;
        var h = 300;
        var w = width;
        if (w.trim() === '' || isNaN(w))
            w = 500;
        data.forEach(function (d) {
            d = type(d);
        });

        var xDomain = d3.extent(data.map(function (d) { return d[key]; }));
        var yDomain = [0, d3.max(data.map(function (d) { return d[measure]; }))];

        d3.select('#crossFilterContainer #' + (key.toLowerCase() === "" ? "noneID" : key.toLowerCase()) + ' #chart').style('width', w + 'px').style('height', h + 'px');
        var margin = { top: 10, right: 10, bottom: 100, left: 60 },
            margin2 = { top: 230, right: 10, bottom: 20, left: 60 },
            width = w - margin.left - margin.right,
            height = h - margin.top - margin.bottom,
            height2 = h - margin2.top - margin2.bottom;

        var x = d3.scale.linear().range([0, width]),
            x2 = d3.scale.linear().range([0, width]),
            y = d3.scale.linear().range([height, 0]),
            y2 = d3.scale.linear().range([height2, 0]);

        var parseDate = undefined;
        if (self.dimension[key.toLowerCase()].rangeType === 'date') {
            if (self.dimension[key.toLowerCase()].formatType !== '') {
                d3.time.format(self.dimension[key.toLowerCase()].formatType).parse;
            }
            x = d3.time.scale().range([0, width]);
            x2 = d3.time.scale().range([0, width]);
        }

        var xAxis = d3.svg.axis().scale(x).orient("bottom"),
            xAxis2 = d3.svg.axis().scale(x2).orient("bottom"),
            yAxis = d3.svg.axis().scale(y).orient("left");

        var brush = d3.svg.brush()
            .x(x2)
            .on("brush", brushed)
            .on("brushend", brushEnd);

        var area = d3.svg.area()
            .interpolate("monotone")
            .x(function (d) { return x(d[key]); })
            .y0(height)
            .y1(function (d) { return y(d[measure]); });

        var area2 = d3.svg.area()
            .interpolate("monotone")
            .x(function (d) { return x2(d[key]); })
            .y0(height2)
            .y1(function (d) { return y2(d[measure]); });

        var svg = d3.select('#crossFilterContainer #' + key.toLowerCase() + ' #chart').append("svg:svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        svg.append("defs").append("clipPath")
            .attr("id", "clip")
          .append("rect")
            .attr("width", width)
            .attr("height", height);

        var focus = svg.append("g")
            .attr("class", "focus")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var context = svg.append("g")
            .attr("class", "context")
            .attr("transform", "translate(" + margin2.left + "," + margin2.top + ")");

        x.domain(xDomain);
        y.domain(yDomain);
        x2.domain(x.domain());
        y2.domain(y.domain());

        focus.append("path")
              .datum(data)
              .attr("class", "area")
              .attr("d", area);

        focus.append("g")
              .attr("class", "x axis")
              .attr("transform", "translate(0," + height + ")")
              .call(xAxis);

        focus.append("g")
              .attr("class", "y axis")
              .call(yAxis);

        context.append("path")
              .datum(data)
              .attr("class", "area")
              .attr("d", area2);

        context.append("g")
              .attr("class", "x axis")
              .attr("transform", "translate(0," + height2 + ")")
              .call(xAxis2);

        context.append("g")
              .attr("class", "x brush")
              .call(brush)
            .selectAll("rect")
              .attr("y", -6)
              .attr("height", height2 + 7);

        if (self.dimension[key.toLowerCase()].filters.length === 2) {
            brush.extent([self.dimension[key.toLowerCase()].filters[0], self.dimension[key.toLowerCase()].filters[1]]);
            svg.select(".brush").call(brush);
            x.domain(brush.empty() ? x2.domain() : brush.extent());
            focus.select(".area").attr("d", area);
            focus.select(".x.axis").call(xAxis);
        }

        function brushed() {
            x.domain(brush.empty() ? x2.domain() : brush.extent());
            focus.select(".area").attr("d", area);
            focus.select(".x.axis").call(xAxis);
        }

        function brushEnd() {
            if (brush.empty()) {
                self.filterRange(key.toLowerCase(), []);
            }
            else {
                self.filterRange(key.toLowerCase(), brush.extent());
            }
        }

        function type(d) {
            if (self.dimension[key.toLowerCase()].rangeType === 'date') {
                if (self.dimension[key.toLowerCase()].formatType === '' || parseDate == undefined) {
                    d[key] = new Date(d[key]);
                }
                else {
                    d[key] = new parseDate(d[key]);
                }
            }
            else {
                d[key] = +d[key];
            }
            d[measure] = +d[measure];
            return d;
        }

        //setData(data);
    },
    createPieChart: function (data, key, measure) {
        "use strict";
        var self = this;
        var w = 200;
        var h = 200;
        var r = h / 2;
        var color = d3.scale.category20c();
        d3.select('#crossFilterContainer #' + (key.toLowerCase() === "" ? "noneID" : key.toLowerCase()) + ' #chart').style('width', w + 'px').style('height', h + 'px');
        var vis = d3.select('#crossFilterContainer #' + key.toLowerCase() + ' #chart').append("svg:svg").data([data]).attr("width", w).attr("height", h).append("svg:g").attr("transform", "translate(" + r + "," + r + ")");
        var pie = d3.layout.pie().value(function (d) { return d[measure]; });

        // declare an arc generator function
        var arc = d3.svg.arc().outerRadius(r);

        // select paths, use arc generator to draw
        var arcs = vis.selectAll("g.slice").data(pie).enter().append("svg:g").attr("class", "slice")
            .on("click", function (d) {
                self.filterSingleValue(key, d.data[key]);
            });
        arcs.append("svg:title").text(function (d) { return d.data[key] + ': ' + d.data[measure] });
        arcs.append("svg:path")
            .attr("fill", function (d, i) {
                if (self.dimension[key.toLowerCase()].filters.length === 0) {
                    return color(i);
                }
                else {
                    var myIndex = self.dimension[key.toLowerCase()].filters.indexOf(d.data[key]);
                    if (myIndex === -1) {
                        return "#ccc";
                    }
                    else {
                        return color(i);
                    }
                }
            })
            .attr("d", function (d) {
                return arc(d);
            });

        // add the text
        arcs.append("svg:text").attr("transform", function (d) {
            d.innerRadius = 0;
            d.outerRadius = r;
            return "translate(" + arc.centroid(d) + ")";
        }).attr("text-anchor", "middle")
        .text(function (d, i) {
            return data[i][key];
        })
        .attr("fill", "#fff");
    },
    createBarChart: function(){
        
    },
    connect: function () {
        "use strict";
        var self = this;
        var tableName = document.querySelector("#divConnect #databaseTableName").value;
        document.querySelector('#statusMessage').innerText = 'Trying to connect to ' + tableName + ' table ....';

        document.querySelector("#divConnect").style.display = "none";

        self.crossFilter_socket.emit('connect', {
            tableName: tableName,
            dbConfig: {
                type: "database",
                databaseType: document.querySelector("#divConnect #databaseType").value,
                database: document.querySelector("#divConnect #databaseName").value,
                host: document.querySelector("#divConnect #databaseHost").value,
                port: document.querySelector("#divConnect #databasePort").value,
                user: document.querySelector("#divConnect #databaseUser").value,
                password: document.querySelector("#divConnect #databasePassword").value,
                cacheResponse: false,
                multipleStatements: false
            }
        });

    },
    addDimension: function () {
        "use strict";
        document.querySelector("#selectDimension #dimension").value = "";
        document.querySelector("#selectDimension #measure").value = "";
        document.querySelector("#selectDimension #measure").disabled = true;
        document.querySelector("#selectDimension #measureType").selectedIndex = 0;
        document.querySelector("#selectDimension").style.display = "block";
        document.querySelector("#selectDimension #dimension").focus();
    },
    okDimension: function () {
        "use strict";
        var self = this;
        var fieldName = document.querySelector("#selectDimension #dimension").value;
        fieldName = fieldName.trim();
        if (false && fieldName === "") {
            alert("Dimension can not be blank");
        }
        else {
            self.dimension[fieldName.toLowerCase()] = {
                measure: {},
                filters: [],
                data: [],
                chartType: document.querySelectorAll("#chartType option")[document.querySelector("#chartType").selectedIndex].value.toLowerCase(),
                rangeType: document.querySelectorAll('#rangeType option')[document.querySelector("#rangeType").selectedIndex].value.toLowerCase(),
                formatType: document.querySelector("#formatType").value,
                width: document.querySelector("#selectDimension #chartWidth").value
            };
            document.querySelector("#selectDimension").style.display = "none";
            document.querySelector('#statusMessage').innerText = 'Adding Dimension : ' + fieldName + '....';
            if (document.querySelector("#measureType").selectedIndex === 0) {
                var measure = self.dimension[fieldName.toLowerCase()].measure;
                measure.key = fieldName;
                measure.aggregation = document.querySelectorAll("#measureType option")[document.querySelector("#measureType").selectedIndex].value.toLowerCase();
                measure.name = measure.aggregation + '(' + measure.key + ')';
                self.showMessage("Adding Dimension");
                //self.crossFilter_socket.emit('dimension', { field: fieldName, key: measure.key, aggregation: measure.aggregation });
                self.crossFilter_socket.emit('pivot', { reference: fieldName, dimensions:[fieldName], measures:[{key: measure.key, aggregation: measure.aggregation}]});
            }
            else {
                if (measureName === "") {
                    alert("Measure can not be blank");
                }
                else {
                    var measureName = document.querySelector("#selectDimension #measure").value;
                    measureName = measureName.trim();
                    var measure = self.dimension[fieldName.toLowerCase()].measure;
                    measure.key = measureName;
                    measure.aggregation = document.querySelectorAll("#measureType option")[document.querySelector("#measureType").selectedIndex].value.toLowerCase();
                    measure.name = measure.aggregation + '(' + measure.key + ')';
                    self.showMessage("Adding Dimension");
                    //self.crossFilter_socket.emit('dimension', { field: fieldName, key: measure.key, aggregation: measure.aggregation });
                    self.crossFilter_socket.emit('pivot', { reference: fieldName, dimensions:[fieldName], measures:[{key: measure.key, aggregation: measure.aggregation}]});
                }
            }
        }
    },
    cancelDimension: function () {
        "use strict";
        var self = this;
        document.querySelector("#selectDimension").style.display = "none";
    },
    updateFilter: function (key) {
        "use strict";
        var self = this;
        self.showMessage("Applying Filter");
        self.crossFilter_socket.emit('filter', { field: key, filters: self.dimension[key.toLowerCase()].filters, filterType: self.dimension[key.toLowerCase()].filterType });
        self.fetchCount();
    },
    measureTypeChanged: function () {
        "use strict";
        var self = this;
        if (document.querySelectorAll("#measureType option")[document.querySelector("#measureType").selectedIndex].value.toLowerCase() === 'count') {
            document.querySelector("#measure").disabled = true;
        }
        else {
            document.querySelector("#measure").disabled = false;
        }
        self.chartTypeChanged();
    },
    chartTypeChanged: function () {
        "use strict";
        var self = this;
        if (document.querySelectorAll("#chartType option")[document.querySelector("#chartType").selectedIndex].value.toLowerCase() === 'range') {
            document.querySelector("#rangeType").disabled = false;
            document.querySelector("#formatType").disabled = false;
        }
        else {
            document.querySelector("#rangeType").disabled = true;
            document.querySelector("#formatType").disabled = true;
        }
    },
    rangeTypeChanged: function () {
        "use strict";
        var self = this;
        if (document.querySelectorAll("#rangeType option")[document.querySelector("#rangeType").selectedIndex].value.toLowerCase() === 'date') {
            document.querySelector("#formatType").disabled = false;
        }
        else {
            document.querySelector("#formatType").disabled = true;
        }
    },
    fetchData: function () {
        "use strict";
        var self = this;
        self.showMessage("Fetching Data");
        self.crossFilter_socket.emit('data', { from: 0, to: 100 });
    },
    fetchCount: function () {
        "use strict";
        var self = this;
        //self.showMessage("Fetching Count");
        self.crossFilter_socket.emit('count', {});
    },
    showMessage: function (msg) {
        "use strict";
        var self = this;
        if (msg === undefined)
            msg = "please wait";
        document.querySelector("#applyFilterStatus p").innerText = msg;
        document.querySelector("#applyFilterStatus").style.display = "block";
    },
    hideMessage: function () {
        "use strict";
        var self = this;
        document.querySelector("#applyFilterStatus").style.display = "none";
    },
    numberWithCommas: function (x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },
    getBaseUrlString: function () {
        var url = document.URL;
        url = url.substr(0, url.indexOf('/', 8));
        jQuery.support.cors = true;
        return url;
    },
    reset: function (e) {
        var key = e.id;
        AxiomCrossFilterClient.dimension[key.toLowerCase()].filters = [];
        AxiomCrossFilterClient.updateFilter(key);
    },
    filterSingleValue: function (key, value) {
        var self = this;
        var myIndex = self.dimension[key.toLowerCase()].filters.indexOf(value);
        if (myIndex === -1) {
            self.dimension[key.toLowerCase()].filters.push(value);
        }
        else {
            self.dimension[key.toLowerCase()].filters.splice(myIndex, 1);
        }
        if (self.dimension[key.toLowerCase()].filters.length === self.dimension[key.toLowerCase()].data.length)
            self.dimension[key.toLowerCase()].filters = [];

        self.dimension[key.toLowerCase()].filterType = 'in';
        self.updateFilter(key);
    },
    filterRange: function (key, values) {
        var self = this;
        self.dimension[key.toLowerCase()].filterType = 'range';
        self.dimension[key.toLowerCase()].filters = values;
        self.updateFilter(key);
    },
    
}