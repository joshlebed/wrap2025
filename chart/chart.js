// Load CSV from parent directory
const csvPath = "../message_stats_monthly.csv?" + Date.now();

const margin = { top: 20, right: 30, bottom: 50, left: 60 };
const width = Math.min(1400, window.innerWidth - 80) - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const colors = d3.schemeTableau10.concat(d3.schemePastel1);

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");

d3.csv(csvPath).then(data => {
    const months = Object.keys(data[0]).filter(k => k !== "name" && k !== "total_dm");
    const parseMonth = d3.timeParse("%Y-%m");

    const contacts = data.map(d => d.name);
    const hiddenContacts = new Set();

    // Parse data
    const series = data.map((d, i) => ({
        name: d.name,
        values: months.map(m => ({
            date: parseMonth(m),
            value: +d[m]
        }))
    }));

    // Scales
    const x = d3.scaleTime()
        .domain(d3.extent(months, m => parseMonth(m)))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(series, s => d3.max(s.values, v => v.value))])
        .nice()
        .range([height, 0]);

    // Grid
    svg.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).tickSize(-width).tickFormat(""));

    // Axes
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b %Y")).ticks(d3.timeMonth.every(6)));

    svg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y));

    // Line generator
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.value))
        .curve(d3.curveMonotoneX);

    // Draw lines
    const paths = svg.selectAll(".line")
        .data(series)
        .enter()
        .append("path")
        .attr("class", "line")
        .attr("d", d => line(d.values))
        .attr("stroke", (d, i) => colors[i % colors.length])
        .attr("data-name", d => d.name);

    // Legend
    const legend = d3.select("#legend");
    contacts.forEach((name, i) => {
        const item = legend.append("div")
            .attr("class", "legend-item")
            .attr("data-name", name)
            .on("click", () => toggleLine(name));

        item.append("div")
            .attr("class", "legend-color")
            .style("background", colors[i % colors.length]);

        item.append("span").text(name);
    });

    function toggleLine(name) {
        if (hiddenContacts.has(name)) {
            hiddenContacts.delete(name);
        } else {
            hiddenContacts.add(name);
        }
        updateChart();
    }

    function updateChart() {
        paths.style("opacity", d => hiddenContacts.has(d.name) ? 0 : 1);
        legend.selectAll(".legend-item")
            .classed("hidden", function() {
                return hiddenContacts.has(this.getAttribute("data-name"));
            });
    }

    // Hover interaction
    const focus = svg.append("g").style("display", "none");
    focus.append("line")
        .attr("class", "focus-line")
        .attr("y1", 0)
        .attr("y2", height)
        .style("stroke", "#666")
        .style("stroke-dasharray", "3,3");

    svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .on("mouseover", () => focus.style("display", null))
        .on("mouseout", () => {
            focus.style("display", "none");
            tooltip.style("opacity", 0);
        })
        .on("mousemove", function(event) {
            const [mx] = d3.pointer(event);
            const date = x.invert(mx);
            const monthIdx = d3.bisector(d => d).left(
                months.map(m => parseMonth(m)),
                date
            );
            const closestMonth = months[Math.min(monthIdx, months.length - 1)];
            const closestDate = parseMonth(closestMonth);

            focus.select(".focus-line").attr("x1", x(closestDate)).attr("x2", x(closestDate));

            const visibleSeries = series.filter(s => !hiddenContacts.has(s.name));
            const values = visibleSeries.map(s => {
                const v = s.values.find(v => d3.timeFormat("%Y-%m")(v.date) === closestMonth);
                return { name: s.name, value: v ? v.value : 0 };
            }).sort((a, b) => b.value - a.value);

            const html = `<strong>${closestMonth}</strong><br>` +
                values.slice(0, 10).map(v => `${v.name}: ${v.value}`).join("<br>");

            tooltip
                .html(html)
                .style("opacity", 1)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
        });
}).catch(err => {
    console.error("Failed to load CSV:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_monthly.py</code> first.
        </p>`;
});
