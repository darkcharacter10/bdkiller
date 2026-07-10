/* -------------------------------------------------------------
   A. SUPABASE CLIENT SETTINGS CONFIGURATION
   ------------------------------------------------------------- */
const SUPABASE_URL = 'https://shgccltzjmeeeycvqyiu.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_I3lVPAHunarUWcSfMfBZXw_qSttvTki';

// CHANGED: Renamed to myDb so it never fights with the Supabase CDN library
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

// Click event routing helper function
function assignClickAction(id, actionFunction) {
    const targetElement = document.getElementById(id);
    if (targetElement) {
        targetElement.onclick = actionFunction;
    }
}

// This runs instantly when the page structure mounts
document.addEventListener('DOMContentLoaded', () => {
    // 1. Instantly power the page-turning buttons
    assignClickAction('prev-btn', stepBackward);
    assignClickAction('next-btn', stepForward);
    assignClickAction('add-page-btn', handleMemoryAddition);
    
    const coverSheet = document.getElementById('page-0');
    if (coverSheet) {
        coverSheet.onclick = stepForward;
    }

    updateBookElementsContext();

    // 2. Change the cover text to confirm the script is alive
    const coverText = document.getElementById('cover-instruction');
    if (coverText) {
        coverText.innerText = "Syncing with cloud memory lane...";
    }

    // 3. Defer the database query so it can never lock the buttons
    setTimeout(() => {
        syncDatabaseMemories();
    }, 100);
});

function updateBookElementsContext() {
    bookElements = document.querySelectorAll('.page');
}

/* -------------------------------------------------------------
   B. SERVER DATA STORAGE SYNC MANAGEMENT
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
            renderLivePages(memories);
        } else {
            if (coverText) coverText.innerText = "Book empty! Use bottom-right panel to add a page.";
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
            localFallbackArray.push({
                image_url: e.target.result,
                caption: captionInput.value.trim() || "A beautiful memory..."
            });
            localStorage.setItem('local_kbday_backup', JSON.stringify(localFallbackArray));
            
            fileInput.value = "";
            captionInput.value = "";
            uploadBtn.innerText = "Upload Memory Page";
            uploadBtn.disabled = false;
            
            renderLivePages(localFallbackArray);
            alert("Saved to local browser context! (Check your Supabase storage rules for shared cloud mode)");
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
        
        sheetElement.innerHTML = `
            <div class="page-content">
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

    if (memoriesArray.length > 0) {
        if (coverInstruction) coverInstruction.innerText = "Click 'Next Page' or click the cover to flip inside!";
    } else {
        if (coverInstruction) coverInstruction.innerText = "Use the loader panel on the right to add photos!";
    }

    resetBookStateStyleAnchors();
}

/* -------------------------------------------------------------
   C. UI VIEWPORT ANIMATION CONTROLLERS
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
