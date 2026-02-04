const PRIMARY_URL = 'https://script.google.com/macros/s/AKfycbxDDRsC4iG_HtprIM2YHXObVLNEVPYqNMFZcRLzKCKs-jtFMgFj7qX2XR8hz_B6mdf9/exec';
const OTHER_URL = 'https://script.google.com/macros/s/AKfycbzHlr8zK1uYdq1tu2eLJoCxwbK-HB7RdXuerFS58LF6-xH1QCGvEM67pi2IFZr9zSZJ/exec';

/**
 * Converts a file to a Base64 string.
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const encoded = reader.result.toString().replace(/^data:(.*,)?/, '');
            if ((encoded.length % 4) > 0) {
                encoded += '='.repeat(4 - (encoded.length % 4));
            }
            resolve(encoded);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Gathers all data and sends it to the correct E-Garud Script.
 */
async function uploadDataAndFileToGoogle() {
    // --- UPDATED ALLOWED HQS (Raipur Division) ---
    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DRZ', 'DURG'];

    const currentHq = document.getElementById('cliHqDisplay') ? document.getElementById('cliHqDisplay').value.trim().toUpperCase() : '';

    // Route to Primary if HQ is in Raipur Division list, else to Other
    let targetUrl = ALLOWED_HQS.includes(currentHq) ? PRIMARY_URL : OTHER_URL;

    // --- GATHER FORM DATA ---
    const formData = {
        lpId: document.getElementById('lpId').value.trim(),
        lpName: document.getElementById('lpName').value.trim(),
        lpDesg: document.getElementById('lpDesg').value.trim(),
        lpGroupCli: document.getElementById('lpGroupCli').value.trim(),
        lpCugNumber: document.getElementById('lpCugNumber').value.trim(),
        alpId: document.getElementById('alpId').value.trim(),
        alpName: document.getElementById('alpName').value.trim(),
        alpDesg: document.getElementById('alpDesg').value.trim(),
        alpGroupCli: document.getElementById('alpGroupCli').value.trim(),
        alpCugNumber: document.getElementById('alpCugNumber').value.trim(),
        locoNumber: document.getElementById('locoNumber').value.trim(),
        trainNumber: document.getElementById('trainNumber').value.trim(),
        rakeType: document.getElementById('rakeType').value,
        maxPermissibleSpeed: document.getElementById('maxPermissibleSpeed').value,
        section: document.getElementById('section').value,
        fromSection: document.getElementById('fromSection').value.toUpperCase(),
        toSection: document.getElementById('toSection').value.toUpperCase(),
        spmType: document.getElementById('spmType').value,
        cliName: document.getElementById('cliName').value.trim(),
        cliHq: currentHq,
        fromDateTime: document.getElementById('fromDateTime').value,
        toDateTime: document.getElementById('toDateTime').value,
    };

    const spmFile = document.getElementById('spmFile').files[0];
    if (!spmFile) {
        throw new Error("SPM file is not selected.");
    }

    // --- PREPARE FILE ---
    formData.fileName = spmFile.name;
    formData.mimeType = spmFile.type || 'application/octet-stream'; 
    formData.fileContent = await fileToBase64(spmFile);

    // --- UPLOAD ---
    try {
        await fetch(targetUrl, {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        return { status: 'success', message: 'Routed to E-Garud System.' };
    } catch (e) {
        console.error("Upload Error:", e);
        return { status: 'error', message: e.message };
    }
}
