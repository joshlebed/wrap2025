// Bump Chart - shows ranking changes over time
const csvPathMonthly = "../message_stats_monthly.csv?" + Date.now();
const csvPathQuarterly = "../message_stats_quarterly.csv?" + Date.now();

const margin = { top: 30, right: 150, bottom: 50, left: 60 };
const width = Math.min(1400, window.innerWidth - 80) - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const colors = d3.schemeTableau10.concat(d3.schemePastel1);

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const timePeriodSelect = document.getElementById("time-period");
const topNSelect = document.getElementById("top-n");
const rankModeSelect = document.getElementById("rank-mode");
const startDateSelect = document.getElementById("start-date");
const endDateSelect = document.getElementById("end-date");

let monthlyData, quarterlyData, colorMap;
let allMonths = [], allQuarters = [];

// Load both datasets
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

    // Assign colors based on monthly data order
    colorMap = new Map();
    monthlyData.forEach((d, i) => {
        colorMap.set(d.name, colors[i % colors.length]);
    });

    render();

    timePeriodSelect.addEventListener("change", render);
    topNSelect.addEventListener("change", render);
    rankModeSelect.addEventListener("change", render);
    startDateSelect.addEventListener("change", render);
    endDateSelect.addEventListener("change", render);
}).catch(err => {
    console.error("Failed to load CSV:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_monthly.py</code> first.<br>
            <small style="color: #888;">Error: ${err.message}</small>
        </p>`;
});

function render() {
    svg.selectAll("*").remove();

    const timePeriod = timePeriodSelect.value;
    const topN = parseInt(topNSelect.value);
    const mode = rankModeSelect.value;
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

    // Calculate top contacts within this date range (using monthly data for consistency)
    const filteredMonths = allMonths.filter(m => m >= startDate && m <= endDate);
    const contactTotals = monthlyData.map(d => {
        let total = 0;
        filteredMonths.forEach(m => total += (+d[m] || 0));
        return { name: d.name, total };
    });
    contactTotals.sort((a, b) => b.total - a.total);
    const topContactNames = new Set(contactTotals.slice(0, Math.max(topN * 2, 30)).map(c => c.name));

    // Parse period labels
    const parsePeriod = timePeriod === "monthly"
        ? d3.timeParse("%Y-%m")
        : (p => {
            const [year, q] = p.split("-Q");
            const month = (parseInt(q) - 1) * 3 + 1;
            return new Date(parseInt(year), month, 1);
        });

    const formatPeriod = timePeriod === "monthly"
        ? d3.timeFormat("%b %Y")
        : d3.timeFormat("Q%q %Y");

    // Filter data to only include top contacts from the date range
    const filteredData = rawData.filter(d => topContactNames.has(d.name));

    // Calculate rankings for each period
    const rankings = {};
    let cumulative = {};
    filteredData.forEach(d => cumulative[d.name] = 0);

    periods.forEach((period, periodIdx) => {
        // Update cumulative
        filteredData.forEach(d => {
            cumulative[d.name] += +d[period] || 0;
        });

        // Get values based on mode
        let values;
        if (mode === "period") {
            values = filteredData.map(d => ({ name: d.name, value: +d[period] || 0 }));
        } else {
            values = filteredData.map(d => ({ name: d.name, value: cumulative[d.name] }));
        }

        // Sort and assign ranks
        values.sort((a, b) => b.value - a.value);
        rankings[period] = {};
        values.forEach((v, i) => {
            rankings[period][v.name] = i + 1;
        });
    });

    // Find contacts that are ever in top N within the filtered range
    const topContacts = new Set();
    periods.forEach(period => {
        Object.entries(rankings[period]).forEach(([name, rank]) => {
            if (rank <= topN) topContacts.add(name);
        });
    });

    // Build series data
    const series = Array.from(topContacts).map(name => ({
        name,
        values: periods.map(period => ({
            date: parsePeriod(period),
            rank: rankings[period][name],
            period: period
        }))
    }));

    // Scales
    const x = d3.scaleTime()
        .domain(d3.extent(periods, p => parsePeriod(p)))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([1, topN])
        .range([0, height]);

    // Grid
    svg.append("g")
        .attr("class", "grid")
        .selectAll("line")
        .data(d3.range(1, topN + 1))
        .enter()
        .append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d))
        .attr("stroke", "#333");

    // X axis
    const tickInterval = timePeriod === "monthly"
        ? d3.timeMonth.every(6)
        : d3.timeMonth.every(12);

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height + 10})`)
        .call(d3.axisBottom(x)
            .tickFormat(timePeriod === "monthly" ? d3.timeFormat("%b '%y") : d3.timeFormat("Q%q '%y"))
            .ticks(tickInterval));

    // Y axis (ranks)
    svg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y).ticks(topN).tickFormat(d => `#${d}`));

    // Line generator
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(Math.min(d.rank, topN + 1)))
        .curve(d3.curveMonotoneX)
        .defined(d => d.rank <= topN);

    // Draw lines
    svg.selectAll(".bump-line")
        .data(series)
        .enter()
        .append("path")
        .attr("class", "bump-line")
        .attr("d", d => line(d.values))
        .attr("stroke", d => colorMap.get(d.name))
        .on("mouseenter", function(event, d) {
            svg.selectAll(".bump-line").attr("opacity", 0.2);
            d3.select(this).attr("opacity", 1).attr("stroke-width", 4);
            svg.selectAll(".bump-label").attr("opacity", l => l.name === d.name ? 1 : 0.2);
            svg.selectAll(".bump-dot").attr("opacity", dot => dot.name === d.name ? 1 : 0.1);
        })
        .on("mouseleave", function() {
            svg.selectAll(".bump-line").attr("opacity", 0.8).attr("stroke-width", 2.5);
            svg.selectAll(".bump-label").attr("opacity", 1);
            svg.selectAll(".bump-dot").attr("opacity", 1);
        });

    // End labels
    svg.selectAll(".bump-label")
        .data(series.filter(s => s.values[s.values.length - 1].rank <= topN))
        .enter()
        .append("text")
        .attr("class", "bump-label")
        .attr("x", width + 10)
        .attr("y", d => y(d.values[d.values.length - 1].rank))
        .attr("dominant-baseline", "middle")
        .text(d => d.name)
        .attr("fill", d => colorMap.get(d.name));

    // Dots at each data point
    series.forEach(s => {
        s.values.filter(v => v.rank <= topN).forEach(d => {
            svg.append("circle")
                .datum({ name: s.name, ...d })
                .attr("class", "bump-dot")
                .attr("cx", x(d.date))
                .attr("cy", y(d.rank))
                .attr("r", timePeriod === "quarterly" ? 6 : 3)
                .attr("fill", colorMap.get(s.name));
        });
    });
}
