/* -------------------------------------------------------------
   A. SUPABASE CLIENT SETTINGS CONFIGURATION
   ------------------------------------------------------------- */
const SUPABASE_URL = 'https://shgccltzjmeeeycvqyiu.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_I3lVPAHunarUWcSfMfBZXw_qSttvTki';

let myDb = null;
let pointer = 0;           
let bookElements = []; 
let localFallbackArray = []; 

try {
    if (typeof window.supabase !== 'undefined' && SUPABASE_URL) {
        myDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch(e) {
    console.error("Supabase engine connection failed:", e);
}

function assignClickAction(id, actionFunction) {
    const targetElement = document.getElementById(id);
    if (targetElement) {
        targetElement.onclick = actionFunction;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    assignClickAction('prev-btn', stepBackward);
    assignClickAction('next-btn', stepForward);
    assignClickAction('add-page-btn', handleMemoryAddition);
    
    const coverSheet = document.getElementById('page-0');
    if (coverSheet) {
        coverSheet.onclick = stepForward;
    }

    updateBookElementsContext();
    
    // Check server in the background while popup is on screen
    setTimeout(() => {
        syncDatabaseMemories();
    }, 100);
});

function updateBookElementsContext() {
    bookElements = document.querySelectorAll('.page');
}

/* -------------------------------------------------------------
   B. GREETING POPUP LOGIC
   ------------------------------------------------------------- */
// Global function so it can be triggered from the HTML button
window.executeOpenSequence = function() {
    // 1. Hide the greeting popup
    document.getElementById('greeting-overlay').style.display = 'none';
    
    // 2. Show the controls and dock
    document.getElementById('admin-dock').style.display = 'flex';
    document.getElementById('navigation-controls').style.display = 'flex';
    
    // 3. Automatically flip the cover open
    stepForward();
};


/* -------------------------------------------------------------
   C. SERVER DATA STORAGE SYNC MANAGEMENT
   ------------------------------------------------------------- */
async function syncDatabaseMemories() {
    const cached = localStorage.getItem('local_kbday_backup');
    localFallbackArray = cached ? JSON.parse(cached) : [];
    const coverText = document.getElementById('cover-instruction');

    if (!myDb) {
        if (coverText) coverText.innerText = "Running locally. Tap cover to open!";
        renderLivePages(localFallbackArray);
        return;
    }

    try {
        const { data: memories, error } = await myDb
            .from('kbday')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) {
            console.error("Server query failed:", error.message);
            if (coverText) coverText.innerText = "Server offline. Tap cover to open local mode!";
            renderLivePages(localFallbackArray);
            return;
        }

        if (memories && memories.length > 0) {
            if (coverText) coverText.innerText = "Memories loaded securely.";
            renderLivePages(memories);
        } else {
            if (coverText) coverText.innerText = "Book empty! Use panel to add a page.";
            renderLivePages(localFallbackArray);
        }
    } catch (err) {
        console.warn("Connection timeout:", err.message);
        if (coverText) coverText.innerText = "Timeout. Tap cover to open local mode!";
        renderLivePages(localFallbackArray);
    }
}

async function handleMemoryAddition() {
    const fileInput = document.getElementById('image-upload');
    const captionInput = document.getElementById('caption-input');
    const uploadBtn = document.getElementById('add-page-btn');

    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Please select an image file first!");
        return;
    }

    const targetFile = fileInput.files[0];
    uploadBtn.innerText = "Uploading... ⏳";
    uploadBtn.disabled = true;

    const localSaveFallback = () => {
        const reader = new FileReader();
        reader.onload = function(e) {
            // Local fallback uses a temporary fake ID
            localFallbackArray.push({
                id: Date.now(), 
                image_url: e.target.result,
                caption: captionInput.value.trim() || "A beautiful memory..."
            });
            localStorage.setItem('local_kbday_backup', JSON.stringify(localFallbackArray));
            
            fileInput.value = "";
            captionInput.value = "";
            uploadBtn.innerText = "Upload Memory Page";
            uploadBtn.disabled = false;
            
            renderLivePages(localFallbackArray);
            alert("Saved to local browser context!");
        };
        reader.readAsDataURL(targetFile);
    };

    if (!myDb) {
        localSaveFallback();
        return;
    }

    const fileExtension = targetFile.name.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

    try {
        const { data: storageData, error: storageError } = await myDb.storage
            .from('birthday-photos')
            .upload(uniqueFileName, targetFile);

        if (storageError) throw storageError;

        const { data: urlData } = myDb.storage
            .from('birthday-photos')
            .getPublicUrl(uniqueFileName);

        const publicImageUrl = urlData.publicUrl;

        const { error: dbError } = await myDb
            .from('kbday')
            .insert([{ image_url: publicImageUrl, caption: captionInput.value.trim() || "A beautiful memory..." }]);

        if (dbError) throw dbError;

        fileInput.value = "";
        captionInput.value = "";
        
        // Push the pointer back so the new page renders cleanly without breaking UI
        pointer = 1; 
        
        alert("Memory page saved cleanly to the cloud server! 🎉");
        await syncDatabaseMemories();

    } catch (err) {
        console.error("Cloud action blocked:", err.message);
        localSaveFallback();
    } finally {
        uploadBtn.innerText = "Upload Memory Page";
        uploadBtn.disabled = false;
    }
}

