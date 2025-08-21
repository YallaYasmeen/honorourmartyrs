function autoScroll() {
  // Add a safety check to ensure the element exists
  const scrollContainer = elements.content;
  if (!scrollContainer) {
    console.error("Scroll container element not found.");
    stopAutoScroll(); // Stop the process gracefully
    return;
  }

  state.scrollPosition = scrollContainer.scrollTop;
  // The rest of your auto-scroll logic...
  const scrollSpeed = 0.4;
  const isAtEnd =
    scrollContainer.scrollTop + scrollContainer.clientHeight >=
    scrollContainer.scrollHeight;

  if (
    scrollContainer.scrollTop + scrollContainer.clientHeight >=
    scrollContainer.scrollHeight - 25
  ) {
    // If we are very close to the end, consider it as "at end"

    // console.log('Reached the end of the scroll container');
    updateVisibleItems();
  }

  if (!state.autoScrolling) {
    return;
  }

  if (!isAtEnd) {
    scrollContainer.scrollTop += scrollSpeed;
    state.animationFrameId = requestAnimationFrame(autoScroll);
  } else {
    stopAutoScroll();
  }
}

function startAutoScroll() {
  if (state.totalRecords > 0) {
    // Only start if data is loaded
    state.autoScrolling = true;
    autoScroll();
  }
}

function stopAutoScroll() {
  state.autoScrolling = false;
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
  }
}

// Configuration
const config = {
  chunkSize: 1000,
  bufferSize: 100,
  recordHeight: 110,
  jsonUrl: "killed-in-gaza.json",
};

// State management
const state = {
  allData: [],
  visibleData: [],
  totalRecords: 0,
  scrollPosition: 0,
  loading: false,
  worker: null,
};

// DOM elements
const elements = {
  listContainer: document.getElementById("list-container"),

  scroller: document.getElementById("scroller"),
  content: document.getElementById("content"),
  loadProgress: document.getElementById("loadProgress"),
  progress_container: document.getElementById("progress_container"),
  loadStatus: document.getElementById("loadStatus"),
};

// Initialize Web Worker for background processing
function initWorker() {
  if (window.Worker) {
    const workerCode = `
                    onmessage = function(e) {
                        const { action, data, chunkSize } = e.data;
                        
                        if (action === 'processChunk') {
                            // Process data chunk
                            const processed = data.map(item => ({
                                id: item.id,
                                en_name: item.en_name,
                                name: item.name,
                                age: calculateAge(item.dob),
                                dob: formatDate(item.dob),
                                initials: getInitials(item.en_name),
                                source: item.source
                            }));
                            
                            postMessage({ processed });
                        }
                        
                        function calculateAge(dobString) {
                            const today = new Date();
                            const birthDate = new Date(dobString);
                            let age = today.getFullYear() - birthDate.getFullYear();
                            const m = today.getMonth() - birthDate.getMonth();
                            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                                age--;
                            }
                            return age;
                        }
                        
                        function formatDate(dateString) {
                            const date = new Date(dateString);
                            return date.toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            });
                        }
                        
                        function getInitials(name) {
                            const names = name.split(' ');
                            return names[0].charAt(0) + (names.length > 1 ? names[names.length - 1].charAt(0) : '');
                        }
                    };
                `;

    const blob = new Blob([workerCode], { type: "application/javascript" });
    state.worker = new Worker(URL.createObjectURL(blob));

    state.worker.onmessage = function (e) {
      if (e.data.processed) {
        state.allData = state.allData.concat(e.data.processed);
        updateProgress();
        processNextChunk();
      }
    };
  }
}

state.firstChunkReceived = false;

async function loadData() {
  state.loading = true;
  elements.loadStatus.textContent = "Loading data...";

  try {
    const response = await fetch(config.jsonUrl);
    if (!response.ok) {
      elements.loadStatus.textContent = "Error loading data file";
      return;
    }

    const jsonText = await response.text();

    const data = JSON.parse(jsonText);
    state.totalRecords = data.length;

    let processedCount = 0;
    const processChunk = (chunk) => {
      return new Promise((resolve) => {
        state.worker.postMessage({ action: "processChunk", data: chunk });

        // Handle the worker's response
        state.worker.onmessage = (e) => {
          if (e.data.processed) {
            state.allData = state.allData.concat(e.data.processed);
            processedCount += e.data.processed.length;
            updateProgress(processedCount);
            resolve();
          }
        };
      });
    };

    // Asynchronously process all chunks
    for (let i = 0; i < data.length; i += config.chunkSize) {
      const chunk = data.slice(i, i + config.chunkSize);
      await processChunk(chunk);
    }

    // All data loaded and processed
    state.loading = false;
    elements.loadStatus.style.display = "none";
    elements.progress_container.style.display = "none";
    // console.log('All data loaded:', state.allData.length);

    initVirtualScroll();
    startAutoScroll();
  } catch (e) {
    console.error("Error fetching or parsing JSON:", e);
    elements.loadStatus.textContent = "Error parsing data";
  }
}

