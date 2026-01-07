// Response Times Chart
const csvPath = "../message_response_times.csv?" + Date.now();

const margin = { top: 20, right: 40, bottom: 30, left: 140 };
const barHeight = 24;

const tooltip = d3.select("#tooltip");
const topNSelect = document.getElementById("top-n");
const sortModeSelect = document.getElementById("sort-mode");
const startDateSelect = document.getElementById("start-date");
const endDateSelect = document.getElementById("end-date");

let rawData;
let allMonths = [];
let selectedPerson = null;

d3.csv(csvPath).then(data => {
    rawData = data;

    // Extract unique months from data
    allMonths = [...new Set(data.map(d => d.month))].sort();

    // Populate date selects
    allMonths.forEach(m => {
        const label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        startDateSelect.add(new Option(label, m));
        endDateSelect.add(new Option(label, m));
    });
    // Default to full data range
    startDateSelect.value = allMonths[0];
    endDateSelect.value = allMonths[allMonths.length - 1];

    render();

    topNSelect.addEventListener("change", render);
    sortModeSelect.addEventListener("change", render);
    startDateSelect.addEventListener("change", render);
    endDateSelect.addEventListener("change", render);
}).catch(err => {
    console.error("Failed to load CSV:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_detailed.py</code> first.
        </p>`;
});

function render() {
    d3.select("#chart").selectAll("*").remove();

    const topN = parseInt(topNSelect.value);
    const sortMode = sortModeSelect.value;
    const startDate = startDateSelect.value;
    const endDate = endDateSelect.value;

    // Filter data by date range
    const filteredData = rawData.filter(row => row.month >= startDate && row.month <= endDate);

    // Aggregate by contact (average median response times)
    const byContact = {};
    filteredData.forEach(row => {
        const name = row.name;
        if (!byContact[name]) {
            byContact[name] = { my_times: [], their_times: [] };
        }
        if (row.my_median_mins) byContact[name].my_times.push(+row.my_median_mins);
        if (row.their_median_mins) byContact[name].their_times.push(+row.their_median_mins);
    });

    let plotData = Object.entries(byContact).map(([name, d]) => {
        const myAvg = d.my_times.length > 0 ? d3.median(d.my_times) : null;
        const theirAvg = d.their_times.length > 0 ? d3.median(d.their_times) : null;
        return {
            name,
            myResponse: myAvg,
            theirResponse: theirAvg,
            difference: (myAvg || 0) - (theirAvg || 0)
        };
    }).filter(d => d.myResponse !== null || d.theirResponse !== null);

    // Sort
    if (sortMode === "my_response") {
        plotData.sort((a, b) => (a.myResponse || 999) - (b.myResponse || 999));
    } else if (sortMode === "their_response") {
        plotData.sort((a, b) => (a.theirResponse || 999) - (b.theirResponse || 999));
    } else {
        plotData.sort((a, b) => a.difference - b.difference);
    }

    plotData = plotData.slice(0, topN);

    const width = Math.min(1200, window.innerWidth - 100) - margin.left - margin.right;
    const height = plotData.length * barHeight + margin.top + margin.bottom;

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const maxTime = d3.max(plotData, d => Math.max(d.myResponse || 0, d.theirResponse || 0));
    const x = d3.scaleLinear()
        .domain([0, Math.min(maxTime * 1.1, 120)])  // Cap at 2 hours for readability
        .range([0, width]);

    const y = d3.scaleBand()
        .domain(plotData.map(d => d.name))
        .range([0, plotData.length * barHeight])
        .padding(0.3);

    // X axis
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${plotData.length * barHeight})`)
        .call(d3.axisBottom(x).tickFormat(d => d + " min"));

    // Draw bars - my response (green)
    svg.selectAll(".bar-my")
        .data(plotData.filter(d => d.myResponse !== null))
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("y", d => y(d.name))
        .attr("width", d => x(Math.min(d.myResponse, 120)))
        .attr("height", y.bandwidth() / 2 - 1)
        .attr("fill", "#4ade80")
        .attr("rx", 2)
        .on("click", (event, d) => showPersonDetail(d.name))
        .on("mouseenter", showTooltip)
        .on("mouseleave", () => tooltip.style("opacity", 0));

    // Draw bars - their response (pink)
    svg.selectAll(".bar-their")
        .data(plotData.filter(d => d.theirResponse !== null))
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("y", d => y(d.name) + y.bandwidth() / 2)
        .attr("width", d => x(Math.min(d.theirResponse, 120)))
        .attr("height", y.bandwidth() / 2 - 1)
        .attr("fill", "#f472b6")
        .attr("rx", 2)
        .on("click", (event, d) => showPersonDetail(d.name))
        .on("mouseenter", showTooltip)
        .on("mouseleave", () => tooltip.style("opacity", 0));

    // Labels
    svg.selectAll(".label")
        .data(plotData)
        .enter()
        .append("text")
        .attr("x", -8)
        .attr("y", d => y(d.name) + y.bandwidth() / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("fill", d => d.name === selectedPerson ? "#4ade80" : "#ddd")
        .attr("font-size", "12px")
        .attr("cursor", "pointer")
        .text(d => d.name.length > 18 ? d.name.slice(0, 17) + "…" : d.name)
        .on("click", (event, d) => showPersonDetail(d.name));

    function showTooltip(event, d) {
        tooltip
            .html(`<strong>${d.name}</strong><br>
                   My response: ${d.myResponse ? d.myResponse.toFixed(1) + " min" : "N/A"}<br>
                   Their response: ${d.theirResponse ? d.theirResponse.toFixed(1) + " min" : "N/A"}`)
            .style("opacity", 1)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 10) + "px");
    }
}

