// RTIS.js - Corrected (Single Sheet Logic)

const spmConfig = {
    type: 'RTIS',
    columnNames: {
        time: 'Gps Time',
        distance: 'distFromPrevLatLng',
        speed: 'Speed',
        event: 'Event'
    },
    eventCodes: {
        zeroSpeed: 'STOP'
    },
    brakeTests: {
        GOODS: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 39, maxSpeed: 51, maxDuration: 60 * 1000 } },
        COACHING: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 59, maxSpeed: 71, maxDuration: 60 * 1000 } },
        MEMU: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 59, maxSpeed: 71, maxDuration: 60 * 1000 } }
    }
};

let speedChartInstance = null;
let stopChartInstance = null;

// --- Utility Functions (Internal) ---
function findHeaderLike(headers, patterns) {
    if (!headers || !headers.length) return null;
    const lowerHeaders = headers.map(h => (h || '').toString().trim().toLowerCase());
    for (const pat of patterns) {
        const idx = lowerHeaders.findIndex(h => h.includes(pat.toLowerCase()));
        if (idx !== -1) return headers[idx];
    }
    return null;
}

function excelSerialToJSDate(serial) {
    const epoch = Date.UTC(1899, 11, 30);
    const milliseconds = Math.round(serial * 24 * 3600 * 1000);
    const utcDate = new Date(epoch + milliseconds);
    return new Date(utcDate.getTime() + (utcDate.getTimezoneOffset() * 60 * 1000));
}

function parseExcelOrStringDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return excelSerialToJSDate(value);
    
    const str = value.toString().trim();
    if (/^\d+(\.\d+)?$/.test(str)) return excelSerialToJSDate(Number(str));
    
    const d1 = new Date(str);
    if (!isNaN(d1.getTime())) return d1;
    
    // Custom Parsing for DD-MM-YYYY HH:MM:SS
    const regex = /^(?:(\d{2})[-\/](\d{2})[-\/](\d{4})|(\d{4})[-\/](\d{2})[-\/](\d{2}))\s+(\d{2}):(\d{2})(?::(\d{2}))?$/;
    const m = str.match(regex);
    if (m) {
        const year = m[1] ? m[3] : m[4];
        const month = m[1] ? m[2] : m[5];
        const day = m[1] ? m[1] : m[6];
        const hour = m[7];
        const min = m[8];
        const sec = m[9] || '00';
        return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    }
    return null;
}

function findNumericColumn(headers, rows) {
    if (!headers || !rows.length) return null;
    const scores = headers.map(() => 0);
    headers.forEach((h, i) => {
        let numericCount = 0, total = 0;
        for (let r = 0; r < Math.min(rows.length, 50); r++) {
            const val = rows[r][h];
            if (val !== null && val !== undefined && val !== '') {
                total++;
                if (!isNaN(parseFloat(val))) numericCount++;
            }
        }
        scores[i] = total > 0 ? (numericCount / total) : 0;
    });
    const maxScore = Math.max(...scores);
    return maxScore >= 0.6 ? headers[scores.indexOf(maxScore)] : null;
}

// --- Speed Lookup Helpers ---
function getSpeedAtDistanceBeforeStop(stopIndex, stopKm, data, targetMeters) {
    for (let i = stopIndex - 1; i >= 0; i--) {
        if ((stopKm - data[i].Distance) >= targetMeters) return Number(data[i].Speed) || 0;
    }
    return 0; // Fallback
}

