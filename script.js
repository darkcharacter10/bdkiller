/* -------------------------------------------------------------
   A. SUPABASE SECURE INIT
   ------------------------------------------------------------- */
const SUPABASE_URL = 'https://shgccltzjmeeeycvqyiu.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_I3lVPAHunarUWcSfMfBZXw_qSttvTki';

let supabase = null;
let pointer = 0;           
let bookElements = []; 
let localFallbackArray = []; 

try {
    if (typeof window.supabase !== 'undefined' && SUPABASE_URL) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch(e) {
    console.error("Supabase client script loading error:", e);
}

// Bind navigation elements IMMEDIATELY so layout stays completely responsive
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('prev-btn').onclick = stepBackward;
    document.getElementById('next-btn').onclick = stepForward;
    document.getElementById('add-page-btn').onclick = handleMemoryAddition;
    
    const coverSheet = document.getElementById('page-0');
    if (coverSheet) {
        coverSheet.onclick = stepForward;
    }

    updateBookViewContext();

    // Defer network connection safely away from interface thread loop execution
    setTimeout(() => {
        syncDatabaseMemories();
    }, 100);
});

function updateBookViewContext() {
    bookElements = document.querySelectorAll('.page');
}

/* -------------------------------------------------------------
   B. CLOUD DATA MANAGEMENT
   ------------------------------------------------------------- */
async function syncDatabaseMemories() {
    const cached = localStorage.getItem('local_kbday_backup');
    localFallbackArray = cached ? JSON.parse(cached) : [];

    if (!supabase) {
        renderLivePages(localFallbackArray);
        return;
    }

    try {
        const { data: memories, error } = await supabase
            .from('kbday')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) {
            console.error("Database tracking link failed. Check your SQL Editor schema settings:", error.message);
            renderLivePages(localFallbackArray);
            return;
        }

        renderLivePages(memories && memories.length > 0 ? memories : localFallbackArray);
    } catch (err) {
        console.warn("Server timeout. Defaulting gracefully inside sandbox mode components:", err.message);
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
    uploadBtn.innerText = "Uploading to Server... ⏳";
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
            alert("Uploaded locally! (Run the table configuration script in your new dashboard if you want it saved globally)");
        };
        reader.readAsDataURL(targetFile);
    };

    if (!supabase) {
        localSaveFallback();
        return;
    }

    const fileExtension = targetFile.name.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

    try {
        const { data: storageData, error: storageError } = await supabase.storage
            .from('birthday-photos')
            .upload(uniqueFileName, targetFile);

        if (storageError) throw storageError;

        const { data: urlData } = supabase.storage
            .from('birthday-photos')
            .getPublicUrl(uniqueFileName);

        const publicImageUrl = urlData.publicUrl;

        const { error: dbError } = await supabase
            .from('kbday')
            .insert([{ image_url: publicImageUrl, caption: captionInput.value.trim() || "A beautiful memory..." }]);

        if (dbError) throw dbError;

        fileInput.value = "";
        captionInput.value = "";
        alert("Memory saved securely on Supabase servers! 🎉");
        await syncDatabaseMemories();

    } catch (err) {
        console.error("Upload rejected by cloud server:", err.message);
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

    updateBookViewContext();
    endLeaf.style.zIndex = "0";

    if (memoriesArray.length > 0) {
        coverInstruction.innerText = "Click 'Next Page' or click the cover page layout elements below to flip inside";
    } else {
        coverInstruction.innerText = "Use the panel on the bottom right to add memories!";
    }

    resetBookStateStyleAnchors();
}

/* -------------------------------------------------------------
   C. 3D VIEW ANIMATIONS
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