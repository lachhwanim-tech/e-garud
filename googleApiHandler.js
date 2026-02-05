const PRIMARY_URL = 'https://script.google.com/macros/s/AKfycbzmmdhypTZgkmNjRS6LUo3hXrGeVzaOUwIuSlUWNjV_P3jy7DqxBpdV3cA0gi_db9TT/exec'; // Apne Primary URL se badlein
const OTHER_URL = 'https://script.google.com/macros/s/AKfycbzlq156m6UH5YhA6rYBsUCIvNiJU8B1Vlp04c-IuOPqRCX04mv1GPIvl96EANS5Aq9u/exec'; // Apne Other URL se badlein

/**
 * Converts a file to a Base64 string.
 */
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

/**
 * Gathers all data and sends it to the correct E-Garud Script.
 */
async function uploadDataAndFileToGoogle() {
    // --- UPDATED ALLOWED HQS (Raipur Division) ---
    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DRZ', 'DURG'];

    const currentHq = document.getElementById('cliHqDisplay') ? document.getElementById('cliHqDisplay').value.trim().toUpperCase() : '';

    // Route to Primary if HQ is in Raipur Division list, else to Other
    let targetUrl = ALLOWED_HQS.includes(currentHq) ? PRIMARY_URL : OTHER_URL;

    // --- GATHER FORM DATA (23-Column Compatible) ---
    const formData = {
        cliIdInput: document.getElementById('cliIdInput')?.value.trim() || 'N/A', // Col B
        cliName: document.getElementById('cliName').value.trim(),                // Col C
        lpId: document.getElementById('lpId').value.trim(),                     // Col D
        lpName: document.getElementById('lpName').value.trim(),                 // Col E
        lpGroupCli: document.getElementById('lpGroupCli').value.trim(),         // Col G
        alpId: document.getElementById('alpId').value.trim(),                   // Col H
        alpName: document.getElementById('alpName').value.trim(),               // Col I
        alpGroupCli: document.getElementById('alpGroupCli').value.trim(),       // Col J
        locoNumber: document.getElementById('locoNumber').value.trim(),         // Col K
        trainNumber: document.getElementById('trainNumber').value.trim(),       // Col L
        section: document.getElementById('section').value,                     // Col M
        fromSection: document.getElementById('fromSection').value.toUpperCase(), // Col N
        toSection: document.getElementById('toSection').value.toUpperCase(),     // Col O
        spmType: document.getElementById('spmType').value,                     // Col P
        // Day/Night and StopsJson logic is handled in the script/googlesheet.js, 
        // but adding basic placeholders to ensure object structure matches.
        fromDateTime: document.getElementById('fromDateTime').value,
        cliHq: currentHq
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
            mode: 'no-cors', 
            body: JSON.stringify(formData)
        });
        return { status: 'success', message: 'File Uploaded and Routed to E-Garud System.' };
    } catch (e) {
        console.error("Upload Error:", e);
        return { status: 'error', message: e.message };
    }
}