// Update loading progress function
function updateProgress(processedCount) {
  const progress = (processedCount / (state.totalRecords || 1)) * 100;
  elements.loadProgress.style.width = `${progress}%`;

  updateMemoryUsage();
}

function processDataChunk(chunk) {
  if (state.worker) {
    state.worker.postMessage({ action: "processChunk", data: chunk });
  } else {
    const processed = chunk.map((item) => ({
      id: item.id,
      en_name: item.en_name,
      name: item.name,
      age: calculateAge(item.dob),
      dob: formatDate(item.dob),
      initials: getInitials(item.en_name),
      source: item.source,
    }));
    state.allData = state.allData.concat(processed);
    updateProgress();
  }
}
// Process next chunk if available
function processNextChunk() {
  if (state.loading && state.allData.length < state.totalRecords) {
    setTimeout(() => {
      const start = state.allData.length;
      const end = Math.min(start + config.chunkSize, state.totalRecords);
      const chunk = state.rawData.slice(start, end);
      processDataChunk(chunk);
    }, 0);
  }
}

// Update loading progress
function updateProgress() {
  const progress = (state.allData.length / (state.totalRecords || 1)) * 100;
  elements.loadProgress.style.width = `${progress}%`;
  // elements.loadStatus.textContent = `Loading... ${state.allData.length.toLocaleString()} of ${state.totalRecords.toLocaleString()} records`;

  // Update memory usage
  updateMemoryUsage();
}

// Calculate memory usage
function updateMemoryUsage() {
  // Rough estimation of memory usage
  const bytesPerRecord = 200; // Approximate bytes per record
  const totalBytes = state.allData.length * bytesPerRecord;
  const mbUsed = (totalBytes / (1024 * 1024)).toFixed(1);
  // elements.memoryUsage.textContent = `${mbUsed} MB`;
}

// Initialize virtual scrolling
function initVirtualScroll() {
  // Set total content height
  const totalHeight = state.allData.length * config.recordHeight;
  elements.content.style.height = `${totalHeight}px`;

  // Initial render
  updateVisibleItems();

  // Add scroll listener
  elements.scroller.addEventListener("scroll", () => {
    state.scrollPosition = elements.scroller.scrollTop;
    updateVisibleItems();
  });
}

// Update visible items based on scroll position
function updateVisibleItems() {
  if (state.allData.length === 0) return;
  // console.log('Updating visible items' + state.scrollPosition);
  const scrollTop = state.scrollPosition;
  const viewportHeight = elements.scroller.clientHeight;

  // Calculate visible range
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / config.recordHeight) - config.bufferSize
  );
  const endIndex = Math.min(
    state.allData.length - 1,
    Math.floor((scrollTop + viewportHeight) / config.recordHeight) +
      config.bufferSize
  );

  // Update visible records
  state.visibleData = state.allData.slice(startIndex, endIndex + 1);
  // elements.visibleRecords.textContent = state.visibleData.length.toLocaleString();

  // Render visible items
  renderItems(startIndex);
}

// Render visible items
function renderItems(startIndex) {
  let html = "";

  state.visibleData.forEach((item, i) => {
    const top = (startIndex + i) * config.recordHeight;

    html += `
                    <div class="person-card" style="position: absolute; top: ${top}px; width: 100%;">
                        
                        <div class="person-details">
                        <div class="names">
                        <div class="en-name" title="${item.en_name}">${item.en_name}</div>
                            <div class="ar-name" title="${item.name}">${item.name}</div>
                        </div>
                            
                            <div class="info-row">
                                <span><span class="info-label">Age:</span> ${item.age} years</span>
                                <span><span class="info-label">DOB:</span> ${item.dob}</span>
                            </div>

                        </div>
                    </div>
                `;
  });

  elements.content.innerHTML = html;
}

// Helper functions
function calculateAge(dobString) {
  const today = new Date();
  const birthDate = new Date(dobString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getInitials(name) {
  const names = name.split(" ");
  return (
    names[0].charAt(0) +
    (names.length > 1 ? names[names.length - 1].charAt(0) : "")
  );
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initWorker();
  loadData();
  setupScrollControls();
});
function setupScrollControls() {
  const scroller = elements.scroller;
  // Pause on mouse down or touch start
  scroller.addEventListener("mousedown", stopAutoScroll);
  scroller.addEventListener("touchstart", stopAutoScroll);
  // Resume on mouse up or touch end
  scroller.addEventListener("mouseup", startAutoScroll);
  scroller.addEventListener("touchend", startAutoScroll);
  scroller.addEventListener("mouseleave", startAutoScroll); // Optional: resume if mouse leaves the area
}
