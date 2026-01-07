// Heatmap - contacts × periods grid
const csvPathMonthly = "../message_stats_monthly.csv?" + Date.now();
const csvPathQuarterly = "../message_stats_quarterly.csv?" + Date.now();

const margin = { top: 60, right: 30, bottom: 30, left: 140 };
const cellHeight = 18;

const tooltip = d3.select("#tooltip");
const timePeriodSelect = document.getElementById("time-period");
const topNSelect = document.getElementById("top-n");
const colorSchemeSelect = document.getElementById("color-scheme");
const scaleModeSelect = document.getElementById("scale-mode");
const startDateSelect = document.getElementById("start-date");
const endDateSelect = document.getElementById("end-date");

let monthlyData, quarterlyData;
let allMonths = [], allQuarters = [];

const colorSchemes = {
    greens: d3.interpolateGreens,
    blues: d3.interpolateBlues,
    purples: d3.interpolatePurples,
    viridis: d3.interpolateViridis,
    magma: d3.interpolateMagma
};

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

    render();

    timePeriodSelect.addEventListener("change", render);
    topNSelect.addEventListener("change", render);
    colorSchemeSelect.addEventListener("change", render);
    scaleModeSelect.addEventListener("change", render);
    startDateSelect.addEventListener("change", render);
    endDateSelect.addEventListener("change", render);
}).catch(err => {
    console.error("Failed to load CSV:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_monthly.py</code> first.
        </p>`;
});

function render() {
    d3.select("#chart").selectAll("*").remove();

    const timePeriod = timePeriodSelect.value;
    const topN = parseInt(topNSelect.value);
    const colorScheme = colorSchemes[colorSchemeSelect.value];
    const scaleMode = scaleModeSelect.value;
    const startDate = startDateSelect.value;
    const endDate = endDateSelect.value;

    const rawData = timePeriod === "monthly" ? monthlyData : quarterlyData;
    let allPeriods = timePeriod === "monthly" ? allMonths : allQuarters;

    // Filter periods within date range
    let periods;
    if (timePeriod === "monthly") {
        periods = allPeriods.filter(p => p >= startDate && p <= endDate);
    } else {
        const startQ = startDate.slice(0, 4) + "-Q" + Math.ceil(parseInt(startDate.slice(5, 7)) / 3);
        const endQ = endDate.slice(0, 4) + "-Q" + Math.ceil(parseInt(endDate.slice(5, 7)) / 3);
        periods = allPeriods.filter(p => p >= startQ && p <= endQ);
    }

    if (periods.length === 0) return;

    const cellWidth = timePeriod === "monthly" ? 12 : 35;

    // Calculate top contacts within this date range (using monthly data for consistency)
    const filteredMonths = allMonths.filter(m => m >= startDate && m <= endDate);
    const contactTotals = monthlyData.map(d => {
        let total = 0;
        filteredMonths.forEach(m => total += (+d[m] || 0));
        return { name: d.name, total, data: d };
    });
    contactTotals.sort((a, b) => b.total - a.total);
    const topContactNames = contactTotals.slice(0, topN).map(c => c.name);

    // Get the data for top contacts from the appropriate dataset
    const contacts = topContactNames.map(name => rawData.find(d => d.name === name)).filter(Boolean);
    const width = periods.length * cellWidth + margin.left + margin.right;
    const height = contacts.length * cellHeight + margin.top + margin.bottom;

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Calculate max values
    const globalMax = d3.max(contacts, d => d3.max(periods, m => +d[m]));
    const rowMaxes = contacts.map(d => d3.max(periods, m => +d[m]));

    // Update color scale legend (log scale)
    const gradient = document.getElementById("gradient");
    gradient.style.background = `linear-gradient(to right, ${colorScheme(0)}, ${colorScheme(0.3)}, ${colorScheme(0.6)}, ${colorScheme(1)})`;
    document.getElementById("max-label").textContent = globalMax.toLocaleString() + " (log)";

    // X scale (periods)
    const x = d3.scaleBand()
        .domain(periods)
        .range([0, periods.length * cellWidth]);

    // Y scale (contacts)
    const y = d3.scaleBand()
        .domain(contacts.map(d => d.name))
        .range([0, contacts.length * cellHeight]);

    // Draw cells with log scale for better distribution
    contacts.forEach((contact, rowIdx) => {
        const rowMax = rowMaxes[rowIdx];
        const maxVal = scaleMode === "row" ? rowMax : globalMax;

        // Use log scale for color mapping
        const logScale = d3.scaleLog()
            .domain([1, Math.max(maxVal, 2)])
            .range([0, 1])
            .clamp(true);

        const colorScale = val => colorScheme(logScale(Math.max(val, 1)));

        svg.selectAll(`.cell-${rowIdx}`)
            .data(periods)
            .enter()
            .append("rect")
            .attr("class", "cell")
            .attr("x", p => x(p))
            .attr("y", y(contact.name))
            .attr("width", cellWidth - 1)
            .attr("height", cellHeight - 1)
            .attr("rx", 2)
            .attr("fill", p => {
                const val = +contact[p];
                // Use colorScheme(0) for zero values so they fit the scale
                return val === 0 ? colorScheme(0) : colorScale(val);
            })
            .attr("stroke", "#1a1a2e")
            .attr("stroke-width", 1)
            .on("mouseenter", function(event, p) {
                const val = +contact[p];
                tooltip
                    .html(`<strong>${contact.name}</strong><br>${p}<br>${val.toLocaleString()} messages`)
                    .style("opacity", 1);
            })
            .on("mousemove", function(event) {
                tooltip
                    .style("left", (event.pageX + 15) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseleave", function() {
                tooltip.style("opacity", 0);
            });
    });

    // Row labels (contact names)
    svg.selectAll(".row-label")
        .data(contacts)
        .enter()
        .append("text")
        .attr("class", "row-label")
        .attr("x", -8)
        .attr("y", d => y(d.name) + cellHeight / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .text(d => d.name.length > 18 ? d.name.slice(0, 17) + "…" : d.name)
        .on("click", (event, d) => {
            // Open line chart focused on this contact
            window.location.href = `index.html?highlight=${encodeURIComponent(d.name)}`;
        });

    // Column labels - show subset based on period type
    const labelInterval = timePeriod === "monthly" ? 6 : 2;
    svg.selectAll(".col-label")
        .data(periods.filter((p, i) => i % labelInterval === 0))
        .enter()
        .append("text")
        .attr("class", "col-label")
        .attr("x", p => x(p) + cellWidth / 2)
        .attr("y", -8)
        .attr("text-anchor", "middle")
        .attr("transform", p => `rotate(-45, ${x(p) + cellWidth / 2}, -8)`)
        .text(p => {
            if (timePeriod === "monthly") {
                const parseMonth = d3.timeParse("%Y-%m");
                return d3.timeFormat("%b '%y")(parseMonth(p));
            } else {
                return p.replace("-", " ");
            }
        });

    // Year markers
    const years = [...new Set(periods.map(p => p.split("-")[0]))];
    years.forEach(year => {
        const firstPeriod = periods.find(p => p.startsWith(year));
        if (firstPeriod) {
            svg.append("line")
                .attr("x1", x(firstPeriod))
                .attr("x2", x(firstPeriod))
                .attr("y1", -3)
                .attr("y2", contacts.length * cellHeight)
                .attr("stroke", "#444")
                .attr("stroke-dasharray", "3,3");
        }
    });
}
