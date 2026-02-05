// --- googlesheet.js Corrected ---

document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('downloadReport');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            console.log("Download Clicked - Sending FINAL Data to Sheet...");
            const reportData = JSON.parse(localStorage.getItem('spmReportData') || '{}');
            await sendDataToGoogleSheet(reportData);
        });
    }
});

async function sendDataToGoogleSheet(data) {
    const MASTER_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyIpH28RYtLBazZQ1ehco5-rtenvNqnmn4FhnJdPz9Ww5KMbtm0-oZF2KMxWA9CLApg/exec';

    // Prepare Abnormalities Text
    let abnormalitiesArr = [];
    if(data.overSpeedDetails && data.overSpeedDetails.length > 0) {
        abnormalitiesArr.push(`Overspeed (${data.overSpeedDetails.length})`);
    }
    // Check manual checkboxes from DOM
    document.querySelectorAll('#abnormalities-checkbox-container input[type="checkbox"]:checked').forEach(chk => {
        let label = chk.closest('label').innerText.trim();
        abnormalitiesArr.push(label);
    });

    const cliRemark = document.getElementById('cliRemarks')?.value.trim() || 'NIL';
    const actionTaken = document.querySelector('input[name="actionTakenRadio"]:checked')?.value || 'NIL';

    // Parsing specific IDs safely
    const getVal = (arr, prefix) => {
        if(!arr) return 'N/A';
        const item = arr.find(s => s.startsWith(prefix));
        return item ? item.split(':')[1].trim() : 'N/A';
    };

    const syncData = {
        cliIdInput: getVal(data.trainDetails, 'Analysis By') || 'N/A', // Adjust based on your label
        cliName: data.trainDetails?.find(d => d.label === 'Analysis By')?.value || 'N/A',
        lpId: getVal(data.lpDetails, 'ID'),
        lpName: getVal(data.lpDetails, 'LP'),
        lpGroupCli: getVal(data.lpDetails, 'Group CLI'),
        alpId: getVal(data.alpDetails, 'ID'),
        alpName: getVal(data.alpDetails, 'ALP'),
        alpGroupCli: getVal(data.alpDetails, 'Group CLI'),
        locoNumber: data.trainDetails?.find(d => d.label === 'Loco')?.value || 'N/A',
        trainNumber: data.trainDetails?.find(d => d.label === 'Train')?.value || 'N/A',
        section: data.trainDetails?.find(d => d.label === 'Section')?.value || 'N/A',
        spmType: data.trainDetails?.find(d => d.label === 'SPM Type')?.value || 'N/A',
        
        // Critical Data Fixes
        averageSpeed: data.averageSpeed || '0', // RTIS.js se aayi value
        abnormality: abnormalitiesArr.join(', ') || 'NIL',
        cliObservation: cliRemark,
        actionTaken: actionTaken,
        totalAbnormality: abnormalitiesArr.length.toString(),
        
        stopsJson: JSON.stringify(data.stops || []),
        fileUrl: "File Uploaded to Drive (Check Folder)"
    };

    try {
        await fetch(MASTER_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncData)
        });
        console.log("Final Analysis Data Sent Successfully.");
        alert("Report Data successfully saved to Master Sheet!");
    } catch (error) {
        console.error('Submission Error:', error);
        alert("Error saving data to sheet.");
    }
}
