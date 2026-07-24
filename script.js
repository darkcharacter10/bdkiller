/* -------------------------------------------------------------
   A. SUPABASE CLIENT SETTINGS CONFIGURATION
   ------------------------------------------------------------- */
const SUPABASE_URL = 'https://shgccltzjmeeeycvqyiu.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_I3lVPAHunarUWcSfMfBZXw_qSttvTki';

let myDb = null;
let pointer = 0;           
let bookElements = []; 

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
    
    const coverSheet = document.getElementById('page-0');
    if (coverSheet) {
        coverSheet.onclick = stepForward;
    }

    updateBookElementsContext();
    
    setTimeout(() => {
        syncDatabaseMemories();
    }, 100);
});

function updateBookElementsContext() {
    bookElements = document.querySelectorAll('.page');
}

/* -------------------------------------------------------------
   B. GREETING POPUP LOGIC (If active)
   ------------------------------------------------------------- */
window.executeOpenSequence = function() {
    const overlay = document.getElementById('greeting-overlay');
    if(overlay) overlay.style.display = 'none';
    
    const navControls = document.getElementById('navigation-controls');
    if(navControls) navControls.style.display = 'flex';
    
    stepForward();
};

/* -------------------------------------------------------------
   C. SERVER DATA STORAGE SYNC (View-Only Mode)
   ------------------------------------------------------------- */
async function syncDatabaseMemories() {
    const coverText = document.getElementById('cover-instruction');

    if (!myDb) {
        if (coverText) coverText.innerText = "Database connection offline.";
        return;
    }

    try {
        const { data: memories, error } = await myDb
            .from('kbday')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) {
            console.error("Server query failed:", error.message);
            if (coverText) coverText.innerText = "Server error. Try again later.";
            return;
        }

        if (memories && memories.length > 0) {
            if (coverText) coverText.innerText = "Click the cover to open!";
            renderLivePages(memories);
        } else {
            if (coverText) coverText.innerText = "No memories found.";
        }
    } catch (err) {
        console.warn("Connection timeout:", err.message);
        if (coverText) coverText.innerText = "Timeout loading memories.";
    }
}

/* -------------------------------------------------------------
   D. PAGE RENDERING (Delete Button Removed)
   ------------------------------------------------------------- */
function renderLivePages(memoriesArray) {
    const bookContainer = document.getElementById('bi-fold-book');
    const endLeaf = document.getElementById('back-cover');

    const dynamicSheets = bookContainer.querySelectorAll('.page:not(.cover)');
    dynamicSheets.forEach(p => p.remove());

    memoriesArray.forEach((item, index) => {
        const sheetNumber = index + 1;
        const sheetElement = document.createElement('div');
        
        sheetElement.className = 'page';
        sheetElement.id = `dynamic-page-${sheetNumber}`;
        sheetElement.style.zIndex = (500 - sheetNumber).toString(); 
        
        // Notice: The <button class="delete-btn"> has been entirely removed
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
    resetBookStateStyleAnchors();
}

/* -------------------------------------------------------------
   E. UI VIEWPORT ANIMATION CONTROLLERS
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
