// Sent vs Received Scatter Plot
const csvPath = "../message_stats_sent_recv.csv?" + Date.now();

const margin = { top: 40, right: 40, bottom: 60, left: 70 };
const width = Math.min(800, window.innerWidth - 100) - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

const colors = d3.schemeTableau10;

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");
const startDateSelect = document.getElementById("start-date");
const endDateSelect = document.getElementById("end-date");
const sizeModeSelect = document.getElementById("size-mode");

let rawData, months;
let selectedPerson = null;

d3.csv(csvPath).then(data => {
    rawData = data;

    // Extract month columns
    const cols = Object.keys(data[0]);
    months = cols.filter(c => c.match(/^\d{4}-\d{2}_sent$/)).map(c => c.replace("_sent", ""));

    // Populate date selects
    months.forEach(m => {
        const label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        startDateSelect.add(new Option(label, m));
        endDateSelect.add(new Option(label, m));
    });
    startDateSelect.value = "2019-08";
    endDateSelect.value = "2025-12";

    render();

    startDateSelect.addEventListener("change", render);
    endDateSelect.addEventListener("change", render);
    sizeModeSelect.addEventListener("change", render);
}).catch(err => {
    console.error("Failed to load CSV:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_detailed.py</code> first.
        </p>`;
});

function render() {
    svg.selectAll("*").remove();

    const startDate = startDateSelect.value;
    const endDate = endDateSelect.value;
    const sizeMode = sizeModeSelect.value;

    // Filter months by date range
    const filteredMonths = months.filter(m => m >= startDate && m <= endDate);

    // Calculate totals for filtered range
    const plotData = rawData.map(d => {
        let sent = 0, recv = 0;
        filteredMonths.forEach(m => {
            sent += +d[`${m}_sent`] || 0;
            recv += +d[`${m}_recv`] || 0;
        });
        return {
            name: d.name,
            sent,
            recv,
            total: sent + recv,
            ratio: sent / (recv || 1)
        };
    }).filter(d => d.total > 0);

    // Sort by total and show only top contacts
    plotData.sort((a, b) => b.total - a.total);

    // Scales
    const maxVal = d3.max(plotData, d => Math.max(d.sent, d.recv));
    const x = d3.scaleLinear()
        .domain([0, maxVal * 1.1])
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, maxVal * 1.1])
        .range([height, 0]);

    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(plotData, d => d.total)])
        .range([5, 30]);

    // Balance line (y = x)
    svg.append("line")
        .attr("class", "balance-line")
        .attr("x1", 0)
        .attr("y1", height)
        .attr("x2", width)
        .attr("y2", y(x.invert(width)));

    // Axes
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format(",")));

    svg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y).tickFormat(d3.format(",")));

    // Axis labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 45)
        .attr("text-anchor", "middle")
        .attr("fill", "#888")
        .text("Messages Received");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .attr("fill", "#888")
        .text("Messages Sent");

    // Quadrant labels
    svg.append("text")
        .attr("x", width - 10)
        .attr("y", 20)
        .attr("text-anchor", "end")
        .attr("fill", "#4ade80")
        .attr("opacity", 0.5)
        .attr("font-size", "12px")
        .text("You reach out more →");

    svg.append("text")
        .attr("x", 10)
        .attr("y", height - 10)
        .attr("text-anchor", "start")
        .attr("fill", "#f472b6")
        .attr("opacity", 0.5)
        .attr("font-size", "12px")
        .text("← They reach out more");

    // Dots
    svg.selectAll(".dot")
        .data(plotData)
        .enter()
        .append("circle")
        .attr("class", d => "dot" + (d.name === selectedPerson ? " selected" : ""))
        .attr("cx", d => x(d.recv))
        .attr("cy", d => y(d.sent))
        .attr("r", d => sizeMode === "total" ? sizeScale(d.total) : 8)
        .attr("fill", (d, i) => colors[i % colors.length])
        .attr("opacity", 0.7)
        .on("mouseenter", function(event, d) {
            tooltip
                .html(`<strong>${d.name}</strong><br>
                       Sent: ${d.sent.toLocaleString()}<br>
                       Received: ${d.recv.toLocaleString()}<br>
                       Ratio: ${d.ratio.toFixed(2)}`)
                .style("opacity", 1)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
            d3.select(this).attr("r", function(d) {
                return (sizeMode === "total" ? sizeScale(d.total) : 8) + 3;
            });
        })
        .on("mouseleave", function(event, d) {
            tooltip.style("opacity", 0);
            d3.select(this).attr("r", sizeMode === "total" ? sizeScale(d.total) : 8);
        })
        .on("click", function(event, d) {
            showPersonDetail(d.name);
        });

    // Labels for top contacts
    plotData.slice(0, 10).forEach((d, i) => {
        svg.append("text")
            .attr("x", x(d.recv) + 8)
            .attr("y", y(d.sent) + 4)
            .attr("fill", "#ddd")
            .attr("font-size", "10px")
            .text(d.name.split(" ")[0]);  // First name only
    });
}

function showPersonDetail(name) {
    selectedPerson = name;
    render();

    document.getElementById("person-detail").style.display = "block";
    document.getElementById("person-name").textContent = name + " - Sent/Received Over Time";

    const personData = rawData.find(d => d.name === name);
    if (!personData) return;

    // Build time series data
    const seriesData = months.map(m => ({
        month: m,
        sent: +personData[`${m}_sent`] || 0,
        recv: +personData[`${m}_recv`] || 0
    })).filter(d => d.sent > 0 || d.recv > 0);

    // Clear and draw detail chart
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

    const y = d3.scaleLinear()
        .domain([0, d3.max(seriesData, d => Math.max(d.sent, d.recv))])
        .nice()
        .range([detailHeight, 0]);

    // Area for sent
    detailSvg.append("path")
        .datum(seriesData)
        .attr("fill", "#4ade80")
        .attr("fill-opacity", 0.3)
        .attr("d", d3.area()
            .x(d => x(parseMonth(d.month)))
            .y0(detailHeight)
            .y1(d => y(d.sent))
            .curve(d3.curveMonotoneX));

    // Area for received
    detailSvg.append("path")
        .datum(seriesData)
        .attr("fill", "#f472b6")
        .attr("fill-opacity", 0.3)
        .attr("d", d3.area()
            .x(d => x(parseMonth(d.month)))
            .y0(detailHeight)
            .y1(d => y(d.recv))
            .curve(d3.curveMonotoneX));

    // Lines
    detailSvg.append("path")
        .datum(seriesData)
        .attr("fill", "none")
        .attr("stroke", "#4ade80")
        .attr("stroke-width", 2)
        .attr("d", d3.line()
            .x(d => x(parseMonth(d.month)))
            .y(d => y(d.sent))
            .curve(d3.curveMonotoneX));

    detailSvg.append("path")
        .datum(seriesData)
        .attr("fill", "none")
        .attr("stroke", "#f472b6")
        .attr("stroke-width", 2)
        .attr("d", d3.line()
            .x(d => x(parseMonth(d.month)))
            .y(d => y(d.recv))
            .curve(d3.curveMonotoneX));

    // Axes
    detailSvg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${detailHeight})`)
        .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b '%y")).ticks(8));

    detailSvg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y));

    // Legend
    detailSvg.append("circle").attr("cx", detailWidth - 100).attr("cy", 10).attr("r", 6).attr("fill", "#4ade80");
    detailSvg.append("text").attr("x", detailWidth - 90).attr("y", 14).attr("fill", "#ddd").attr("font-size", "12px").text("Sent");
    detailSvg.append("circle").attr("cx", detailWidth - 50).attr("cy", 10).attr("r", 6).attr("fill", "#f472b6");
    detailSvg.append("text").attr("x", detailWidth - 40).attr("y", 14).attr("fill", "#ddd").attr("font-size", "12px").text("Received");
}

function closeDetail() {
    document.getElementById("person-detail").style.display = "none";
    selectedPerson = null;
    render();
}
