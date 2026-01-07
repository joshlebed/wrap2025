// Bar Chart Race visualization - Monthly totals
const csvPath = "../message_stats_monthly.csv?" + Date.now();

const margin = { top: 20, right: 120, bottom: 30, left: 150 };
const width = Math.min(1200, window.innerWidth - 80) - margin.left - margin.right;
const barHeight = 40;
const numBars = 12;
const height = numBars * barHeight + margin.top + margin.bottom;

const colors = d3.schemeTableau10.concat(d3.schemePastel1);
const colorMap = new Map();

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Controls
const playBtn = document.getElementById("play-btn");
const monthDisplay = document.getElementById("month-display");
const speedSlider = document.getElementById("speed");
const scrubber = document.getElementById("scrubber");
const startDateSelect = document.getElementById("start-date");
const endDateSelect = document.getElementById("end-date");

let isPlaying = false;
let currentMonthIndex = 0;
let animationTimer = null;
let allMonths = [];
let months = [];
let monthlyData = {};
let rawData = [];

d3.csv(csvPath).then(data => {
    rawData = data;
    // Get month columns
    allMonths = Object.keys(data[0]).filter(k => k !== "name" && k !== "total_dm");

    // Populate date selects
    allMonths.forEach(m => {
        const label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        startDateSelect.add(new Option(label, m));
        endDateSelect.add(new Option(label, m));
    });
    startDateSelect.value = "2019-08";
    endDateSelect.value = "2025-12";

    // Assign colors to contacts
    data.forEach((d, i) => {
        colorMap.set(d.name, colors[i % colors.length]);
    });

    setupAndRender();

    startDateSelect.addEventListener("change", setupAndRender);
    endDateSelect.addEventListener("change", setupAndRender);

    function setupAndRender() {
        pause();
        currentMonthIndex = 0;

        const startDate = startDateSelect.value;
        const endDate = endDateSelect.value;

        // Filter months within range
        months = allMonths.filter(m => m >= startDate && m <= endDate);
        if (months.length === 0) return;

        // Calculate top contacts within this range
        const contactTotals = rawData.map(d => {
            let total = 0;
            months.forEach(m => total += (+d[m] || 0));
            return { name: d.name, total, data: d };
        });
        contactTotals.sort((a, b) => b.total - a.total);
        const topContactNames = new Set(contactTotals.slice(0, 50).map(c => c.name));

        // Build monthly data (not cumulative) for top contacts
        monthlyData = {};
        months.forEach(month => {
            monthlyData[month] = rawData
                .filter(d => topContactNames.has(d.name))
                .map(d => ({
                    name: d.name,
                    value: +d[month]
                })).sort((a, b) => b.value - a.value);
        });

        // Setup scrubber
        scrubber.max = months.length - 1;
        scrubber.value = 0;

        // Draw initial state
        updateChart(months[0], 0);
    }

    // Initialize scales (inside promise)
    const x = d3.scaleLinear().range([0, width]);
    const y = d3.scaleBand().range([0, numBars * barHeight]).padding(0.1);

    function updateChart(month, duration) {
        const data = monthlyData[month].slice(0, numBars);

        // Update scales - find max across filtered months for stable axis
        const maxValue = d3.max(months, m =>
            d3.max(monthlyData[m].slice(0, numBars), d => d.value)
        );
        x.domain([0, maxValue * 1.1]);
        y.domain(data.map(d => d.name));

        // Update month display
        monthDisplay.textContent = month;

        // Bars
        const bars = svg.selectAll(".bar")
            .data(data, d => d.name);

        bars.enter()
            .append("rect")
            .attr("class", "bar")
            .attr("x", 0)
            .attr("y", d => y(d.name) ?? height)
            .attr("height", y.bandwidth())
            .attr("fill", d => colorMap.get(d.name))
            .attr("rx", 4)
            .attr("width", 0)
            .merge(bars)
            .transition()
            .duration(duration)
            .ease(d3.easeLinear)
            .attr("y", d => y(d.name))
            .attr("width", d => x(d.value));

        bars.exit()
            .transition()
            .duration(duration)
            .attr("width", 0)
            .attr("y", height)
            .remove();

        // Labels (names)
        const labels = svg.selectAll(".bar-label")
            .data(data, d => d.name);

        labels.enter()
            .append("text")
            .attr("class", "bar-label")
            .attr("x", -10)
            .attr("y", d => (y(d.name) ?? height) + y.bandwidth() / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .text(d => d.name)
            .merge(labels)
            .transition()
            .duration(duration)
            .ease(d3.easeLinear)
            .attr("y", d => y(d.name) + y.bandwidth() / 2);

        labels.exit()
            .transition()
            .duration(duration)
            .attr("y", height)
            .remove();

        // Values
        const values = svg.selectAll(".bar-value")
            .data(data, d => d.name);

        values.enter()
            .append("text")
            .attr("class", "bar-value")
            .attr("x", d => x(d.value) + 5)
            .attr("y", d => (y(d.name) ?? height) + y.bandwidth() / 2)
            .attr("dominant-baseline", "middle")
            .text(d => d.value.toLocaleString())
            .merge(values)
            .transition()
            .duration(duration)
            .ease(d3.easeLinear)
            .attr("x", d => x(d.value) + 5)
            .attr("y", d => y(d.name) + y.bandwidth() / 2)
            .tween("text", function(d) {
                const node = this;
                const startVal = parseInt(node.textContent.replace(/,/g, '')) || 0;
                const i = d3.interpolateNumber(startVal, d.value);
                return function(t) {
                    node.textContent = Math.round(i(t)).toLocaleString();
                };
            });

        values.exit()
            .transition()
            .duration(duration)
            .remove();
    }

    function play() {
        if (currentMonthIndex >= months.length - 1) {
            currentMonthIndex = 0;
            scrubber.value = 0;
        }
        isPlaying = true;
        playBtn.textContent = "Pause";
        tick();
    }

    function pause() {
        isPlaying = false;
        playBtn.textContent = "Play";
        if (animationTimer) {
            clearTimeout(animationTimer);
        }
    }

    function tick() {
        if (!isPlaying || currentMonthIndex >= months.length - 1) {
            pause();
            return;
        }
        currentMonthIndex++;
        scrubber.value = currentMonthIndex;
        const speed = 550 - parseInt(speedSlider.value);
        updateChart(months[currentMonthIndex], speed);
        animationTimer = setTimeout(tick, speed);
    }

    function goToMonth(index) {
        currentMonthIndex = index;
        updateChart(months[currentMonthIndex], 150);
    }

    playBtn.addEventListener("click", () => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    });

    scrubber.addEventListener("input", () => {
        pause();
        goToMonth(parseInt(scrubber.value));
    });

}).catch(err => {
    console.error("Failed to load CSV:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_monthly.py</code> first.
        </p>`;
});
