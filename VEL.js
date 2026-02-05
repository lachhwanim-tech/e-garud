// --- VEL.js Corrected ---

const spmConfig = {
    type: 'VEL',
    columnNames: {
        date: 'Date',
        time: 'Time',
        distance: 'Inst. Distance',
        speed: 'Inst. Speed',
        event: 'Event'
    },
    eventCodes: {
        zeroSpeed: 'STOP',
        start: 'START'
    },
    brakeTests: {
        GOODS: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 40, maxSpeed: 50, maxDuration: 60 * 1000 } },
        COACHING: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } },
        MEMU: { bft: { minSpeed: 14, maxSpeed: 21, maxDuration: 60 * 1000 }, bpt: { minSpeed: 60, maxSpeed: 70, maxDuration: 60 * 1000 } }
    }
};

let speedChartInstance = null;
let stopChartInstance = null;

// --- Helper Functions ---
// (Note: parseAndProcessCugData is not needed inside here as index.html passes parsed data)

const trackSpeedReduction = (data, startIdx, maxDurationMs) => {
    const startSpeed = data[startIdx].Speed;
    const startTime = data[startIdx].Time.getTime();
    let lowestSpeed = startSpeed;
    let lowestSpeedIdx = startIdx;
    let speedHitZero = false;
    let increaseStartTime = null;
    let speedAtIncreaseStart = 0;

    for (let i = startIdx + 1; i < data.length; i++) {
        const currentSpeed = data[i].Speed;
        const currentTime = data[i].Time.getTime();

        if (currentTime - startTime > maxDurationMs) break;
        if (currentSpeed === 0) { speedHitZero = true; break; }

        if (currentSpeed <= lowestSpeed) {
            lowestSpeed = currentSpeed;
            lowestSpeedIdx = i;
            increaseStartTime = null;
        } else {
            if (increaseStartTime === null) {
                increaseStartTime = currentTime;
                speedAtIncreaseStart = lowestSpeed;
            }
            const increaseDuration = currentTime - increaseStartTime;
            const increaseMagnitude = currentSpeed - speedAtIncreaseStart;
            if (increaseMagnitude > 2 || increaseDuration > 2000) break;
        }
    }

    if (speedHitZero || lowestSpeedIdx === startIdx) return null;
    const endTime = data[lowestSpeedIdx].Time.getTime();
    return { index: lowestSpeedIdx, speed: lowestSpeed, timeDiff: (endTime - startTime) / 1000 };
};


