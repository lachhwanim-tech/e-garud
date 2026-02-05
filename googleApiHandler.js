// --- SIRF EK MASTER SCRIPT URL (Primary) ---
const MASTER_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyIpH28RYtLBazZQ1ehco5-rtenvNqnmn4FhnJdPz9Ww5KMbtm0-oZF2KMxWA9CLApg/exec';

async function uploadDataAndFileToGoogle() {
    
    // --- GATHER FORM DATA ---
    const formData = {
        cliIdInput: document.getElementById('cliIdInput')?.value.trim() || 'N/A',
        cliName: document.getElementById('cliName').value.trim(),
        lpId: document.getElementById('lpId').value.trim(),
        lpName: document.getElementById('lpName').value.trim(),
        lpGroupCli: document.getElementById('lpGroupCli').value.trim(),
        alpId: document.getElementById('alpId').value.trim(),
        alpName: document.getElementById('alpName').value.trim(),
        alpGroupCli: document.getElementById('alpGroupCli').value.trim(),
        locoNumber: document.getElementById('locoNumber').value.trim(),
        trainNumber: document.getElementById('trainNumber').value.trim(),
        section: document.getElementById('section').value,
        fromSection: document.getElementById('fromSection').value.toUpperCase(),
        toSection: document.getElementById('toSection').value.toUpperCase(),
        spmType: document.getElementById('spmType').value,
        cliHq: document.getElementById('cliHqDisplay') ? document.getElementById('cliHqDisplay').value.trim().toUpperCase() : ''
    };

    const spmFile = document.getElementById('spmFile').files[0];
    if (!spmFile) {
        throw new Error("SPM file is not selected.");
    }

    // --- PREPARE FILE ---
    formData.fileName = spmFile.name;
    formData.mimeType = spmFile.type || 'application/octet-stream'; 
    formData.fileContent = await fileToBase64(spmFile);

    // --- UPLOAD TO MASTER SHEET ---
    try {
        await fetch(MASTER_SCRIPT_URL, {
            method: 'POST',
            // mode: 'no-cors' hata diya gaya hai taaki response mil sake (agar zaroorat ho)
            // Lekin agar CORS error aaye, toh wapas 'no-cors' laga sakte hain.
            // Behtar hai 'no-cors' rakhein for reliability:
            mode: 'no-cors', 
            body: JSON.stringify(formData)
        });
        return { status: 'success', message: 'File Uploaded to Master Data Bank.' };
    } catch (e) {
        console.error("Upload Error:", e);
        return { status: 'error', message: e.message };
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const encoded = reader.result.toString().replace(/^data:(.*,)?/, '');
            resolve(encoded);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}
