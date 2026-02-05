async function sendDataToGoogleSheet(data, pdfBlob = null) {
    const primaryUrl = 'https://script.google.com/macros/s/AKfycbzmmdhypTZgkmNjRS6LUo3hXrGeVzaOUwIuSlUWNjV_P3jy7DqxBpdV3cA0gi_db9TT/exec';
    const otherUrl = 'https://script.google.com/macros/s/AKfycbzlq156m6UH5YhA6rYBsUCIvNiJU8B1Vlp04c-IuOPqRCX04mv1GPIvl96EANS5Aq9u/exec'; 

    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DRZ', 'DURG'];

    const syncData = JSON.parse(JSON.stringify(data));
    delete syncData.speedChartConfig; delete syncData.stopChartConfig;
    delete syncData.speedChartImage; delete syncData.stopChartImage;

    // --- EXACT MAPPING FOR 23-COLUMNS ---
    syncData.cliIdInput = document.getElementById('cliIdInput')?.value.trim() || 'N/A';
    syncData.cliName = document.getElementById('cliName')?.value.trim() || 'N/A';
    syncData.lpGroupCli = document.getElementById('lpGroupCli')?.value.trim() || 'N/A';
    syncData.alpGroupCli = document.getElementById('alpGroupCli')?.value.trim() || 'N/A';
    syncData.fromSection = document.getElementById('fromSection')?.value.toUpperCase() || 'N/A';
    syncData.toSection = document.getElementById('toSection')?.value.toUpperCase() || 'N/A';
    syncData.cliObservation = document.getElementById('cliRemarks')?.value.trim() || 'NIL';
    syncData.actionTaken = document.querySelector('input[name="actionTakenRadio"]:checked')?.value || 'NIL';
    syncData.totalAbnormality = document.getElementById('totalAbnormality')?.value || '0';
    syncData.stopsJson = JSON.stringify(data.stops || []);
    syncData.averageSpeed = localStorage.getItem('lastAvgSpeed') || '0';

    if (data.fromDateTime) {
        const hour = new Date(data.fromDateTime).getHours();
        syncData.dayNight = (hour >= 6 && hour < 18) ? "DAY" : "NIGHT";
    }

    if (pdfBlob) {
        const reader = new FileReader();
        syncData.fileContent = await new Promise(resolve => {
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(pdfBlob);
        });
        syncData.fileName = `E-GARUD_${data.lpId || 'Trip'}.pdf`;
        syncData.mimeType = "application/pdf";
    }

    let storedHq = localStorage.getItem('currentSessionHq') || "UNKNOWN";
    let targetUrl = ALLOWED_HQS.includes(storedHq.trim().toUpperCase()) ? primaryUrl : otherUrl;

    try {
        await fetch(targetUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(syncData)
        });
        return true;
    } catch (error) {
        console.error('Submission failed:', error);
        throw error;
    }
}
