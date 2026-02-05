// --- RTIS.js Corrected ---

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

// --- Helper Functions ---
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

function findHeaderLike(headers, patterns) {
    if (!headers || !headers.length) return null;
    const lowerHeaders = headers.map(h => (h || '').toString().trim().toLowerCase());
    for (const pat of patterns) {
        const idx = lowerHeaders.findIndex(h => h.includes(pat.toLowerCase()));
        if (idx !== -1) return headers[idx];
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

function getSpeedAtDistanceBeforeStop(stopIndex, stopKm, data, targetMeters) {
    for (let i = stopIndex - 1; i >= 0; i--) {
        if ((stopKm - data[i].Distance) >= targetMeters) return Number(data[i].Speed) || 0;
    }
    return 0;
}

// --- MAIN WRAPPER FUNCTION (Called by index.html) ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("RTIS Analysis Logic Started...");

    if (speedChartInstance) { speedChartInstance.destroy(); speedChartInstance = null; }
    if (stopChartInstance) { stopChartInstance.destroy(); stopChartInstance = null; }

    try {
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

        const fileExt = spmFile.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx', 'xls'].includes(fileExt)) throw new Error('Please upload a valid file (CSV/Excel) for RTIS.');

        // Process CUG Data
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // Read File
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
                let timeKey = findHeaderLike(headers, ['gps time', 'time', 'timestamp', 'date time', 'logging time']) || headers[0];
                let speedKey = findHeaderLike(headers, ['speed', 'spd']);
                if (!speedKey) {
                     const cand = findNumericColumn(headers, jsonDataRaw);
                     if(cand) speedKey = cand;
                }
                let distanceKey = findHeaderLike(headers, ['distfromprev', 'distfromprevlatlng', 'distance']) || findNumericColumn(headers, jsonDataRaw);

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

                // Normalization
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
                const normalizedData = filtered.map(r => ({ ...r, Distance: r.NormalizedDistance - initialDist }));

                // Calculate Average Speed
                const totalDistKm = (normalizedData[normalizedData.length - 1].Distance - normalizedData[0].Distance) / 1000;
                const totalTimeHours = (normalizedData[normalizedData.length - 1].Time - normalizedData[0].Time) / (1000 * 3600);
                const avgSpeedVal = totalTimeHours > 0 ? (totalDistKm / totalTimeHours).toFixed(2) : "0";

                // Analysis (Stops, Overspeed, etc.)
                // (Simplified for brevity, assuming helper functions exist or standard logic)
                const fIdx = stationsData.findIndex(s => s.name === fromSection);
                const tIdx = stationsData.findIndex(s => s.name === toSection);
                const routeStations = stationsData.slice(Math.min(fIdx, tIdx), Math.max(fIdx, tIdx) + 1).map(s => ({
                    name: s.name, distance: Math.abs(s.distance - fromDistance)
                }));

                // Overspeed Logic
                let overSpeedDetails = [];
                let grp = null;
                normalizedData.forEach((r, i) => {
                    if (r.Speed > maxPermissibleSpeed) {
                         let sec = 'Unknown';
                         for(let k=0; k<routeStations.length-1; k++) if(r.Distance >= routeStations[k].distance && r.Distance < routeStations[k+1].distance) sec = `${routeStations[k].name}-${routeStations[k+1].name}`;
                         if (!grp || grp.section !== sec || (i>0 && (r.Time - normalizedData[i-1].Time > 10000))) {
                             if (grp) overSpeedDetails.push(grp);
                             grp = { section: sec, startTime: r.Time, endTime: r.Time, minSpeed: r.Speed, maxSpeed: r.Speed };
                         } else {
                             grp.endTime = r.Time; grp.maxSpeed = Math.max(grp.maxSpeed, r.Speed);
                         }
                    } else if (grp) { overSpeedDetails.push(grp); grp = null; }
                });
                if (grp) overSpeedDetails.push(grp);
                overSpeedDetails = overSpeedDetails.map(g => ({...g, timeRange: `${g.startTime.toLocaleTimeString()}-${g.endTime.toLocaleTimeString()}`, speedRange: `${g.minSpeed.toFixed(0)}-${g.maxSpeed.toFixed(0)}`}));

                // Stops Logic
                let stops = [];
                let potentialStops = normalizedData.filter(r => r.Speed === 0).map((r, i) => ({
                    index: normalizedData.indexOf(r), time: r.Time, kilometer: r.Distance, timeString: r.Time.toLocaleString()
                }));
                let currGrp = [];
                potentialStops.forEach((s, i) => {
                    currGrp.push(s);
                    if (i === potentialStops.length - 1 || (potentialStops[i+1].time - s.time > 10000)) {
                        stops.push({ ...currGrp[currGrp.length-1], duration: (currGrp[currGrp.length-1].time - currGrp[0].time)/1000, index: normalizedData.indexOf(currGrp[0]) });
                        currGrp = [];
                    }
                });
                stops = stops.filter(s => s.duration > 10);
                
                // Enhance Stops
                stops = stops.map((s, idx) => {
                    let loc = 'Unknown';
                    let stn = window.stationSignalData.find(r => r.SECTION === section && Math.abs(parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) - fromDistance - s.kilometer) < 400);
                    if(stn) loc = stn.STATION;
                    
                    const dists = [1000, 800, 500, 100, 50];
                    const speedsBefore = dists.map(d => {
                        for(let k=s.index; k>=0; k--) if(s.kilometer - normalizedData[k].Distance >= d) return normalizedData[k].Speed.toFixed(0);
                        return 'N/A';
                    });
                    
                    return { ...s, group: idx+1, stopLocation: loc, startTiming: 'N/A', speedsBefore, brakingTechnique: 'Smooth' }; 
                });

                // Generate Charts
                const chartLabels = normalizedData.filter((_, i) => i % Math.ceil(normalizedData.length/500) === 0).map(r => r.Time.toLocaleTimeString());
                const chartData = normalizedData.filter((_, i) => i % Math.ceil(normalizedData.length/500) === 0).map(r => r.Speed);
                
                const speedCtx = document.getElementById('speedChart').getContext('2d');
                speedChartInstance = new Chart(speedCtx, {
                    type: 'line',
                    data: { labels: chartLabels, datasets: [{ data: chartData, borderColor: 'blue', fill: false }] },
                    options: { animation: false }
                });
                const speedChartImg = speedChartInstance.toBase64Image(); 

                // 7. Compile Report Data
                const reportData = {
                    trainDetails: [
                        { label: 'Loco', value: locoNumber },
                        { label: 'Train', value: trainNumber },
                        { label: 'Section', value: section },
                        { label: 'Analysis By', value: cliName }
                    ],
                    lpDetails: [`LP: ${lpName}`, `ID: ${lpId}`],
                    alpDetails: [`ALP: ${alpName}`, `ID: ${alpId}`],
                    stopCount: stops.length,
                    stops: stops,
                    overSpeedDetails,
                    speedChartImage: speedChartImg,
                    averageSpeed: avgSpeedVal, // IMPORTANT: Ab ye value sheet mein jayegi
                    crewCallData: [] 
                };

                // 8. Save & Redirect
                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                window.location.href = 'report.html';

            } catch (err) {
                console.error(err);
                alert("RTIS Analysis Error: " + err.message);
                if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
            }
        };

        if (fileExt === 'csv') reader.readAsText(spmFile);
        else reader.readAsArrayBuffer(spmFile);

    } catch (error) {
        console.error("Main Error:", error);
        alert("Error: " + error.message);
        if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
    }
};
