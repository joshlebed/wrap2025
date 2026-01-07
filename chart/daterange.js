// Shared date range utilities for all charts

// Generate month options from Jan 2019 to Feb 2026
function generateMonthOptions() {
    const months = [];
    for (let year = 2019; year <= 2026; year++) {
        const maxMonth = year === 2026 ? 2 : 12;
        for (let month = 1; month <= maxMonth; month++) {
            const value = `${year}-${String(month).padStart(2, '0')}`;
            const label = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            months.push({ value, label });
        }
    }
    return months;
}

// Generate quarter options from Q1 2019 to Q1 2026
function generateQuarterOptions() {
    const quarters = [];
    for (let year = 2019; year <= 2026; year++) {
        const maxQ = year === 2026 ? 1 : 4;
        for (let q = 1; q <= maxQ; q++) {
            const value = `${year}-Q${q}`;
            quarters.push({ value, label: `Q${q} ${year}` });
        }
    }
    return quarters;
}

// Populate date range dropdowns
function populateDateRangeSelects(startSelect, endSelect, isQuarterly = false) {
    const options = isQuarterly ? generateQuarterOptions() : generateMonthOptions();

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    options.forEach(opt => {
        startSelect.add(new Option(opt.label, opt.value));
        endSelect.add(new Option(opt.label, opt.value));
    });

    // Default: start at beginning, end at last
    startSelect.value = options[0].value;
    endSelect.value = options[options.length - 1].value;
}

// Filter periods to those within range
function filterPeriodsInRange(periods, startValue, endValue) {
    return periods.filter(p => p >= startValue && p <= endValue);
}

// Get top N contacts by total within a date range (for monthly data)
function getTopContactsInRange(data, periods, startValue, endValue, n = 50) {
    const filteredPeriods = filterPeriodsInRange(periods, startValue, endValue);

    // Calculate totals for each contact within the range
    const totals = data.map(d => {
        let total = 0;
        filteredPeriods.forEach(p => {
            total += (+d[p] || 0);
        });
        return { name: d.name, total, data: d };
    });

    // Sort by total and take top N
    totals.sort((a, b) => b.total - a.total);
    return totals.slice(0, n);
}

// Create date range control HTML
function createDateRangeHTML() {
    return `
        <label>From:
            <select id="start-date"></select>
        </label>
        <label>To:
            <select id="end-date"></select>
        </label>
    `;
}
