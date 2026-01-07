// Stream Graph - stacked area showing messaging volume over time
const csvPathMonthly = "../message_stats_monthly.csv?" + Date.now();
const csvPathQuarterly = "../message_stats_quarterly.csv?" + Date.now();

const margin = { top: 20, right: 30, bottom: 50, left: 60 };
const width = Math.min(1400, window.innerWidth - 80) - margin.left - margin.right;
const height = 450 - margin.top - margin.bottom;

const colors = d3.schemeTableau10.concat(d3.schemePastel1);

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");
const timePeriodSelect = document.getElementById("time-period");
const topNSelect = document.getElementById("top-n");
const offsetSelect = document.getElementById("offset-mode");
const startDateSelect = document.getElementById("start-date");
const endDateSelect = document.getElementById("end-date");

let monthlyData, quarterlyData, colorMap;
let allMonths = [], allQuarters = [];
const hiddenContacts = new Set();

Promise.all([
    d3.csv(csvPathMonthly),
    d3.csv(csvPathQuarterly)
]).then(([monthly, quarterly]) => {
    monthlyData = monthly;
    quarterlyData = quarterly;

    // Get all period columns
    allMonths = Object.keys(monthly[0]).filter(k => k !== "name" && k !== "total_dm");
    allQuarters = Object.keys(quarterly[0]).filter(k => k !== "name" && k !== "total_dm");

    // Populate date selects with months
    allMonths.forEach(m => {
        const label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        startDateSelect.add(new Option(label, m));
        endDateSelect.add(new Option(label, m));
    });
    startDateSelect.value = "2019-08";
    endDateSelect.value = "2025-12";

    // Assign colors
    colorMap = new Map();
    monthlyData.forEach((d, i) => {
        colorMap.set(d.name, colors[i % colors.length]);
    });

    render();

    timePeriodSelect.addEventListener("change", () => { hiddenContacts.clear(); render(); });
    topNSelect.addEventListener("change", () => { hiddenContacts.clear(); render(); });
    offsetSelect.addEventListener("change", render);
    startDateSelect.addEventListener("change", () => { hiddenContacts.clear(); render(); });
    endDateSelect.addEventListener("change", () => { hiddenContacts.clear(); render(); });
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

    const timePeriod = timePeriodSelect.value;
    const topN = parseInt(topNSelect.value);
    const offsetMode = offsetSelect.value;
    const startDate = startDateSelect.value;
    const endDate = endDateSelect.value;

    const rawData = timePeriod === "monthly" ? monthlyData : quarterlyData;
    let allPeriods = timePeriod === "monthly" ? allMonths : allQuarters;

    // Filter periods within date range
    let periods;
    if (timePeriod === "monthly") {
        periods = allPeriods.filter(p => p >= startDate && p <= endDate);
    } else {
        // Convert months to quarters for filtering
        const startQ = startDate.slice(0, 4) + "-Q" + Math.ceil(parseInt(startDate.slice(5, 7)) / 3);
        const endQ = endDate.slice(0, 4) + "-Q" + Math.ceil(parseInt(endDate.slice(5, 7)) / 3);
        periods = allPeriods.filter(p => p >= startQ && p <= endQ);
    }

    if (periods.length === 0) return;

    // Parse period labels
    const parsePeriod = timePeriod === "monthly"
        ? d3.timeParse("%Y-%m")
        : (p => {
            const [year, q] = p.split("-Q");
            const month = (parseInt(q) - 1) * 3 + 1;
            return new Date(parseInt(year), month, 1);
        });

    // Calculate top contacts within this date range (using monthly data for consistency)
    const filteredMonths = allMonths.filter(m => m >= startDate && m <= endDate);
    const contactTotals = monthlyData.map(d => {
        let total = 0;
        filteredMonths.forEach(m => total += (+d[m] || 0));
        return { name: d.name, total };
    });
    contactTotals.sort((a, b) => b.total - a.total);

    // Get top N contacts within the range
    const topContacts = contactTotals.slice(0, topN).map(c => c.name);
    const visibleContacts = topContacts.filter(c => !hiddenContacts.has(c));

    // Build stacked data
    const stackData = periods.map(period => {
        const row = { date: parsePeriod(period), period: period };
        topContacts.forEach(name => {
            const d = rawData.find(r => r.name === name);
            row[name] = hiddenContacts.has(name) ? 0 : (d ? (+d[period] || 0) : 0);
        });
        return row;
    });

    // Create stack generator
    const stack = d3.stack()
        .keys(topContacts)
        .offset(d3[`stackOffset${offsetMode.charAt(0).toUpperCase() + offsetMode.slice(1)}`] || d3.stackOffsetNone)
        .order(d3.stackOrderInsideOut);

    const series = stack(stackData);

    // Scales
    const x = d3.scaleTime()
        .domain(d3.extent(stackData, d => d.date))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([
            d3.min(series, s => d3.min(s, d => d[0])),
            d3.max(series, s => d3.max(s, d => d[1]))
        ])
        .range([height, 0]);

    // Area generator
    const area = d3.area()
        .x(d => x(d.data.date))
        .y0(d => y(d[0]))
        .y1(d => y(d[1]))
        .curve(d3.curveCardinal.tension(0.5));

    // Draw areas
    svg.selectAll(".stream-area")
        .data(series)
        .enter()
        .append("path")
        .attr("class", "stream-area")
        .attr("d", area)
        .attr("fill", d => colorMap.get(d.key))
        .attr("data-name", d => d.key)
        .on("mouseenter", function(event, d) {
            svg.selectAll(".stream-area").classed("faded", true);
            d3.select(this).classed("faded", false);
        })
        .on("mouseleave", function() {
            svg.selectAll(".stream-area").classed("faded", false);
            tooltip.style("opacity", 0);
        })
        .on("mousemove", function(event, d) {
            const [mx] = d3.pointer(event);
            const date = x.invert(mx);

            // Find closest period
            let closestData = stackData[0];
            let minDist = Infinity;
            stackData.forEach(s => {
                const dist = Math.abs(s.date - date);
                if (dist < minDist) {
                    minDist = dist;
                    closestData = s;
                }
            });

            const value = closestData ? closestData[d.key] : 0;

            tooltip
                .html(`<strong>${d.key}</strong><br>${closestData.period}: ${value.toLocaleString()} messages`)
                .style("opacity", 1)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
        });

    // X axis
    const tickInterval = timePeriod === "monthly"
        ? d3.timeMonth.every(6)
        : d3.timeMonth.every(12);
    const tickFormat = timePeriod === "monthly"
        ? d3.timeFormat("%b '%y")
        : d3.timeFormat("Q%q '%y");

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(tickFormat).ticks(tickInterval));

    // Y axis
    svg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y).ticks(8));

    // Legend
    const legend = d3.select("#legend");
    topContacts.forEach((name, i) => {
        const item = legend.append("div")
            .attr("class", "legend-item" + (hiddenContacts.has(name) ? " hidden" : ""))
            .style("display", "inline-flex")
            .style("align-items", "center")
            .style("gap", "6px")
            .style("cursor", "pointer")
            .style("padding", "4px 8px")
            .style("margin", "0 8px 8px 0")
            .style("border-radius", "4px")
            .style("opacity", hiddenContacts.has(name) ? 0.3 : 1)
            .on("click", () => {
                if (hiddenContacts.has(name)) {
                    hiddenContacts.delete(name);
                } else {
                    hiddenContacts.add(name);
                }
                render();
            });

        item.append("div")
            .style("width", "16px")
            .style("height", "16px")
            .style("border-radius", "3px")
            .style("background", colorMap.get(name));

        item.append("span")
            .style("color", "#ddd")
            .style("font-size", "13px")
            .text(name);
    });
}
