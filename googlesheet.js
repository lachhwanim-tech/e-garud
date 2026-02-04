async function sendDataToGoogleSheet(data, pdfBlob = null) {
    // 1. Primary Apps Script URL (Raipur Division)
    const primaryAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwjz5OJit3c6kA7G5IHenk5CYvkf9nFCiBOp7syEH0Pe7ne3uFN7D-i3seQvssHgGXk/exec';

    // 2. Secondary Apps Script URL (Other Divisions)
    const otherAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbzQ1m7Pb6RrtVTOP1Js_fawI8lOs92YOSnuMlZlzXwwHrWZeS8TrFWUhgAPGSr6dvpX/exec'; 

    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DRZ', 'DURG'];

    // Sanitization to prevent Payload Too Large errors
    const syncData = JSON.parse(JSON.stringify(data));
    delete syncData.speedChartConfig;
    delete syncData.stopChartConfig;
    delete syncData.speedChartImage;
    delete syncData.stopChartImage;

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
