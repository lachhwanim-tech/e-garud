// --- TelproNew.js Corrected ---
// Naye Telpro format ke liye (Data Row 3 se, Excel Date format)

const spmConfig = {
    type: 'TelproNew',
    columnNames: {
        time: 'Time',
        distance: 'Distance',
        speed: 'Speed',
        event: 'Event'
    },
    eventCodes: {
        zeroSpeed: 'STOP' // Hum file ke 'HALT' ko 'STOP' mein badal denge
    },
    brakeTests: {
        GOODS: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 40, maxSpeed: 50, maxDuration: 60 * 1000 } },
        COACHING: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } },
        MEMU: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } }
    }
};

let speedChartInstance = null;
let stopChartInstance = null;

// --- Helper Functions (Visualization/Parsing) ---

function excelSerialToJSDate(serial) {
    const epoch = Date.UTC(1899, 11, 30);
    const milliseconds = Math.round(serial * 24 * 3600 * 1000);
    const utcDate = new Date(epoch + milliseconds);
    return new Date(utcDate.getTime() + (utcDate.getTimezoneOffset() * 60 * 1000));
}

// --- MAIN WRAPPER FUNCTION (Called by index.html) ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("TelproNew Analysis Logic Started...");

    // Clear previous charts
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
        if (!['xlsx', 'xls'].includes(fileExt)) throw new Error('Please upload an Excel file (.xlsx/.xls) for TelproNew.');
        if (toDateTime <= fromDateTime) throw new Error('To Date/Time must be later than From Date/Time.');
        if (fromSection === toSection) throw new Error('From and To sections cannot be same.');

        // 3. Process CUG Data (Passed from index.html)
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // 4. Read & Process SPM File (Excel Parsing)
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                // --- NAYE FORMAT KA LOGIC ---
                const data = new Uint8Array(event.target.result);
                // `cellDates: true` Excel ke serial dates ko JS Date objects mein badal dega
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                // Data ko Row 3 se padhein (index 2)
                // header: 1 returns array of arrays
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 2 });

                let normalizedData = [];
                let cumulativeDistanceMeters = 0;

                // Naye format ke hisaab se data ko normalize karein
                jsonData.forEach((row, index) => {
                    // row[0] = Column A (Date Time)
                    // row[1] = Column B (Speed)
                    // row[2] = Column C (Distance per sec in meters)
                    // row[5] = Column F (Event)
                    
                    const timestamp = row[0];
                    const speed = parseFloat(row[1]) || 0;
                    const distanceIncrement = parseFloat(row[2]) || 0; // meters
                    const event = (row[5] || '').trim().toUpperCase();

                    // Valid Date Check
                    if (!timestamp || !(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
                        // Sometimes headers might slip in, ignore them
                        return; 
                    }

                    cumulativeDistanceMeters += distanceIncrement;
                    
                    // Event mapping: HALT -> STOP
                    let eventGn = event;
                    if (event === 'HALT') {
                        eventGn = spmConfig.eventCodes.zeroSpeed; // 'STOP'
                    }

                    normalizedData.push({
                        Time: timestamp,
                        Distance: cumulativeDistanceMeters, // Total meters
                        Speed: speed,
                        EventGn: eventGn 
                    });
                });

                // Filter by Time Range
                let filteredData = normalizedData.filter(row => row.Time >= fromDateTime && row.Time <= toDateTime);

                if (filteredData.length === 0) {
                    // Fallback: If strict filtering fails, try taking all valid data
                    console.warn("No data in strict time range. Using all valid data.");
                    filteredData = normalizedData; 
                    if(filteredData.length === 0) throw new Error("No valid data parsed from file.");
                }

                // 5. Station Mapping & Normalization
                const stationMap = new Map();
                window.stationSignalData.filter(r => r.SECTION === section).forEach(r => {
                    if (!stationMap.has(r.STATION)) stationMap.set(r.STATION, { name: r.STATION, distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) || 0 });
                });
                const stationsData = Array.from(stationMap.values());
                const fromStationObj = stationsData.find(s => s.name === fromSection);
                if (!fromStationObj) throw new Error("From Station not found.");

                const fromDistance = fromStationObj.distance;
                // Final calculation: Relative Distance = Total Cumulative - Initial Cumulative + Station Logic
                // But simplified: Just sync with station logic.
                // We will rely on 'normalizedData' being relative to fromStation.
                
                // Let's re-normalize based on the filtered chunk start
                const initialDist = filteredData[0].Distance;
                // Distance in array is cumulative from file start.
                // We need NormalizedDistance = (FileDistance - InitialFileDistance of Trip) relative to station?
                // Actually, the previous logic: NormalizedDistance = (TotalMeters) - FromStationMeters is standard if GPS/Odo is aligned.
                // Here we assume File Distance resets or is incremental.
                // Let's stick to the relative logic:
                const finalData = filteredData.map(r => ({
                    ...r,
                    // Distance for chart/stops = FileCumulative - FileCumulativeAtStart
                    Distance: r.Distance - initialDist 
                }));

                // Route Stations
                const fIdx = stationsData.findIndex(s => s.name === fromSection);
                const tIdx = stationsData.findIndex(s => s.name === toSection);
                const routeStations = stationsData.slice(Math.min(fIdx, tIdx), Math.max(fIdx, tIdx) + 1).map(s => ({
                    name: s.name, distance: Math.abs(s.distance - fromDistance)
                }));

                // 6. Analysis Logic (Concise)
                // --- Internal Helpers ---
                const getOverSpeedDetails = (data, mps, stns) => {
                    let res = [], grp = null;
                    data.forEach((r, i) => {
                        if (r.Speed > mps) {
                            let sec = 'Unknown';
                            for(let k=0; k<stns.length-1; k++) if(r.Distance >= stns[k].distance && r.Distance < stns[k+1].distance) sec = `${stns[k].name}-${stns[k+1].name}`;
                            if (!grp || grp.section !== sec || (i>0 && (r.Time - data[i-1].Time > 10000))) {
                                if (grp) res.push(grp);
                                grp = { section: sec, startTime: r.Time, endTime: r.Time, minSpeed: r.Speed, maxSpeed: r.Speed };
                            } else {
                                grp.endTime = r.Time; grp.maxSpeed = Math.max(grp.maxSpeed, r.Speed);
                            }
                        } else if (grp) { res.push(grp); grp = null; }
                    });
                    if (grp) res.push(grp);
                    return res.map(g => ({...g, timeRange: `${g.startTime.toLocaleTimeString()}-${g.endTime.toLocaleTimeString()}`, speedRange: `${g.minSpeed.toFixed(0)}-${g.maxSpeed.toFixed(0)}`}));
                };

                const overSpeedDetails = getOverSpeedDetails(finalData, maxPermissibleSpeed, routeStations);

                // Stops
                let stops = [];
                let potentialStops = finalData.filter(r => r.Speed === 0 && r.EventGn === spmConfig.eventCodes.zeroSpeed).map(r => ({
                     index: finalData.indexOf(r), time: r.Time, kilometer: r.Distance, timeString: r.Time.toLocaleString()
                }));

                let currGrp = [];
                potentialStops.forEach((s, i) => {
                    currGrp.push(s);
                    if (i === potentialStops.length - 1 || (potentialStops[i+1].time - s.time > 10000)) {
                        stops.push({ ...currGrp[currGrp.length-1], duration: (currGrp[currGrp.length-1].time - currGrp[0].time)/1000 });
                        currGrp = [];
                    }
                });
                stops = stops.filter(s => s.duration > 10);

                stops = stops.map((s, idx) => {
                    let loc = 'Unknown';
                    let stn = window.stationSignalData.find(r => r.SECTION === section && Math.abs(parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) - fromDistance - s.kilometer) < 400);
                    if(stn) loc = stn.STATION;
                    
                    const dists = [1000, 800, 500, 100, 50];
                    const speedsBefore = dists.map(d => {
                        for(let k=s.index; k>=0; k--) if(s.kilometer - finalData[k].Distance >= d) return finalData[k].Speed.toFixed(0);
                        return 'N/A';
                    });
                    return { ...s, group: idx+1, stopLocation: loc, startTiming: 'N/A', speedsBefore, brakingTechnique: 'Smooth' }; 
                });

                // Charts
                const chartLabels = finalData.filter((_, i) => i % Math.ceil(finalData.length/500) === 0).map(r => r.Time.toLocaleTimeString());
                const chartData = finalData.filter((_, i) => i % Math.ceil(finalData.length/500) === 0).map(r => r.Speed);
                
                const speedCtx = document.getElementById('speedChart').getContext('2d');
                speedChartInstance = new Chart(speedCtx, {
                    type: 'line',
                    data: { labels: chartLabels, datasets: [{ data: chartData, borderColor: 'blue', fill: false }] },
                    options: { animation: false }
                });
                const speedChartImg = speedChartInstance.toBase64Image(); 

                // 7. Compile Report
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
                    crewCallData: [...analyzeCalls(lpCalls, 'LP'), ...analyzeCalls(alpCalls, 'ALP')]
                };

                // 8. Save & Redirect
                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                window.location.href = 'report.html';

            } catch (err) {
                console.error(err);
                alert("TelproNew Analysis Error: " + err.message);
                if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
            }
        };
        reader.readAsArrayBuffer(spmFile);

    } catch (error) {
        console.error("Main Error:", error);
        alert("Error: " + error.message);
        if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
    }
    
    function analyzeCalls(calls, desig) {
         if (!calls) return [];
         return calls.map((c, i) => ({
             designation: `${desig} (Call ${i+1})`,
             totalDuration: c.duration,
             runDuration: 0, stopDuration: c.duration, 
             maxSpeed: 0, toNumbers: c['To Mobile Number']
         }));
    }
};
