// Line chart with date range filtering
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
const startDateSelect = document.getElementById("start-date");
const endDateSelect = document.getElementById("end-date");
const topNSelect = document.getElementById("top-n");

let rawData, allMonths, colorMap = new Map();
const hiddenContacts = new Set();

d3.csv(csvPath).then(data => {
    rawData = data;
    allMonths = Object.keys(data[0]).filter(k => k !== "name" && k !== "total_dm");

    // Populate date selects
    allMonths.forEach(m => {
        const label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        startDateSelect.add(new Option(label, m));
        endDateSelect.add(new Option(label, m));
    });
    startDateSelect.value = "2019-08";
    endDateSelect.value = "2025-12";

    // Assign colors to all contacts
    data.forEach((d, i) => {
        colorMap.set(d.name, colors[i % colors.length]);
    });

    render();

    startDateSelect.addEventListener("change", () => { hiddenContacts.clear(); render(); });
    endDateSelect.addEventListener("change", () => { hiddenContacts.clear(); render(); });
    topNSelect.addEventListener("change", () => { hiddenContacts.clear(); render(); });
}).catch(err => {
    console.error("Failed to load CSV:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_monthly.py</code> first.
        </p>`;
});

function render() {
    svg.selectAll("*").remove();
    d3.select("#legend").selectAll("*").remove();

    const startDate = startDateSelect.value;
    const endDate = endDateSelect.value;
    const topN = parseInt(topNSelect.value);

    // Filter months within range
    const months = allMonths.filter(m => m >= startDate && m <= endDate);
    if (months.length === 0) return;

    const parseMonth = d3.timeParse("%Y-%m");

    // Calculate totals within range and get top N
    const contactTotals = rawData.map(d => {
        let total = 0;
        months.forEach(m => total += (+d[m] || 0));
        return { name: d.name, total, data: d };
    });
    contactTotals.sort((a, b) => b.total - a.total);
    const topContacts = contactTotals.slice(0, topN);

    // Build series data for top contacts
    const series = topContacts.map(c => ({
        name: c.name,
        values: months.map(m => ({
            date: parseMonth(m),
            value: +c.data[m] || 0
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
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("d", d => line(d.values))
        .attr("stroke", d => colorMap.get(d.name))
        .attr("opacity", d => hiddenContacts.has(d.name) ? 0 : 0.8)
        .attr("data-name", d => d.name);

    // Legend
    const legend = d3.select("#legend");
    topContacts.forEach((c, i) => {
        const item = legend.append("div")
            .attr("class", "legend-item" + (hiddenContacts.has(c.name) ? " hidden" : ""))
            .style("display", "inline-flex")
            .style("align-items", "center")
            .style("gap", "6px")
            .style("cursor", "pointer")
            .style("padding", "4px 8px")
            .style("margin", "0 8px 8px 0")
            .style("border-radius", "4px")
            .style("opacity", hiddenContacts.has(c.name) ? 0.3 : 1)
            .on("click", () => {
                if (hiddenContacts.has(c.name)) {
                    hiddenContacts.delete(c.name);
                } else {
                    hiddenContacts.add(c.name);
                }
                render();
            });

        item.append("div")
            .style("width", "20px")
            .style("height", "3px")
            .style("border-radius", "2px")
            .style("background", colorMap.get(c.name));

        item.append("span")
            .style("color", "#ddd")
            .style("font-size", "13px")
            .text(c.name);
    });

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
}
