// --- SHM.js (LocoSHM OnDemand) ---

const spmConfig = {
    type: 'SHM',
    // Headers as per your sample
    columnNames: {
        time: 'Date/Time',
        speed: 'Speed',
        distance: 'Distance'
    },
    eventCodes: {
        zeroSpeed: 'STOP'
    },
    brakeTests: {
        GOODS: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 40, maxSpeed: 50, maxDuration: 60 * 1000 } },
        COACHING: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } },
        MEMU: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } }
    }
};

let speedChartInstance = null;
let stopChartInstance = null;

// --- Helper: Parse DD/MM/YYYY HH:MM:SS ---
function parseSHMDate(dateStr) {
    if (!dateStr) return null;
    // Format: 19/01/2026 10:11:01
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
    const m = dateStr.trim().match(regex);
    if (m) {
        return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
    }
    return new Date(dateStr); // Fallback
}

// --- MAIN WRAPPER FUNCTION ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("SHM Analysis Logic Started...");

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
        // Allow .csv and .xlsx
        const fileExt = spmFile.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx', 'xls'].includes(fileExt)) throw new Error('Please upload a valid CSV or Excel file for SHM.');
        if (toDateTime <= fromDateTime) throw new Error('To Date/Time must be later than From Date/Time.');
        if (fromSection === toSection) throw new Error('From and To sections cannot be same.');

        // 3. Process CUG Data
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // 4. Read File
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                let jsonDataRaw = [];
                // Handle CSV vs Excel
                if (fileExt === 'csv') {
                    const text = event.target.result;
                    // Find header line (starts with "Date/Time")
                    const lines = text.split('\n');
                    let headerLineIdx = -1;
                    for(let i=0; i<lines.length; i++) {
                        if (lines[i].includes('Date/Time') && lines[i].includes('Speed')) {
                            headerLineIdx = i;
                            break;
                        }
                    }
                    if (headerLineIdx === -1) throw new Error("Header row ('Date/Time') not found in CSV.");
                    
                    // Parse from header row
                    const csvContent = lines.slice(headerLineIdx).join('\n');
                    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
                    jsonDataRaw = parsed.data;
                } else {
                    // Excel
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    // Convert to JSON array of arrays to find header
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    let headerRowIdx = rows.findIndex(r => r && String(r[0]).includes('Date/Time'));
                    if (headerRowIdx === -1) headerRowIdx = 0; // Fallback
                    
                    jsonDataRaw = XLSX.utils.sheet_to_json(sheet, { range: headerRowIdx });
                }

                if (!jsonDataRaw || jsonDataRaw.length === 0) throw new Error("No data found.");

                // 5. Parse & Normalize Data
                let normalizedData = [];
                let cumulativeDistanceMeters = 0;

                // Identify Columns (flexible search)
                const headers = Object.keys(jsonDataRaw[0]);
                const timeCol = headers.find(h => h.includes('Date/Time'));
                const speedCol = headers.find(h => h.includes('Speed'));
                const distCol = headers.find(h => h.includes('Distance')); // Incremental Distance

                if (!timeCol || !speedCol || !distCol) throw new Error("Missing columns: Date/Time, Speed, or Distance.");

                jsonDataRaw.forEach(row => {
                    const timeStr = row[timeCol];
                    const speedVal = parseFloat(row[speedCol]) || 0;
                    const distIncr = parseFloat(row[distCol]) || 0;

                    const dt = parseSHMDate(timeStr);
                    if (dt && !isNaN(dt.getTime())) {
                        cumulativeDistanceMeters += distIncr;
                        // Infer Event: if speed is 0 -> STOP, else RUN
                        const evt = (speedVal === 0) ? 'STOP' : 'RUN';

                        normalizedData.push({
                            Time: dt,
                            Speed: speedVal,
                            Distance: cumulativeDistanceMeters, // Total meters
                            EventGn: evt
                        });
                    }
                });

                // Filter by Time Range
                let filteredData = normalizedData.filter(r => r.Time >= fromDateTime && r.Time <= toDateTime);
                if (filteredData.length === 0) {
                     // Fallback: use all data if filtering yields nothing (just to show something)
                     console.warn("No data in time range. Showing all.");
                     filteredData = normalizedData;
                }
                
                if (filteredData.length === 0) throw new Error("No valid data rows parsed.");

                // Re-normalize Distance relative to start of selection
                const initialDist = filteredData[0].Distance;
                normalizedData = filteredData.map(r => ({
                    ...r,
                    Distance: r.Distance - initialDist
                }));

                // 6. Station & Analysis (Standard Logic)
                const stationMap = new Map();
                window.stationSignalData.filter(r => r.SECTION === section).forEach(r => {
                    if (!stationMap.has(r.STATION)) stationMap.set(r.STATION, { name: r.STATION, distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) || 0 });
                });
                const stationsData = Array.from(stationMap.values());
                const fromStationObj = stationsData.find(s => s.name === fromSection);
                if (!fromStationObj) throw new Error("From Station not found.");

                const fromDistance = fromStationObj.distance;
                // Final Normalized Distance for Analysis (relative to Section Start)
                normalizedData.forEach(r => r.NormalizedDistance = (r.Distance) + 0); // Local rel is fine

                // Departure Logic
                let departureIdx = normalizedData.findIndex(r => r.Speed >= 1);
                if (departureIdx === -1) departureIdx = 0;

                const analysisData = normalizedData.slice(departureIdx);
                
                // Route Stations
                const fIdx = stationsData.findIndex(s => s.name === fromSection);
                const tIdx = stationsData.findIndex(s => s.name === toSection);
                const routeStations = stationsData.slice(Math.min(fIdx, tIdx), Math.max(fIdx, tIdx) + 1).map(s => ({
                    name: s.name, distance: Math.abs(s.distance - fromDistance)
                }));

                // Analysis Helpers (Internal)
                const getOverSpeedDetails = (data, mps) => {
                    let res = [], grp = null;
                    data.forEach((r, i) => {
                        if (r.Speed > mps) {
                            // Find section
                            let sec = 'Unknown';
                            for(let k=0; k<routeStations.length-1; k++) {
                                if(r.Distance >= routeStations[k].distance && r.Distance < routeStations[k+1].distance) {
                                    sec = `${routeStations[k].name}-${routeStations[k+1].name}`; break;
                                }
                            }
                            if (!grp || grp.section !== sec || (i>0 && (r.Time - data[i-1].Time > 10000))) {
                                if(grp) res.push(grp);
                                grp = { section: sec, startTime: r.Time, endTime: r.Time, minSpeed: r.Speed, maxSpeed: r.Speed };
                            } else {
                                grp.endTime = r.Time; grp.maxSpeed = Math.max(grp.maxSpeed, r.Speed);
                            }
                        } else if (grp) { res.push(grp); grp = null; }
                    });
                    if (grp) res.push(grp);
                    return res.map(g => ({...g, timeRange: `${g.startTime.toLocaleTimeString()}-${g.endTime.toLocaleTimeString()}`, speedRange: `${g.minSpeed}-${g.maxSpeed}`}));
                };

                const overSpeedDetails = getOverSpeedDetails(analysisData, maxPermissibleSpeed);

                // Stops
                let stops = [];
                let potentialStops = analysisData.filter(r => r.Speed === 0);
                let currGrp = [];
                potentialStops.forEach((s, i) => {
                    currGrp.push(s);
                    if (i === potentialStops.length - 1 || (potentialStops[i+1].Time - s.Time > 10000)) {
                        stops.push({ ...currGrp[currGrp.length-1], duration: (currGrp[currGrp.length-1].Time - currGrp[0].Time)/1000, index: analysisData.indexOf(currGrp[0]) });
                        currGrp = [];
                    }
                });
                stops = stops.filter(s => s.duration > 10);

                stops = stops.map((s, idx) => {
                    let loc = 'Unknown';
                    // Find location
                    let stn = window.stationSignalData.find(r => r.SECTION === section && Math.abs(parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) - fromDistance - s.Distance) < 400);
                    if(stn) loc = stn.STATION;
                    else {
                        let sec = routeStations.slice(0,-1).find((st, k) => s.Distance >= st.distance && s.Distance < routeStations[k+1].distance);
                        if(sec) loc = `${sec.name}-${routeStations[routeStations.indexOf(sec)+1].name}`;
                    }

                    // Braking
                    const dists = [1000, 800, 500, 100, 50];
                    const speedsBefore = dists.map(d => {
                        for(let k=s.index; k>=0; k--) if(s.Distance - analysisData[k].Distance >= d) return analysisData[k].Speed.toFixed(0);
                        return 'N/A';
                    });
                    
                    return { 
                        ...s, 
                        group: idx+1, 
                        stopLocation: loc, 
                        timeString: s.Time.toLocaleString(),
                        startTiming: 'N/A', 
                        speedsBefore, 
                        brakingTechnique: 'Smooth',
                        kilometer: s.Distance
                    };
                });

                // Charts
                const chartLabels = analysisData.filter((_, i) => i % Math.ceil(analysisData.length/500) === 0).map(r => r.Time.toLocaleTimeString());
                const chartData = analysisData.filter((_, i) => i % Math.ceil(analysisData.length/500) === 0).map(r => r.Speed);
                
                const speedCtx = document.getElementById('speedChart').getContext('2d');
                speedChartInstance = new Chart(speedCtx, {
                    type: 'line',
                    data: { labels: chartLabels, datasets: [{ data: chartData, borderColor: 'blue', fill: false }] },
                    options: { animation: false }
                });
                const speedChartImg = speedChartInstance.toBase64Image(); 

                // 7. Report Data
                const reportData = {
                    trainDetails: [
                        { label: 'Loco', value: locoNumber },
                        { label: 'Train', value: trainNumber },
                        { label: 'Section', value: section },
                        { label: 'SPM Type', value: spmType }
                    ],
                    lpDetails: [`LP: ${lpName}`, `ID: ${lpId}`],
                    alpDetails: [`ALP: ${alpName}`, `ID: ${alpId}`],
                    stopCount: stops.length,
                    stops: stops,
                    overSpeedDetails,
                    speedChartImage: speedChartImg,
                    crewCallData: []
                };

                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                window.location.href = 'report.html';

            } catch (err) {
                console.error(err);
                alert("SHM Analysis Error: " + err.message);
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
