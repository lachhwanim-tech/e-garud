document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('downloadReport');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            console.log("Download Clicked - Preparing Data for Master Sheet...");
            const reportData = JSON.parse(localStorage.getItem('spmReportData') || '{}');
            await sendDataToGoogleSheet(reportData);
        });
    }
});

async function sendDataToGoogleSheet(data, pdfBlob = null) {
    // --- SIRF EK MASTER SCRIPT URL (Primary) ---
    const MASTER_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyIpH28RYtLBazZQ1ehco5-rtenvNqnmn4FhnJdPz9Ww5KMbtm0-oZF2KMxWA9CLApg/exec';

    // --- PAYLOAD PREPARATION ---
    const syncData = {
        cliIdInput: document.getElementById('cliIdInput')?.value.trim() || 'N/A',
        cliName: document.getElementById('cliName')?.value.trim() || 'N/A',
        lpId: data.lpDetails ? data.lpDetails[0]?.split(':')[1]?.trim() : 'N/A',
        lpName: data.lpDetails ? data.lpDetails[1]?.split(':')[1]?.trim() : 'N/A',
        lpGroupCli: data.lpDetails ? data.lpDetails[3]?.split(':')[1]?.trim() : 'N/A',
        alpId: data.alpDetails ? data.alpDetails[0]?.split(':')[1]?.trim() : 'N/A',
        alpName: data.alpDetails ? data.alpDetails[1]?.split(':')[1]?.trim() : 'N/A',
        alpGroupCli: data.alpDetails ? data.alpDetails[3]?.split(':')[1]?.trim() : 'N/A',
        locoNumber: data.trainDetails?.find(d => d.label === 'Loco Number')?.value || 'N/A',
        trainNumber: data.trainDetails?.find(d => d.label === 'Train Number')?.value || 'N/A',
        section: data.trainDetails?.find(d => d.label === 'Section')?.value || 'N/A',
        fromSection: data.trainDetails?.find(d => d.label === 'From Station')?.value || 'N/A',
        toSection: data.trainDetails?.find(d => d.label === 'To Station')?.value || 'N/A',
        spmType: data.trainDetails?.find(d => d.label === 'SPM Type')?.value || 'N/A',
        
        // Calculations
        dayNight: (new Date(data.trainDetails?.find(d => d.label === 'From Date & Time')?.value).getHours() >= 6 && new Date(data.trainDetails?.find(d => d.label === 'From Date & Time')?.value).getHours() < 18) ? "DAY" : "NIGHT",
        averageSpeed: localStorage.getItem('lastAvgSpeed') || '0',
        abnormality: getAbnormalitiesText(),
        cliObservation: document.getElementById('cliRemarks')?.value.trim() || 'NIL',
        actionTaken: document.querySelector('input[name="actionTakenRadio"]:checked')?.value || 'NIL',
        totalAbnormality: document.getElementById('totalAbnormality')?.value || '0',
        stopsJson: JSON.stringify(data.stops || []),
        fileUrl: "Pending PDF"
    };

    console.log("Sending Data to Master Sheet...", syncData);

    try {
        await fetch(MASTER_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncData)
        });
        console.log("Data successfully sent to Master Data Bank.");
        return true;
    } catch (error) {
        console.error('Submission Error:', error);
    }
}

function getAbnormalitiesText() {
    let text = [];
    document.querySelectorAll('#abnormalities-checkbox-container input[type="checkbox"]:checked').forEach(chk => {
        let label = chk.parentElement.textContent.trim();
        let inputId = chk.getAttribute('data-text-id');
        let extra = inputId ? document.getElementById(inputId)?.value : '';
        text.push(extra ? `${label} (${extra})` : label);
    });
    return text.join(', ') || "NIL";
}
