// --- googleApiHandler.js (Sirf File Upload ke liye) ---

// Aapka Master Script URL (Primary)
const MASTER_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyIpH28RYtLBazZQ1ehco5-rtenvNqnmn4FhnJdPz9Ww5KMbtm0-oZF2KMxWA9CLApg/exec'; 

async function uploadDataAndFileToGoogle() {
    const spmFile = document.getElementById('spmFile').files[0];
    if (!spmFile) {
        throw new Error("SPM file is not selected.");
    }

    console.log("Uploading file to Drive...");

    // Hum sirf file details bhej rahe hain. 
    // Backend script (agar updated hai) toh samajh jayega ki sirf file save karni hai.
    const formData = {
        fileName: spmFile.name,
        mimeType: spmFile.type || 'application/octet-stream',
        fileContent: await fileToBase64(spmFile),
        
        // Yeh data sirf file ke naam ke liye bhej rahe hain, sheet mein likhne ke liye nahi
        cliIdInput: document.getElementById('cliIdInput')?.value.trim() || 'N/A',
        cliName: document.getElementById('cliName')?.value.trim() || 'N/A',
        lpId: document.getElementById('lpId')?.value.trim() || 'N/A',
        
        // Ek flag bhejte hain (Optional: agar backend future mein update karein)
        action: "UPLOAD_ONLY" 
    };

    try {
        await fetch(MASTER_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Browser security ke liye zaroori hai
            body: JSON.stringify(formData)
        });
        
        // Chunki 'no-cors' hai, humein server se response nahi milta.
        // Hum maan lete hain ki upload shuru ho gaya hai.
        return { status: 'success', message: 'File Upload Initiated' };

    } catch (e) {
        console.error("Upload Error:", e);
        // Network error ke case mein hi ye catch hoga
        return { status: 'error', message: e.message };
    }
}

// File ko Text/Base64 mein badalne ka helper
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Base64 string se 'data:...' wala hissa hatana zaroori hai Apps Script ke liye
            const encoded = reader.result.toString().replace(/^data:(.*,)?/, '');
            resolve(encoded);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}