function showPersonDetail(name) {
    selectedPerson = name;
    render();

    document.getElementById("person-detail").style.display = "block";
    document.getElementById("person-name").textContent = name + " - Response Times Over Time";

    // Filter data for this person
    const personData = rawData.filter(d => d.name === name);
    if (personData.length === 0) return;

    // Build time series
    const seriesData = personData.map(d => ({
        month: d.month,
        myResponse: d.my_median_mins ? +d.my_median_mins : null,
        theirResponse: d.their_median_mins ? +d.their_median_mins : null
    }));

    // Draw detail chart
    const detailDiv = d3.select("#person-detail-chart");
    detailDiv.selectAll("*").remove();

    const detailMargin = { top: 20, right: 30, bottom: 40, left: 50 };
    const detailWidth = Math.min(1100, window.innerWidth - 100) - detailMargin.left - detailMargin.right;
    const detailHeight = 250 - detailMargin.top - detailMargin.bottom;

    const detailSvg = detailDiv.append("svg")
        .attr("width", detailWidth + detailMargin.left + detailMargin.right)
        .attr("height", detailHeight + detailMargin.top + detailMargin.bottom)
        .append("g")
        .attr("transform", `translate(${detailMargin.left},${detailMargin.top})`);

    const parseMonth = d3.timeParse("%Y-%m");

    const x = d3.scaleTime()
        .domain(d3.extent(seriesData, d => parseMonth(d.month)))
        .range([0, detailWidth]);

    const maxY = d3.max(seriesData, d => Math.max(d.myResponse || 0, d.theirResponse || 0));
    const y = d3.scaleLinear()
        .domain([0, Math.min(maxY * 1.1, 60)])  // Cap at 60 min
        .range([detailHeight, 0]);

    // Lines
    const myLine = d3.line()
        .defined(d => d.myResponse !== null)
        .x(d => x(parseMonth(d.month)))
        .y(d => y(Math.min(d.myResponse, 60)))
        .curve(d3.curveMonotoneX);

    const theirLine = d3.line()
        .defined(d => d.theirResponse !== null)
        .x(d => x(parseMonth(d.month)))
        .y(d => y(Math.min(d.theirResponse, 60)))
        .curve(d3.curveMonotoneX);

    detailSvg.append("path")
        .datum(seriesData)
        .attr("fill", "none")
        .attr("stroke", "#4ade80")
        .attr("stroke-width", 2)
        .attr("d", myLine);

    detailSvg.append("path")
        .datum(seriesData)
        .attr("fill", "none")
        .attr("stroke", "#f472b6")
        .attr("stroke-width", 2)
        .attr("d", theirLine);

    // Dots
    seriesData.filter(d => d.myResponse !== null).forEach(d => {
        detailSvg.append("circle")
            .attr("cx", x(parseMonth(d.month)))
            .attr("cy", y(Math.min(d.myResponse, 60)))
            .attr("r", 4)
            .attr("fill", "#4ade80");
    });

    seriesData.filter(d => d.theirResponse !== null).forEach(d => {
        detailSvg.append("circle")
            .attr("cx", x(parseMonth(d.month)))
            .attr("cy", y(Math.min(d.theirResponse, 60)))
            .attr("r", 4)
            .attr("fill", "#f472b6");
    });

    // Axes
    detailSvg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${detailHeight})`)
        .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b '%y")).ticks(8));

    detailSvg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y).tickFormat(d => d + " min"));

    // Legend
    detailSvg.append("circle").attr("cx", detailWidth - 140).attr("cy", 10).attr("r", 6).attr("fill", "#4ade80");
    detailSvg.append("text").attr("x", detailWidth - 130).attr("y", 14).attr("fill", "#ddd").attr("font-size", "12px").text("My response");
    detailSvg.append("circle").attr("cx", detailWidth - 40).attr("cy", 10).attr("r", 6).attr("fill", "#f472b6");
    detailSvg.append("text").attr("x", detailWidth - 30).attr("y", 14).attr("fill", "#ddd").attr("font-size", "12px").text("Theirs");
}

function closeDetail() {
    document.getElementById("person-detail").style.display = "none";
    selectedPerson = null;
    render();
}