// --- MAIN WRAPPER FUNCTION (Called by index.html) ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("RTIS Analysis Logic Started...");

    if (speedChartInstance) { speedChartInstance.destroy(); speedChartInstance = null; }
    if (stopChartInstance) { stopChartInstance.destroy(); stopChartInstance = null; }

    try {
        // 1. Gather Inputs
        const lpId = document.getElementById('lpId').value.trim();
        const lpName = document.getElementById('lpName').value.trim();
        const lpDesg = document.getElementById('lpDesg').value.trim();
        const lpGroupCli = document.getElementById('lpGroupCli').value.trim();
        const lpCugNumber = document.getElementById('lpCugNumber').value.trim();
        const alpId = document.getElementById('alpId').value.trim();
        const alpName = document.getElementById('alpName').value.trim();
        const alpDesg = document.getElementById('alpDesg').value.trim();
        const alpGroupCli = document.getElementById('alpGroupCli').value.trim();
        const alpCugNumber = document.getElementById('alpCugNumber').value.trim();
        const locoNumber = document.getElementById('locoNumber').value.trim();
        const trainNumber = document.getElementById('trainNumber').value.trim();
        const rakeType = document.getElementById('rakeType').value;
        const maxPermissibleSpeed = parseInt(document.getElementById('maxPermissibleSpeed').value);
        const section = document.getElementById('section').value;
        const fromSection = document.getElementById('fromSection').value.toUpperCase();
        const toSection = document.getElementById('toSection').value.toUpperCase();
        const routeSection = `${fromSection}-${toSection}`;
        const spmType = document.getElementById('spmType').value;
        const cliName = document.getElementById('cliName').value.trim();
        const fromDateTime = new Date(document.getElementById('fromDateTime').value);
        const toDateTime = new Date(document.getElementById('toDateTime').value);

        // 2. Validate Inputs
        const fileExt = spmFile.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx', 'xls'].includes(fileExt)) throw new Error('Please upload a valid file (CSV/Excel) for RTIS.');
        if (toDateTime <= fromDateTime) throw new Error('To Date/Time must be later than From Date/Time.');
        if (fromSection === toSection) throw new Error('From and To sections cannot be same.');

        // 3. Process CUG Data
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // 4. Read & Process SPM File
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                let jsonDataRaw = [];
                if (fileExt === 'csv') {
                    const csvText = event.target.result;
                    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: false });
                    jsonDataRaw = parsed.data || [];
                } else {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    jsonDataRaw = XLSX.utils.sheet_to_json(sheet, { defval: null });
                }

                if (!jsonDataRaw || jsonDataRaw.length === 0) throw new Error("Empty or invalid file.");

                const headers = Object.keys(jsonDataRaw[0]);

                // Auto-Detect Headers
                let timeKey = findHeaderLike(headers, ['gps time', 'time', 'timestamp', 'date time', 'logging time']);
                let speedKey = findHeaderLike(headers, ['speed', 'spd']);
                let distanceKey = findHeaderLike(headers, ['distfromprev', 'distfromprevlatlng', 'distance']) || findNumericColumn(headers, jsonDataRaw);

                // Fallbacks if auto-detect fails
                if (!timeKey) timeKey = headers[0]; 
                if (!speedKey) {
                     // Try finding numeric column > 0.6 valid ratio
                     const cand = findNumericColumn(headers, jsonDataRaw);
                     if(cand) speedKey = cand;
                }

                console.log('Resolved keys:', { timeKey, speedKey, distanceKey });

                // Parse Data
                let cumulativeDistanceMeters = 0;
                const parsedData = jsonDataRaw.map((row, idx) => {
                    const timeValue = row[timeKey];
                    let parsedTime = parseExcelOrStringDate(timeValue);
                    if (!parsedTime) return null;

                    let speedVal = speedKey ? parseFloat(String(row[speedKey]).replace(',', '.')) : 0;
                    if (isNaN(speedVal)) speedVal = 0;
                    if (Math.abs(speedVal) < 0.5) speedVal = 0; else speedVal = Math.round(speedVal);

                    let distIncr = distanceKey ? (parseFloat(String(row[distanceKey]).replace(',', '.')) || 0) : 0;
                    cumulativeDistanceMeters += distIncr;

                    return {
                        Time: parsedTime,
                        Distance: cumulativeDistanceMeters / 1000, // KM
                        Speed: speedVal,
                        EventGn: (speedVal === 0) ? spmConfig.eventCodes.zeroSpeed : ''
                    };
                }).filter(r => r && r.Time >= fromDateTime && r.Time <= toDateTime);

                if (parsedData.length === 0) throw new Error("No data found in selected time range.");

                // 5. Station & Normalization Logic
                const stationMap = new Map();
                window.stationSignalData.filter(r => r.SECTION === section).forEach(r => {
                    if (!stationMap.has(r.STATION)) stationMap.set(r.STATION, { name: r.STATION, distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) || 0 });
                });
                const stationsData = Array.from(stationMap.values());
                const fromStationObj = stationsData.find(s => s.name === fromSection);
                if (!fromStationObj) throw new Error("From Station not found.");
                
                const fromDistance = fromStationObj.distance;
                parsedData.forEach(r => r.NormalizedDistance = (r.Distance * 1000) - fromDistance);

                // Departure Logic
                let departureIdx = parsedData.findIndex((r, i) => {
                    if (r.Speed < 1) return false;
                    let moved = 0, startD = r.Distance;
                    for (let j=i; j<parsedData.length; j++) {
                        if (parsedData[j].Speed === 0) return false;
                        moved += Math.abs(parsedData[j].Distance - startD);
                        startD = parsedData[j].Distance;
                        if (moved >= 0.2) return true;
                    }
                    return false;
                });
                if (departureIdx === -1) throw new Error("No valid departure found.");

                const filtered = parsedData.slice(departureIdx);
                const initialDist = filtered[0].NormalizedDistance;
                const normalizedData = filtered.map(r => ({ ...r, Distance:
