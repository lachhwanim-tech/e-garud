/* E-GARUD DEAD VERSION
   This file is kept to maintain file structure compatibility with Live version.
   The upload logic has been moved to googlesheet.js (Apps Script Fetch).
*/

// Function kept to avoid "ReferenceError" if called by legacy code
async function uploadDataAndFileToGoogle() {
    console.log("Dead System: Google Drive Upload Skipped (Not configured in Dead mode).");
    return { status: 'skipped', message: 'Drive upload disabled in Dead version.' };
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}
