// --- RTIS.js (Final Corrected for 27792.csv - Meters Logic) ---

const spmConfig = {
    type: 'RTIS',
    columnNames: {
        time: 'Logging Time',
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
function parseRTISDate(value) {
    if (!value) return null;
    const str = String(value).trim();
    // Try standard ISO first
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    return null;
}

function getSpeedAtDistanceBeforeStop(stopIndex, stopMeters, data, targetMeters) {
    // Both stopMeters and data[i].Distance are in Meters now.
    for (let i = stopIndex - 1; i >= 0; i--) {
        const distDiff = stopMeters - data[i].Distance;
        if (distDiff >= targetMeters) return Number(data[i].Speed) || 0;
    }
    return 0;
}

// --- MAIN WRAPPER FUNCTION ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("RTIS Analysis Started (Corrected: Distance is in Meters)...");

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

        const fileExt = spmFile.name.split('.').pop().toLowerCase();
        
        // 2. Process CUG Data
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // 3. Read File
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

                if (jsonDataRaw.length === 0) throw new Error("Empty file.");

                // Map Columns
                const sampleRow = jsonDataRaw[0];
                const timeKey = Object.keys(sampleRow).find(k => k.toLowerCase().includes('time')) || 'Logging Time';
                const speedKey = Object.keys(sampleRow).find(k => k.toLowerCase() === 'speed') || 'Speed';
                const distKey = Object.keys(sampleRow).find(k => k.toLowerCase().includes('distfromprev')) || 'distFromPrevLatLng';

                console.log("Mapped Keys:", { timeKey, speedKey, distKey });

                let cumulativeDistanceMeters = 0; // Cumulative distance in Meters

                const parsedData = jsonDataRaw.map((row) => {
                    const timeValue = row[timeKey];
                    let parsedTime = parseRTISDate(timeValue);
                    if (!parsedTime) return null;

                    let speedVal = parseFloat(row[speedKey]) || 0;
                    if (Math.abs(speedVal) < 0.5) speedVal = 0; else speedVal = Math.round(speedVal);

                    // --- CRITICAL FIX: Distance is in Meters ---
                    let distIncr = parseFloat(row[distKey]) || 0;
                    cumulativeDistanceMeters += distIncr;

                    return {
                        Time: parsedTime,
                        Distance: cumulativeDistanceMeters, // Keeping it in Meters for easy calc
                        Speed: speedVal,
                        EventGn: (speedVal === 0) ? spmConfig.eventCodes.zeroSpeed : ''
                    };
                }).filter(r => r && r.Time >= fromDateTime && r.Time <= toDateTime);

                if (parsedData.length === 0) throw new Error("No data in selected time range.");
                console.log(`Loaded ${parsedData.length} rows.`);

                // 4. Station Logic
                const stationMap = new Map();
                window.stationSignalData.filter(r => r.SECTION === section).forEach(r => {
                    if (!stationMap.has(r.STATION)) stationMap.set(r.STATION, { 
                        name: r.STATION, 
                        distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) // Station distance in Meters
                    }); 
                });
                const stationsData = Array.from(stationMap.values());
                const fromStationObj = stationsData.find(s => s.name === fromSection);
                if (!fromStationObj) throw new Error("From Station not found.");
                
                const fromDistanceMeters = fromStationObj.distance;
                
                // Normalization (Align File Start to FromStation)
                // parsedData[0].Distance is File-Relative.
                // We want: NormalizedDistance = FileDistance (relative to start of selection)
                // And for station matching: AbsoluteDistance = fromDistanceMeters + NormalizedDistance
                
                const startFileDist = parsedData[0].Distance;
                parsedData.forEach(r => {
                    // Distance traveled since selection start
                    r.Distance = r.Distance - startFileDist; 
                });

                // Route Stations (Relative Meters from FromStation)
                const fIdx = stationsData.findIndex(s => s.name === fromSection);
                const tIdx = stationsData.findIndex(s => s.name === toSection);
                const routeStations = stationsData.slice(Math.min(fIdx, tIdx), Math.max(fIdx, tIdx) + 1).map(s => ({
                    name: s.name, distance: Math.abs(s.distance - fromDistanceMeters) // Relative Meters
                }));

                // 5. Analysis
                // --- Overspeed ---
                let overSpeedDetails = [];
                let grp = null;
                parsedData.forEach((r, i) => {
                    if (r.Speed > maxPermissibleSpeed) {
                         let sec = 'Unknown';
                         for(let k=0; k<routeStations.length-1; k++) {
                             // Compare Meters vs Meters
                             if(r.Distance >= routeStations[k].distance && r.Distance < routeStations[k+1].distance) {
                                 sec = `${routeStations[k].name}-${routeStations[k+1].name}`; break;
                             }
                         }
                         if (!grp || grp.section !== sec || (i>0 && (r.Time - parsedData[i-1].Time > 10000))) {
                             if(grp) overSpeedDetails.push(grp);
                             grp = { section: sec, startTime: r.Time, endTime: r.Time, minSpeed: r.Speed, maxSpeed: r.Speed };
                         } else {
                             grp.endTime = r.Time; grp.maxSpeed = Math.max(grp.maxSpeed, r.Speed);
                         }
                    } else if (grp) { overSpeedDetails.push(grp); grp = null; }
                });
                if(grp) overSpeedDetails.push(grp);
                overSpeedDetails = overSpeedDetails.map(g => ({...g, timeRange: `${g.startTime.toLocaleTimeString()}-${g.endTime.toLocaleTimeString()}`, speedRange: `${g.minSpeed.toFixed(0)}-${g.maxSpeed.toFixed(0)}`}));

                // --- Stops ---
                let stops = [];
                let potentialStops = parsedData.filter(r => r.Speed === 0);
                let currGrp = [];
                potentialStops.forEach((s, i) => {
                    currGrp.push(s);
                    if (i === potentialStops.length - 1 || (potentialStops[i+1].Time - s.Time > 10000)) {
                         const stopDur = (currGrp[currGrp.length-1].Time - currGrp[0].Time)/1000;
                         if(stopDur > 10) {
                            stops.push({ 
                                index: parsedData.indexOf(currGrp[0]), 
                                time: s.Time, 
                                kilometer: s.Distance, // Meters
                                timeString: s.Time.toLocaleString(),
                                duration: stopDur
                            });
                         }
                         currGrp = [];
                    }
                });

                stops = stops.map((s, idx) => {
                    let loc = 'Unknown';
                    // Find nearest station (within 500 Meters)
                    const nearest = routeStations.find(st => Math.abs(st.distance - s.kilometer) < 500);
                    if(nearest) loc = nearest.name;
                    
                    const dists = [1000, 800, 500, 100, 50]; // Meters
                    const speedsBefore = dists.map(d => {
                        const sp = getSpeedAtDistanceBeforeStop(s.index, s.kilometer, parsedData, d);
                        return sp ? sp.toFixed(0) : 'N/A';
                    });

                    return { ...s, group: idx+1, stopLocation: loc, startTiming: 'N/A', speedsBefore, brakingTechnique: 'Smooth' }; 
                });

                // --- Charts ---
                const chartLabels = parsedData.filter((_, i) => i % Math.ceil(parsedData.length/500) === 0).map(r => r.Time.toLocaleTimeString());
                const chartData = parsedData.filter((_, i) => i % Math.ceil(parsedData.length/500) === 0).map(r => r.Speed);
                
                const speedCtx = document.getElementById('speedChart').getContext('2d');
                speedChartInstance = new Chart(speedCtx, {
                    type: 'line',
                    data: { labels: chartLabels, datasets: [{ data: chartData, borderColor: 'blue', fill: false, pointRadius: 0 }] },
                    options: { animation: false }
                });
                const speedChartImg = speedChartInstance.toBase64Image(); 

                // --- Final Data ---
                const totalTimeHours = (parsedData[parsedData.length-1].Time - parsedData[0].Time) / 3600000;
                const totalDistKm = (parsedData[parsedData.length-1].Distance - parsedData[0].Distance) / 1000; // Convert Meters to KM for report
                const avgSpeedVal = totalTimeHours > 0 ? (totalDistKm / totalTimeHours).toFixed(2) : "0";

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
                    averageSpeed: avgSpeedVal,
                    crewCallData: [] 
                };

                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                window.location.href = 'report.html';

            } catch (err) {
                console.error(err);
                alert("RTIS Processing Error: " + err.message);
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
