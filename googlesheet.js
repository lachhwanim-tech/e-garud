// --- DEAD SYSTEM BRIDGE ---
// Replaces Live GAPI calls with Apps Script Fetch
// Matches functionality: Saves Summary to Sheet1 and Stops to Detailed_Stops

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzkQMLTtKO1LBk7sZFsSr_QJ9Oa9ZLX9lkN2QQRdpUDV6_l35DxnlysPOyB2rjycp-_ag/exec';

document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('downloadReport');
    if (downloadBtn) {
        // Remove existing listeners to avoid double submission
        const newBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
        
        newBtn.addEventListener('click', async () => {
            console.log("Dead System: Initiating Download Sequence...");
            
            // 1. Validation Logic (Same as Live)
            let isValid = true;
            document.querySelectorAll('#abnormalities-checkbox-container input[type="checkbox"]:checked').forEach(chk => {
                const textId = chk.getAttribute('data-text-id');
                if (textId) {
                    const val = document.getElementById(textId).value.trim();
                    if (!val) { alert("Please enter remark for selected abnormality."); isValid = false; }
                }
            });
            const action = document.querySelector('input[name="actionTakenRadio"]:checked');
            if (!action) { alert("Please select 'Action Taken'."); isValid = false; }
            
            if (!isValid) return;

            // 2. Prepare UI
            newBtn.disabled = true;
            newBtn.innerText = "Saving Data...";
            if(window.toggleLoadingOverlay) window.toggleLoadingOverlay(true);

            // 3. Gather Data
            const reportData = JSON.parse(localStorage.getItem('spmReportData') || '{}');
            await sendDataToGoogleSheet(reportData);
        });
    }
});

async function sendDataToGoogleSheet(data) {
    try {
        // --- DATA PREPARATION (Exact Match to Code.gs requirements) ---
        
        // 1. Get DOM Elements for latest inputs
        const cliObs = document.getElementById('cliRemarks')?.value.trim() || 'NIL';
        const actionTaken = document.querySelector('input[name="actionTakenRadio"]:checked')?.value || 'NIL';
        
        // 2. Count Abnormalities
        const getChk = (id) => document.getElementById(id)?.checked ? 1 : 0;
        const abnCounts = {
            bftNotDone: getChk('chk-bft-nd'),
            bptNotDone: getChk('chk-bpt-nd'),
            bftRule: getChk('chk-bft-rule'),
            bptRule: getChk('chk-bpt-rule'),
            lateCtrl: getChk('chk-late-ctrl'),
            overspeed: getChk('chk-overspeed'),
            other: getChk('chk-others')
        };
        const totalAbn = Object.values(abnCounts).reduce((a,b)=>a+b,0);
        
        // 3. Helper to extract values safely
        const getVal = (arr, label) => {
            if(!arr) return '';
            const item = arr.find(i => i.label && i.label.includes(label));
            return item ? item.value : '';
        };

        const payload = {
            // Train & Crew Info
            trainNumber: getVal(data.trainDetails, 'Train Number'),
            locoNumber: getVal(data.trainDetails, 'Loco Number'),
            rakeType: getVal(data.trainDetails, 'Type of Rake'),
            section: getVal(data.trainDetails, 'Section'),
            mps: getVal(data.trainDetails, 'Max Permissible'),
            fromStn: getVal(data.trainDetails, 'Route').split('-')[0] || '',
            toStn: getVal(data.trainDetails, 'Route').split('-')[1] || '',
            journeyDate: getVal(data.trainDetails, 'Analysis Time').split(' to ')[0].replace('From ', ''), // Simple date extract
            
            cliName: getVal(data.trainDetails, 'Analysis By'),
            
            lpId: getVal(data.lpDetails, 'ID'),
            lpName: getVal(data.lpDetails, 'LP Name'), // Check exact label in report data
            lpGroupCli: getVal(data.lpDetails, 'Group CLI'),
            
            alpId: getVal(data.alpDetails, 'ID'),
            alpName: getVal(data.alpDetails, 'ALP Name'),
            alpGroupCli: getVal(data.alpDetails, 'Group CLI'),
            
            // Stats
            bftStatus: data.bftDetails?.time ? "Done" : "Not done",
            bptStatus: data.bptDetails?.time ? "Done" : "Not done",
            overspeedCount: data.overSpeedDetails ? data.overSpeedDetails.length : 0,
            totalDist: data.speedRangeSummary?.totalDistance || '0',
            avgSpeed: data.averageSpeed || '0',
            
            // Manual Inputs
            cliObservation: cliObs,
            actionTaken: actionTaken,
            totalAbnormality: totalAbn,
            ...abnCounts, // Spreads bftNotDone, etc.
            
            // STOPS DATA (Critical for Code.gs to populate Detailed_Stops)
            // We verify stops has the 11-point speed array
            stopsJson: JSON.stringify(data.stops || [])
        };

        // --- 4. SEND TO APPS SCRIPT ---
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Standard for Apps Script POST
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log("Data Sent to Backend.");
        
        // --- 5. TRIGGER PDF GENERATION ---
        if (typeof generatePDF === 'function') {
            await generatePDF();
            alert("Report saved and PDF generated successfully!");
            // Cleanup
            localStorage.removeItem('spmReportData');
            window.location.href = 'index.html';
        } else {
            alert("Data saved, but PDF generator missing.");
            if(window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
        }

    } catch (error) {
        console.error("Save Error:", error);
        alert("Failed to save data: " + error.message);
        if(window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
        const btn = document.getElementById('downloadReport');
        if(btn) { btn.disabled = false; btn.innerText = "Download Report"; }
    }
}
