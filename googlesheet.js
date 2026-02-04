async function sendDataToGoogleSheet(data, pdfBlob = null) {
    // 1. Primary Apps Script URL (Main Sheet - SPM ANALYSIS BANK)
    const primaryAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwjz5OJit3c6kA7G5IHenk5CYvkf9nFCiBOp7syEH0Pe7ne3uFN7D-i3seQvssHgGXk/exec';

    // 2. Secondary Apps Script URL (Other Sheet - OTHER DIVISION)
    const otherAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbzQ1m7Pb6RrtVTOP1Js_fawI8lOs92YOSnuMlZlzXwwHrWZeS8TrFWUhgAPGSr6dvpX/exec'; 

    // --- UPDATED ALLOWED HQ LIST (Raipur Division) ---
    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DRZ', 'DURG'];

    // --- START: DATA COLLECTION ---
    data.abnormality_bft_nd = document.getElementById('chk-bft-nd')?.checked ? 1 : 0;
    data.abnormality_bpt_nd = document.getElementById('chk-bpt-nd')?.checked ? 1 : 0;
    data.abnormality_bft_rule = document.getElementById('chk-bft-rule')?.checked ? 1 : 0;
    data.abnormality_bpt_rule = document.getElementById('chk-bpt-rule')?.checked ? 1 : 0;
    data.abnormality_late_ctrl = document.getElementById('chk-late-ctrl')?.checked ? 1 : 0;
    data.abnormality_overspeed = document.getElementById('chk-overspeed')?.checked ? 1 : 0;
    data.abnormality_others = document.getElementById('chk-others')?.checked ? 1 : 0;

    const abnormalityStrings = [];
    if (data.abnormality_bft_nd) abnormalityStrings.push("BFT not done");
    if (data.abnormality_bpt_nd) abnormalityStrings.push("BPT not done");
    if (data.abnormality_bft_rule) abnormalityStrings.push(`BFT not done as per rule:- ${document.getElementById('txt-bft-rule')?.value.trim()}`);
    if (data.abnormality_bpt_rule) abnormalityStrings.push(`BPT not done as per rule:- ${document.getElementById('txt-bpt-rule')?.value.trim()}`);
    if (data.abnormality_late_ctrl) abnormalityStrings.push(`Late Controlling:- ${document.getElementById('txt-late-ctrl')?.value.trim()}`);
    if (data.abnormality_overspeed) abnormalityStrings.push(`Over speeding:- ${document.getElementById('txt-overspeed')?.value.trim()}`);
    if (data.abnormality_others) abnormalityStrings.push(`Other Abnormalities:- ${document.getElementById('txt-others')?.value.trim()}`);

    data.abnormality = abnormalityStrings.join('; \n') || 'NIL'; 
    
    const cliAbnormalitiesArea = document.getElementById('cliAbnormalities');
    if(cliAbnormalitiesArea) cliAbnormalitiesArea.value = data.abnormality;

    data.cliObservation = document.getElementById('cliRemarks')?.value.trim() || 'NIL';
    data.totalAbnormality = document.getElementById('totalAbnormality')?.value.trim() || '0';
    
    const selectedActionRadio = document.querySelector('input[name="actionTakenRadio"]:checked');
    data.actionTaken = selectedActionRadio ? selectedActionRadio.value : 'NIL';

    data.bftRemark = document.getElementById('bftRemark')?.value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark')?.value.trim() || 'NA';

    if (data.stops && Array.isArray(data.stops)) {
        data.stops.forEach((stop, index) => {
            const systemAnalysisSelect = document.querySelector(`.system-analysis-dropdown[data-stop-index="${index}"]`);
            stop.finalSystemAnalysis = systemAnalysisSelect ? systemAnalysisSelect.value : stop.brakingTechnique;
            const cliRemarkInput = document.querySelector(`.cli-remark-input-row[data-stop-index="${index}"]`);
            stop.cliRemark = cliRemarkInput ? cliRemarkInput.value.trim() : 'NIL'; 
        });
    }

    // --- PDF Conversion to Base64 for Drive Upload ---
    if (pdfBlob) {
        const reader = new FileReader();
        data.fileContent = await new Promise(resolve => {
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(pdfBlob);
        });
        data.fileName = `E-GARUD_${data.lpId || 'Trip'}_${Date.now()}.pdf`;
        data.mimeType = "application/pdf";
    }
    
    // Deleting heavy images to keep payload size within Google Script limits
    delete data.speedChartConfig;
    delete data.stopChartConfig;
    delete data.speedChartImage;
    delete data.stopChartImage;

    // --- READ HQ FROM STORAGE & ROUTING ---
    let storedHq = localStorage.getItem('currentSessionHq');
    if (!storedHq && document.getElementById('cliHqDisplay')) {
        storedHq = document.getElementById('cliHqDisplay').value;
    }

    let currentHq = storedHq ? storedHq.toString().trim().toUpperCase() : "UNKNOWN";
    data.cliHq = currentHq;

    let targetUrl = ALLOWED_HQS.includes(currentHq) ? primaryAppsScriptUrl : otherAppsScriptUrl;

    // --- SEND DATA ---
    try {
        await fetch(targetUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(data)
        });
        console.log('Data sent successfully to:', targetUrl);
        return true;
    } catch (error) {
        console.error('Error sending data to Google Sheet:', error);
        alert('Network Error. Data could not be sent.');
        throw error; 
    }
}
