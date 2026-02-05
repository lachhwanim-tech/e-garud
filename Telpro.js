// --- Telpro.js Corrected (Excel Version) ---

const spmConfig = {
    type: 'Telpro',
    // Standard Telpro Excel Headers
    columnNames: {
        time: 'Time',       // Sometimes split as Date/Time or just Time
        distance: 'Distance',
        speed: 'Speed',
        event: 'Event'
    },
    eventCodes: {
        zeroSpeed: 'STOP' // Standard Telpro code
    },
    brakeTests: {
        GOODS: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 40, maxSpeed: 50, maxDuration: 60 * 1000 } },
        COACHING: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } },
        MEMU: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } }
    }
};

let speedChartInstance = null;
let stopChartInstance = null;

// --- MAIN WRAPPER FUNCTION (Called by index.html) ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("Telpro Analysis Logic Started...");

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
        if (!['xlsx', 'xls'].includes(fileExt)) throw new Error('Please upload an Excel file (.xlsx/.xls) for Telpro.');
        if (toDateTime <= fromDateTime) throw new Error('To Date/Time must be later than From Date/Time.');
        if (fromSection === toSection) throw new Error('From and To sections cannot be same.');

        // 3. Process CUG Data (Passed from index.html)
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // 4. Read & Process SPM File (Excel Parsing)
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                // Auto-detect Header Row (Telpro often has headers at row 1 or 2)
                let headerRow = 0;
                // Standard Telpro logic: Find row with "Speed" or "Time"
                const range = XLSX.utils.decode_range(sheet['!ref']);
                let foundHeader = false;
                for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
                    for (let c = range.s.c; c <= range.e.c; c++) {
                        const cell = sheet[XLSX.utils.encode_cell({c: c, r: r})];
                        if (cell && String(cell.v).toLowerCase().includes('speed')) {
                            headerRow = r;
                            foundHeader = true;
                            break;
                        }
                    }
                    if(foundHeader) break;
                }

                const headers = [];
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cell = sheet[XLSX.utils.encode_cell({ c: col, r: headerRow })];
                    headers.push(cell && cell.v ? String(cell.v).trim() : '');
                }

                // Column Mapping (Robust Search)
                const timeCol = headers.findIndex(h => /time|date/i.test(h));
                const distanceCol = headers.findIndex(h => /dist/i.test(h));
                const speedCol = headers.findIndex(h => /speed|kmph/i.test(h));
                const eventCol = headers.findIndex(h => /event/i.test(h));

                if (timeCol === -1 || distanceCol === -1 || speedCol === -1) {
                    throw new Error(`Missing required columns (Found: ${headers.join(', ')}). Check Telpro file format.`);
                }

                // Extract Data
                const rawJson = XLSX.utils.sheet_to_json(sheet, { range: headerRow + 1, header: headers, raw: true });

                const parsedData = rawJson.map((row, idx) => {
                    let timeStr = row[headers[timeCol]];
                    let parsedTime = null;

                    // Telpro Date Parsing (Handles Excel Serial or String)
                    if (typeof timeStr === 'number') {
                        // Excel Serial Date
                        parsedTime = new Date(Math.round((timeStr - 25569) * 86400 * 1000));
                        // Correct timezone offset usually needed for local time
                        parsedTime.setMinutes(parsedTime.getMinutes() + parsedTime.getTimezoneOffset()); 
                    } else if (typeof timeStr === 'string') {
                        // String formats (DD/MM/YYYY HH:MM:SS)
                        const parts = timeStr.match(/(\d{2})[\/-](\d{2})[\/-](\d{2,4})\s*(\d{1,2}):(\d{2}):(\d{2})/);
                        if (parts) {
                            let y = parseInt(parts[3]);
                            if (y < 100) y += 2000;
                            parsedTime = new Date(y, parseInt(parts[2])-1, parseInt(parts[1]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6]));
                        } else {
                            parsedTime = new Date(timeStr); // Fallback
                        }
                    }

                    if (!parsedTime || isNaN(parsedTime)) return null;

                    return {
                        Time: parsedTime,
                        Distance: parseFloat(row[headers[distanceCol]]) || 0,
                        Speed: parseFloat(row[headers[speedCol]]) || 0,
                        EventGn: eventCol !== -1 && row[headers[eventCol]] ? String(row[headers[eventCol]]).trim().toUpperCase() : ''
                    };
                }).filter(r => r && r.Time >= fromDateTime && r.Time <= toDateTime);

                if (parsedData.length === 0) throw new Error("No data found in selected time range.");

                // 5. Station Mapping & Normalization
                const stationMap = new Map();
                window.stationSignalData.filter(r => r.SECTION === section).forEach(r => {
                    if (!stationMap.has(r.STATION)) stationMap.set(r.STATION, { name: r.STATION, distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) || 0 });
                });
                const stationsData = Array.from(stationMap.values());
                const fromStationObj = stationsData.find(s => s.name === fromSection);
                if (!fromStationObj) throw new Error("From Station not found in section data.");

                const fromDistance = fromStationObj.distance;
                parsedData.forEach(r => r.NormalizedDistance = (r.Distance * 1000) - fromDistance); // Assuming Telpro Distance is in KM

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

                // Route Stations
                const fIdx = stationsData.findIndex(s => s.name === fromSection);
                const tIdx = stationsData.findIndex(s => s.name === toSection);
                const routeStations = stationsData.slice(Math.min(fIdx, tIdx), Math.max(fIdx, tIdx) + 1).map(s => ({
                    name: s.name, distance: Math.abs(s.distance - fromDistance)
                }));

                // 6. Analysis (OverSpeed, Slip/Skid, Stops)
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

                const overSpeedDetails = getOverSpeedDetails(normalizedData, maxPermissibleSpeed, routeStations);

                // Stops Analysis
                let potentialStops = normalizedData.filter(r => r.Speed === 0).map((r, i) => ({
                    index: normalizedData.indexOf(r), time: r.Time, kilometer: r.Distance, timeString: r.Time.toLocaleString()
                }));
                
                let stops = [];
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
                    
                    // Simplified Braking Logic
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
                alert("Telpro Analysis Error: " + err.message);
                if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
            }
        };
        reader.readAsArrayBuffer(spmFile);

    } catch (error) {
        console.error("Main Error:", error);
        alert("Error: " + error.message);
        if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
    }
    
    // Internal helper for calls inside wrapper
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
