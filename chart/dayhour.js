// Day/Hour Heatmap
const jsonPath = "../message_day_hour.json?" + Date.now();

const margin = { top: 30, right: 30, bottom: 30, left: 80 };
const cellSize = 28;
const width = 24 * cellSize + margin.left + margin.right;
const height = 7 * cellSize + margin.top + margin.bottom;

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 24 }, (_, i) => i);

const colorSchemes = {
    greens: d3.interpolateGreens,
    blues: d3.interpolateBlues,
    purples: d3.interpolatePurples,
    oranges: d3.interpolateOranges,
    reds: d3.interpolateReds,
    viridis: d3.interpolateViridis,
    magma: d3.interpolateMagma,
    plasma: d3.interpolatePlasma,
    inferno: d3.interpolateInferno,
    cividis: d3.interpolateCividis,
    turbo: d3.interpolateTurbo
};

const tooltip = d3.select("#tooltip");
const contactSelect = document.getElementById("contact-select");
const startYearSelect = document.getElementById("start-year");
const endYearSelect = document.getElementById("end-year");
const colorSchemeSelect = document.getElementById("color-scheme");

let rawData;

d3.json(jsonPath).then(data => {
    rawData = data;

    // Populate contact dropdown
    const contacts = Object.keys(data).sort();
    contacts.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        contactSelect.appendChild(option);
    });

    render();

    contactSelect.addEventListener("change", render);
    startYearSelect.addEventListener("change", render);
    endYearSelect.addEventListener("change", render);
    colorSchemeSelect.addEventListener("change", render);
}).catch(err => {
    console.error("Failed to load JSON:", err);
    document.getElementById("chart").innerHTML =
        `<p style="color: #f87171; text-align: center; padding: 40px;">
            Failed to load data. Run <code>python3 query_messages_detailed.py</code> first.
        </p>`;
});

function render() {
    d3.select("#chart").selectAll("*").remove();

    const contact = contactSelect.value;
    const startYear = parseInt(startYearSelect.value);
    const endYear = parseInt(endYearSelect.value);

    // Get the grid data - combine years in range
    let grid = Array.from({ length: 7 }, () => Array(24).fill(0));

    if (contact === "__all__") {
        // Combine all contacts within year range
        Object.values(rawData).forEach(contactData => {
            for (let y = startYear; y <= endYear; y++) {
                const sourceGrid = contactData.by_year[y] || [];
                for (let day = 0; day < 7; day++) {
                    for (let hour = 0; hour < 24; hour++) {
                        grid[day][hour] += (sourceGrid[day]?.[hour] || 0);
                    }
                }
            }
        });
    } else {
        const contactData = rawData[contact];
        if (!contactData) return;
        // Combine years in range for this contact
        for (let y = startYear; y <= endYear; y++) {
            const sourceGrid = contactData.by_year[y] || [];
            for (let day = 0; day < 7; day++) {
                for (let hour = 0; hour < 24; hour++) {
                    grid[day][hour] += (sourceGrid[day]?.[hour] || 0);
                }
            }
        }
    }

    // Flatten for D3
    const cells = [];
    let maxVal = 0;
    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            const value = grid[day]?.[hour] || 0;
            cells.push({ day, hour, value });
            maxVal = Math.max(maxVal, value);
        }
    }

    // Get selected color scheme
    const colorScheme = colorSchemes[colorSchemeSelect.value];

    // Log scale for color - better distribution for wide value ranges
    const logScale = d3.scaleLog()
        .domain([1, Math.max(maxVal, 2)])
        .range([0, 1])
        .clamp(true);

    // Update color scale legend to reflect log scale
    const gradient = document.getElementById("gradient");
    gradient.style.background = `linear-gradient(to right, ${colorScheme(0)}, ${colorScheme(0.25)}, ${colorScheme(0.5)}, ${colorScheme(0.75)}, ${colorScheme(1)})`;
    document.getElementById("max-label").textContent = maxVal.toLocaleString() + " (log)";

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Draw cells
    svg.selectAll(".cell")
        .data(cells)
        .enter()
        .append("rect")
        .attr("class", "cell")
        .attr("x", d => d.hour * cellSize)
        .attr("y", d => d.day * cellSize)
        .attr("width", cellSize - 2)
        .attr("height", cellSize - 2)
        .attr("rx", 3)
        .attr("fill", d => d.value === 0 ? colorScheme(0) : colorScheme(logScale(d.value)))
        .on("mouseenter", function(event, d) {
            const hourLabel = d.hour === 0 ? "12am" : d.hour < 12 ? d.hour + "am" : d.hour === 12 ? "12pm" : (d.hour - 12) + "pm";
            tooltip
                .html(`<strong>${days[d.day]} ${hourLabel}</strong><br>${d.value.toLocaleString()} messages`)
                .style("opacity", 1)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));

    // Day labels
    svg.selectAll(".day-label")
        .data(days)
        .enter()
        .append("text")
        .attr("class", "day-label")
        .attr("x", -10)
        .attr("y", (d, i) => i * cellSize + cellSize / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .text(d => d);

    // Hour labels
    svg.selectAll(".hour-label")
        .data(hours.filter(h => h % 3 === 0))
        .enter()
        .append("text")
        .attr("class", "hour-label")
        .attr("x", d => d * cellSize + cellSize / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .text(d => {
            if (d === 0) return "12a";
            if (d < 12) return d + "a";
            if (d === 12) return "12p";
            return (d - 12) + "p";
        });
}