/* -------------------------------------------------------------
   D. DELETE LOGIC
   ------------------------------------------------------------- */
window.deleteMemory = async function(id, imageUrl) {
    if (!confirm("Are you sure you want to permanently delete this memory?")) {
        return;
    }

    if (!myDb) {
        // Handle local deletion fallback
        localFallbackArray = localFallbackArray.filter(item => item.id !== id);
        localStorage.setItem('local_kbday_backup', JSON.stringify(localFallbackArray));
        renderLivePages(localFallbackArray);
        return;
    }

    try {
        // 1. Delete the row from the Supabase Database
        const { error: dbError } = await myDb
            .from('kbday')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Try to clean up the image from the Storage bucket to save space
        try {
            const fileName = imageUrl.split('/').pop();
            await myDb.storage.from('birthday-photos').remove([fileName]);
        } catch(storageErr) {
            console.warn("Could not delete from storage bucket, but database row removed.");
        }

        pointer = 1; // Reset book view to front to prevent blank pages
        alert("Memory successfully deleted!");
        await syncDatabaseMemories();

    } catch (err) {
        console.error("Delete failed:", err.message);
        alert(`Deletion failed. Make sure you ran the SQL query in Supabase to allow DELETEs. Error: ${err.message}`);
    }
};

/* -------------------------------------------------------------
   E. PAGE RENDERING
   ------------------------------------------------------------- */
function renderLivePages(memoriesArray) {
    const bookContainer = document.getElementById('bi-fold-book');
    const endLeaf = document.getElementById('back-cover');
    const coverInstruction = document.getElementById('cover-instruction');

    const dynamicSheets = bookContainer.querySelectorAll('.page:not(.cover)');
    dynamicSheets.forEach(p => p.remove());

    memoriesArray.forEach((item, index) => {
        const sheetNumber = index + 1;
        const sheetElement = document.createElement('div');
        
        sheetElement.className = 'page';
        sheetElement.id = `dynamic-page-${sheetNumber}`;
        sheetElement.style.zIndex = (500 - sheetNumber).toString(); 
        
        // Notice the new delete button inside the HTML here
        sheetElement.innerHTML = `
            <div class="page-content">
                <button class="delete-btn" onclick="window.deleteMemory(${item.id}, '${item.image_url}')">✖</button>
                <div class="img-container">
                    <img src="${item.image_url}" alt="Memory ${sheetNumber}">
                </div>
                <div class="caption-area">
                    <p>"${item.caption}"</p>
                </div>
                <div class="page-num">Page ${sheetNumber}</div>
            </div>
        `;
        bookContainer.insertBefore(sheetElement, endLeaf);
    });

    updateBookElementsContext();
    endLeaf.style.zIndex = "0";

    resetBookStateStyleAnchors();
}

/* -------------------------------------------------------------
   F. UI VIEWPORT ANIMATION CONTROLLERS
   ------------------------------------------------------------- */
function stepForward() {
    if (pointer < bookElements.length - 1) {
        const targetSheet = bookElements[pointer];
        targetSheet.style.transform = 'rotateY(-180deg)';
        
        const cachedIndex = pointer;
        setTimeout(() => { targetSheet.style.zIndex = cachedIndex.toString(); }, 150);
        pointer++;
    }
}

function stepBackward() {
    if (pointer > 0) {
        pointer--;
        const targetSheet = bookElements[pointer];
        targetSheet.style.transform = 'rotateY(0deg)';
        targetSheet.style.zIndex = (500 - pointer).toString();
    }
}

function resetBookStateStyleAnchors() {
    bookElements.forEach((element, i) => {
        if (i < pointer) {
            element.style.transform = 'rotateY(-180deg)';
            element.style.zIndex = i.toString();
        } else {
            element.style.transform = 'rotateY(0deg)';
            element.style.zIndex = (500 - i).toString();
        }
    });
}
