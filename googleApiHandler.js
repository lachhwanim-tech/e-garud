async function uploadDataAndFileToGoogle() {
    const PRIMARY_URL = 'https://script.google.com/macros/s/AKfycbzmmdhypTZgkmNjRS6LUo3hXrGeVzaOUwIuSlUWNjV_P3jy7DqxBpdV3cA0gi_db9TT/exec';
    const OTHER_URL = 'https://script.google.com/macros/s/AKfycbzlq156m6UH5YhA6rYBsUCIvNiJU8B1Vlp04c-IuOPqRCX04mv1GPIvl96EANS5Aq9u/exec';
    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DRZ', 'DURG'];

    const currentHq = document.getElementById('cliHqDisplay')?.value.trim().toUpperCase() || '';
    let targetUrl = ALLOWED_HQS.includes(currentHq) ? PRIMARY_URL : OTHER_URL;

    const formData = {
        cliIdInput: document.getElementById('cliIdInput')?.value.trim() || 'N/A',
        cliName: document.getElementById('cliName')?.value.trim(),
        lpId: document.getElementById('lpId')?.value.trim(),
        lpName: document.getElementById('lpName')?.value.trim(),
        lpGroupCli: document.getElementById('lpGroupCli')?.value.trim(),
        alpId: document.getElementById('alpId')?.value.trim(),
        alpName: document.getElementById('alpName')?.value.trim(),
        alpGroupCli: document.getElementById('alpGroupCli')?.value.trim(),
        locoNumber: document.getElementById('locoNumber')?.value.trim(),
        trainNumber: document.getElementById('trainNumber')?.value.trim(),
        section: document.getElementById('section')?.value,
        fromSection: document.getElementById('fromSection')?.value.toUpperCase(),
        toSection: document.getElementById('toSection')?.value.toUpperCase(),
        spmType: document.getElementById('spmType')?.value,
        cliHq: currentHq
    };

    const spmFile = document.getElementById('spmFile').files[0];
    if (!spmFile) throw new Error("SPM file not selected.");

    formData.fileName = spmFile.name;
    formData.mimeType = spmFile.type || 'application/octet-stream'; 
    formData.fileContent = await fileToBase64(spmFile);

    try {
        // mode: 'no-cors' hatane se data delivery behtar hoti hai
        await fetch(targetUrl, { method: 'POST', body: JSON.stringify(formData) });
        return { status: 'success' };
    } catch (e) {
        console.error("Upload failed:", e);
        return { status: 'error', message: e.message };
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.toString().replace(/^data:(.*,)?/, ''));
        reader.onerror = e => reject(e);
        reader.readAsDataURL(file);
    });
}