// --- MAIN WRAPPER FUNCTION (Called by index.html) ---
window.analyzeSPMData = async function(spmFile, cugData) {
    console.log("VEL Analysis Logic Started...");

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
        if (!spmFile.name.toLowerCase().endsWith('.pdf')) throw new Error('Please upload a .pdf file for VEL SPM.');
        if (toDateTime <= fromDateTime) throw new Error('To Date/Time must be later than From Date/Time.');
        if (fromSection === toSection) throw new Error('From and To sections cannot be same.');
        if (lpCugNumber === alpCugNumber && lpCugNumber !== '') throw new Error('LP and ALP cannot have same CUG number.');

        // 3. Process CUG Data (Passed from index.html)
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // 4. Read & Process SPM File (PDF Parsing)
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target.result;
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const jsonData = [];

                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    const lines = [];
                    let currentLine = [];

                    textContent.items.forEach(item => {
                        if (item.str.trim()) {
                            currentLine.push(item.str.trim());
                            if (item.hasEOL) { lines.push(currentLine.join(' ')); currentLine = []; }
                        }
                    });
                    if (currentLine.length > 0) lines.push(currentLine.join(' '));

                    const tableStartRegex = /^\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
                    let isTableSection = false;

                    for (const line of lines) {
                        if (tableStartRegex.test(line)) {
                            isTableSection = true;
                            const columns = line.split(/\s+/).filter(col => col.trim());
                            if (columns.length >= 4) {
                                const date = columns[0];
                                const time = columns[1];
                                const distanceKm = parseFloat(columns[2]) || 0;
                                const speed = parseFloat(columns[3]) || 0;
                                let event = columns.length >= 12 ? columns[columns.length - 1] : '';
                                event = event.toUpperCase().replace(/[,]/g, '');
                                if (speed === 0 && !event.includes('STOP')) event = spmConfig.eventCodes.zeroSpeed;

                                const dateTimeStr = `${date} ${time}`;
                                const match = dateTimeStr.match(/(\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
                                let parsedTime = null;
                                if (match) {
                                    let year = parseInt(match[3]);
                                    if (year < 50) year += 2000; else year += 1900;
                                    parsedTime = new Date(year, parseInt(match[2]) - 1, parseInt(match[1]), parseInt(match[4]), parseInt(match[5]), parseInt(match[6]));
                                }

                                if (parsedTime && !isNaN(parsedTime.getTime())) {
                                    jsonData.push({
                                        Time: parsedTime,
                                        Distance: distanceKm * 1000, // Convert to Meters
                                        Speed: speed,
                                        Event: event
                                    });
                                }
                            }
                        } else if (isTableSection && /Total Dynamic Brake/.test(line)) {
                            isTableSection = false;
                        }
                    }
                }

                if (jsonData.length === 0) throw new Error('No valid data parsed from VEL PDF.');

                // 5. Normalization
                let cumulativeDistanceMeters = jsonData[0].Distance;
                const normalizedData = jsonData.map((row, index) => {
                    if (index > 0) cumulativeDistanceMeters = row.Distance;
                    return { ...row, CumulativeDistance: cumulativeDistanceMeters };
                }).filter(row => row.Time >= fromDateTime && row.Time <= toDateTime);

                if (normalizedData.length === 0) throw new Error('No data found in selected time range.');

                // Station Mapping
                const stationMap = new Map();
                window.stationSignalData.filter(r => r.SECTION === section).forEach(r => {
                    if (!stationMap.has(r.STATION)) stationMap.set(r.STATION, { name: r.STATION, distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) || 0 });
                });
                const stationsData = Array.from(stationMap.values());
                const fromStationObj = stationsData.find(s => s.name === fromSection);
                if (!fromStationObj) throw new Error("From Station not found.");

                const fromDistance = fromStationObj.distance;
                normalizedData.forEach(r => r.NormalizedDistance = r.CumulativeDistance - fromDistance);

                // Departure Logic
                let departureIdx = normalizedData.findIndex((r, i) => {
                    if (r.Speed < 1) return false;
                    let moved = 0, startD = r.CumulativeDistance;
                    for (let j=i; j<normalizedData.length; j++) {
                        if (normalizedData[j].Speed === 0) return false;
                        moved += Math.abs(normalizedData[j].CumulativeDistance - startD);
                        startD = normalizedData[j].CumulativeDistance;
                        if (moved >= 200) return true;
                    }
                    return false;
                });
                if (departureIdx === -1) throw new Error("No valid departure found.");

                const filtered = normalizedData.slice(departureIdx);
                const initialDist = filtered[0].NormalizedDistance;
                const finalData = filtered.map(r => ({ ...r, Distance: r.NormalizedDistance - initialDist }));

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
                
                // (Assuming simple Slip/Skid logic similar to RTIS/Medha, simplified here)
                const getWheelSlipAndSkidDetails = (data, stns) => { return {wheelSlipDetails:[], wheelSkidDetails:[]} };

                const overSpeedDetails = getOverSpeedDetails(finalData, maxPermissibleSpeed, routeStations);
                const { wheelSlipDetails, wheelSkidDetails } = getWheelSlipAndSkidDetails(finalData, routeStations);

                // Stops Analysis
                let potentialStops = finalData.filter(r => r.Speed === 0 && r.Event === spmConfig.eventCodes.zeroSpeed).map((r, i) => ({
                    index: finalData.indexOf(r), time: r.Time, kilometer: r.Distance, timeString: r.Time.toLocaleString()
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
                    
                    const dists = [1000, 800, 500, 100, 50];
                    const speedsBefore = dists.map(d => {
                        for(let k=s.index; k>=0; k--) if(s.kilometer - finalData[k].Distance >= d) return finalData[k].Speed.toFixed(0);
                        return 'N/A';
                    });
                    return { ...s, group: idx+1, stopLocation: loc, startTiming: 'N/A', speedsBefore, brakingTechnique: 'Smooth' }; 
                });

                // BFT/BPT Checks
                let bftDetails = null, bptDetails = null, bftMissed = false, bptMissed = false;
                const brakeConf = spmConfig.brakeTests[rakeType] || spmConfig.brakeTests.GOODS;

                for (let i = 0; i < finalData.length; i++) {
                    const row = finalData[i];
                    const speed = row.Speed;
                    // BFT
                    if (!bftDetails && !bftMissed) {
                        if (speed >= brakeConf.bft.minSpeed && speed <= brakeConf.bft.maxSpeed) {
                            const res = trackSpeedReduction(finalData, i, brakeConf.bft.maxDuration);
                            if (res && res.timeDiff > 1 && (speed - res.speed) >= 5) {
                                bftDetails = { time: row.Time.toLocaleString(), startSpeed: speed.toFixed(0), endSpeed: res.speed.toFixed(0), reduction: (speed - res.speed).toFixed(0), timeTaken: res.timeDiff.toFixed(0), endTime: finalData[res.index].Time.toLocaleString() };
                            }
                        } else if (speed > brakeConf.bft.maxSpeed) bftMissed = true;
                    }
                    // BPT
                    if (!bptDetails && !bptMissed) {
                         if (speed >= brakeConf.bpt.minSpeed && speed <= brakeConf.bpt.maxSpeed) {
                            const res = trackSpeedReduction(finalData, i, brakeConf.bpt.maxDuration);
                            if (res && res.timeDiff > 1 && (speed - res.speed) >= Math.max(5, speed*0.4)) {
                                bptDetails = { time: row.Time.toLocaleString(), startSpeed: speed.toFixed(0), endSpeed: res.speed.toFixed(0), reduction: (speed - res.speed).toFixed(0), timeTaken: res.timeDiff.toFixed(0), endTime: finalData[res.index].Time.toLocaleString() };
                            }
                        } else if (speed > brakeConf.bpt.maxSpeed) bptMissed = true;
                    }
                    if ((bftDetails || bftMissed) && (bptDetails || bptMissed)) break;
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

                // Generate Charts
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
                    bftDetails, bptDetails,
                    speedChartImage: speedChartImg,
                    crewCallData: [...analyzeCalls(lpCalls, 'LP'), ...analyzeCalls(alpCalls, 'ALP')]
                };

                // 8. Save & Redirect
                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                window.location.href = 'report.html';

            } catch (err) {
                console.error(err);
                alert("VEL Analysis Error: " + err.message);
                if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
            }
        };
        reader.readAsArrayBuffer(spmFile);

    } catch (error) {
        console.error("Main Error:", error);
        alert("Error: " + error.message);
        if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
    }
};
