// --- RTIS.js (Strictly for Logging Time format: YYYY-MM-DD) ---

const spmConfig = {
    type: 'RTIS',
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
function getSpeedAtDistanceBeforeStop(stopIndex, stopMeters, data, targetMeters) {
    for (let i = stopIndex - 1; i >= 0; i--) {
        const distDiff = stopMeters - data[i].Distance;
        if (distDiff >= targetMeters) return Number(data[i].Speed) || 0;
    }
    return 0;
}

// --- MAIN WRAPPER FUNCTION ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("RTIS Analysis Started (Strict Mode for 27792.csv)...");

    if (speedChartInstance) { speedChartInstance.destroy(); speedChartInstance = null; }
    if (stopChartInstance) { stopChartInstance.destroy(); stopChartInstance = null; }

    try {
        // 1. Gather Inputs
        const lpId = document.getElementById('lpId').value.trim();
        const lpName = document.getElementById('lpName').value.trim();
        const locoNumber = document.getElementById('locoNumber').value.trim();
        const trainNumber = document.getElementById('trainNumber').value.trim();
        const section = document.getElementById('section').value;
        const fromSection = document.getElementById('fromSection').value.toUpperCase();
        const toSection = document.getElementById('toSection').value.toUpperCase();
        const routeSection = `${fromSection}-${toSection}`;
        const cliName = document.getElementById('cliName').value.trim();
        const fromDateTime = new Date(document.getElementById('fromDateTime').value);
        const toDateTime = new Date(document.getElementById('toDateTime').value);
        const rakeType = document.getElementById('rakeType').value;
        const maxPermissibleSpeed = parseInt(document.getElementById('maxPermissibleSpeed').value);

        // 2. Process CUG Data
        const lpCugNumber = document.getElementById('lpCugNumber').value.trim();
        const alpCugNumber = document.getElementById('alpCugNumber').value.trim();
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // 3. Read File
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target.result;
                const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: false });
                const jsonDataRaw = parsed.data || [];

                if (jsonDataRaw.length === 0) throw new Error("File is empty.");

                // --- STRICT MAPPING FOR 27792.csv ---
                // Header names exactly as per your file
                const timeKey = 'Logging Time';
                const speedKey = 'Speed';
                const distKey = 'distFromPrevLatLng'; 

                let cumulativeDistanceMeters = 0;

                const parsedData = jsonDataRaw.map((row) => {
                    const timeValue = row[timeKey];
                    if (!timeValue) return null;

                    // STRICT DATE PARSING for 'YYYY-MM-DD HH:MM:SS'
                    // Example: 2026-02-01 00:00:00
                    const parsedTime = new Date(timeValue.trim().replace(' ', 'T')); 

                    if (isNaN(parsedTime.getTime())) return null;

                    let speedVal = parseFloat(row[speedKey]) || 0;
                    if (Math.abs(speedVal) < 0.5) speedVal = 0; else speedVal = Math.round(speedVal);

                    // Distance in Meters (Direct from file)
                    let distIncr = parseFloat(row[distKey]) || 0;
                    cumulativeDistanceMeters += distIncr;

                    return {
                        Time: parsedTime,
                        Distance: cumulativeDistanceMeters, // Meters
                        Speed: speedVal,
                        EventGn: (speedVal === 0) ? spmConfig.eventCodes.zeroSpeed : ''
                    };
                }).filter(r => r && r.Time >= fromDateTime && r.Time <= toDateTime);

                if (parsedData.length === 0) throw new Error("No data in selected time range. Check From/To Date.");
                console.log(`Loaded ${parsedData.length} rows.`);

                // 4. Normalization (Align to From Station)
                const stationMap = new Map();
                window.stationSignalData.filter(r => r.SECTION === section).forEach(r => {
                    // Database distance is likely in Meters based on previous conversations
                    if (!stationMap.has(r.STATION)) stationMap.set(r.STATION, { 
                        name: r.STATION, 
                        distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)'])
                    }); 
                });
                const stationsData = Array.from(stationMap.values());
                const fromStationObj = stationsData.find(s => s.name === fromSection);
                if (!fromStationObj) throw new Error("From Station not found in Station Database.");
                
                const fromDistanceMeters = fromStationObj.distance;
                
                // Align start of file data to From Station
                const startFileDist = parsedData[0].Distance;
                parsedData.forEach(r => {
                    r.Distance = r.Distance - startFileDist; // Relative Meters
                });

                // Route Stations (Relative Meters)
                const fIdx = stationsData.findIndex(s => s.name === fromSection);
                const tIdx = stationsData.findIndex(s => s.name === toSection);
                const routeStations = stationsData.slice(Math.min(fIdx, tIdx), Math.max(fIdx, tIdx) + 1).map(s => ({
                    name: s.name, distance: Math.abs(s.distance - fromDistanceMeters)
                }));

                // 5. Analysis
                // --- Overspeed ---
                let overSpeedDetails = [];
                let grp = null;
                parsedData.forEach((r, i) => {
                    if (r.Speed > maxPermissibleSpeed) {
                         let sec = 'Unknown';
                         for(let k=0; k<routeStations.length-1; k++) {
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
                                kilometer: s.Distance, 
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
                    
                    const dists = [1000, 800, 500, 100, 50]; 
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

                // --- Final Data (Average Speed Fix) ---
                const totalTimeHours = (parsedData[parsedData.length-1].Time - parsedData[0].Time) / 3600000;
                // Distance is in Meters, convert to KM for Avg Speed
                const totalDistKm = (parsedData[parsedData.length-1].Distance - parsedData[0].Distance) / 1000;
                const avgSpeedVal = totalTimeHours > 0 ? (totalDistKm / totalTimeHours).toFixed(2) : "0";

                const reportData = {
                    trainDetails: [
                        { label: 'Loco Number', value: locoNumber },
                        { label: 'Train Number', value: trainNumber },
                        { label: 'Type of Rake', value: rakeType },
                        { label: 'Max Permissible Speed', value: maxPermissibleSpeed + ' kmph' },
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

        reader.readAsText(spmFile);

    } catch (error) {
        console.error("Main Error:", error);
        alert("Error: " + error.message);
        if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
    }
};
