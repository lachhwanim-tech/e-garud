async function sendDataToGoogleSheet(data, pdfBlob = null) {
    // 1. Primary Apps Script URL (Raipur Division)
    const primaryAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbzmmdhypTZgkmNjRS6LUo3hXrGeVzaOUwIuSlUWNjV_P3jy7DqxBpdV3cA0gi_db9TT/exec';

    // 2. Secondary Apps Script URL (Other Divisions)
    const otherAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbzlq156m6UH5YhA6rYBsUCIvNiJU8B1Vlp04c-IuOPqRCX04mv1GPIvl96EANS5Aq9u/exec'; 

    // Updated Raipur Division HQs
    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DRZ', 'DURG'];

    // Sanitization to prevent Payload Too Large errors
    const syncData = JSON.parse(JSON.stringify(data));
    delete syncData.speedChartConfig;
    delete syncData.stopChartConfig;
    delete syncData.speedChartImage;
    delete syncData.stopChartImage;

    // --- Minimum Required Changes for 23-Columns ---
    syncData.cliIdInput = document.getElementById('cliIdInput')?.value.trim() || 'N/A'; // Col 2
    syncData.fromSection = document.getElementById('fromSection')?.value.toUpperCase() || 'N/A'; // Col 13
    syncData.toSection = document.getElementById('toSection')?.value.toUpperCase() || 'N/A'; // Col 14
    syncData.stopsJson = JSON.stringify(data.stops || []); // Col 22
    
    // Day/Night calculation logic
    if (data.fromDateTime) {
        const hour = new Date(data.fromDateTime).getHours();
        syncData.dayNight = (hour >= 6 && hour < 18) ? "DAY" : "NIGHT";
    }

    // Convert PDF to Base64 for Drive Storage
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
    syncData.cliHq = storedHq.trim().toUpperCase();
    let targetUrl = ALLOWED_HQS.includes(syncData.cliHq) ? primaryAppsScriptUrl : otherAppsScriptUrl;

    try {
        await fetch(targetUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(syncData)
        });
        return true;
    } catch (error) {
        console.error('Dispatch failed:', error);
        throw error;
    }
}
