// ==========================================
// COMMUNE - GAME ENGINE
// ==========================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 16;

// --- FARBPALETTE ---
const C_FOG = '#080808'; 
const C_LAND = '#2e4c23';
const C_WOOD = '#4a3018'; // Dunkelbraun für Wald
const C_WATER = '#1ca3ec'; // Blau für Fluss
const C_STONE = '#6e7374'; // Grau für Berg
const C_RUIN = '#4b0082'; // Lila für Ruine
const C_ROAD = '#c2b280'; // Pixelige Strassen

// --- DOM ELEMENTE ---
const uiInd = document.getElementById('needs-indicator');
const uiNeedsPanel = document.getElementById('needs-panel');
const uiMenu = document.getElementById('main-menu');
const iosDock = document.getElementById('ios-pixel-dock');

// Dock Buttons
const btnExplore = document.getElementById('btn-explore');
const btnBuild = document.getElementById('btn-build');
const btnMenuOpen = document.getElementById('btn-menu-open');

// Panel Elemente
const barSpace = document.getElementById('bar-space');
const barResources = document.getElementById('bar-resources');
const barConnection = document.getElementById('bar-connection');
const textHint = document.getElementById('needs-hint');

// --- SPIELSTATUS ---
let camera = { x: 0, y: 0 };
let isDragging = false, hasDragged = false;
let dragStart = { x: 0, y: 0 }, cameraStart = { x: 0, y: 0 };
let currentMode = 'EXPLORE'; // 'EXPLORE' oder 'BUILD'

// Welt-Daten
let world = new Map();
let buildings = new Map();

// --- INITIALISIERUNG ---
function initGame() {
    const saved = localStorage.getItem('commune_save');
    if (saved) {
        loadGameData(JSON.parse(saved));
        uiMenu.classList.add('hidden');
        iosDock.classList.remove('hidden');
        uiInd.classList.remove('hidden');
    } else {
        // Neues Spiel: 3x3 Startgebiet
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                world.set(`${x},${y}`, { type: 'land', color: C_LAND });
            }
        }
        buildings.set(`0,0`, { genes: ['GEMEINSCHAFT'] });
    }
    resizeCanvas();
    updateNeeds();
}

function saveGame() {
    const data = {
        world: Array.from(world.entries()),
        buildings: Array.from(buildings.entries())
    };
    localStorage.setItem('commune_save', JSON.stringify(data));
}

function loadGameData(data) {
    world = new Map(data.world);
    buildings = new Map(data.buildings);
}

// --- LOGIK: HILFSFUNKTIONEN ---
function getGridCoords(screenX, screenY) {
    return {
        x: Math.floor((screenX - camera.x) / TILE_SIZE),
        y: Math.floor((screenY - camera.y) / TILE_SIZE)
    };
}

function getNeighbors(x, y, mapToCheck) {
    return [
        { k: `${x-1},${y}`, v: mapToCheck.get(`${x-1},${y}`), x: x-1, y: y },
        { k: `${x+1},${y}`, v: mapToCheck.get(`${x+1},${y}`), x: x+1, y: y },
        { k: `${x},${y-1}`, v: mapToCheck.get(`${x},${y-1}`), x: x, y: y-1 },
        { k: `${x},${y+1}`, v: mapToCheck.get(`${x},${y+1}`), x: x, y: y+1 }
    ];
}

function isAdjacent(x, y, mapToCheck) {
    return getNeighbors(x, y, mapToCheck).some(n => n.v !== undefined);
}

// --- LOGIK: ERKUNDEN & GENERIEREN ---
function generateResource(x, y) {
    const dist = Math.abs(x) + Math.abs(y);
    const rand = Math.random();
    
    // Je weiter weg, desto höher die Chance auf seltene Dinge
    if (rand < 0.02 + (dist * 0.005)) return { type: 'ruin', color: C_RUIN, gene: 'WISSEN' };
    if (rand < 0.15 + (dist * 0.01)) return { type: 'mountain', color: C_STONE, gene: 'STEIN' };
    if (rand < 0.25 + (dist * 0.01)) return { type: 'forest', color: C_WOOD, gene: 'HOLZ' };
    if (rand < 0.35) return { type: 'river', color: C_WATER, gene: 'WASSER' };
    return { type: 'land', color: C_LAND };
}

// --- LOGIK: AUTOMATISCHES WACHSTUM (DIE KERN-REGEL) ---
function processTurn() {
    // Wenn 3 Gebäude verbunden sind, bilden sie einen Kern und können automatisch wachsen
    let newBuildings = [];

    for (let [key, bldg] of buildings) {
        const [x, y] = key.split(',').map(Number);
        const bldgNeighbors = getNeighbors(x, y, buildings).filter(n => n.v !== undefined);
        
        // Ist es ein Kern? (Hat mind. 2 verbundene Gebäude, also 3 insgesamt)
        if (bldgNeighbors.length >= 2) {
            // 15% Chance pro Zug, dass dieser Kern wächst
            if (Math.random() < 0.15) {
                const emptyAdjacentLands = getNeighbors(x, y, world).filter(n => 
                    n.v !== undefined && 
                    n.v.type === 'land' && 
                    !buildings.has(n.k)
                );

                if (emptyAdjacentLands.length > 0) {
                    // Wähle zufälliges freies Land
                    const target = emptyAdjacentLands[Math.floor(Math.random() * emptyAdjacentLands.length)];
                    newBuildings.push({ key: target.k, genes: [...bldg.genes] }); // Erbt Gene
                }
            }
        }
    }

    // Neue Gebäude platzieren
    newBuildings.forEach(nb => {
        if (!buildings.has(nb.key)) {
            buildings.set(nb.key, { genes: nb.genes });
        }
    });

    updateNeeds();
    saveGame();
}

function handleInteraction(screenX, screenY) {
    const coords = getGridCoords(screenX, screenY);
    const key = `${coords.x},${coords.y}`;

    if (currentMode === 'EXPLORE') {
        if (!world.has(key) && isAdjacent(coords.x, coords.y, world)) {
            world.set(key, generateResource(coords.x, coords.y));
            processTurn(); // Jeder Klick ist ein Zug
            draw();
        }
    } else if (currentMode === 'BUILD') {
        if (world.has(key) && !buildings.has(key) && world.get(key).type === 'land' && isAdjacent(coords.x, coords.y, buildings)) {
            
            let newGenes = [];
            const worldNeighbors = getNeighbors(coords.x, coords.y, world);
            
            worldNeighbors.forEach(n => {
                if (n.v && n.v.gene && !newGenes.includes(n.v.gene)) newGenes.push(n.v.gene);
            });

            if (newGenes.length === 0) newGenes.push('ERDE'); // Standard-Gen

            buildings.set(key, { genes: newGenes });
            processTurn(); // Jeder Klick ist ein Zug
            draw();
        }
    }
}

// --- RENDERING ---
function drawBuilding(x, y, bldg) {
    const screenX = camera.x + (x * TILE_SIZE);
    const screenY = camera.y + (y * TILE_SIZE);

    let baseColor = '#aa8866'; // Standard (Erde)
    if (bldg.genes.includes('HOLZ')) baseColor = '#7a4a28';
    if (bldg.genes.includes('STEIN')) baseColor = '#888c8d';
    if (bldg.genes.includes('WASSER')) baseColor = '#4a8f9c';
    if (bldg.genes.includes('WISSEN')) baseColor = '#7b5b9e';

    // Basis
    ctx.fillStyle = baseColor;
    ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Pixel-Details (Dächer/Fenster) via Seed
    const seed = Math.abs(x * 31 + y * 17) % 5; 
    
    ctx.fillStyle = '#111'; // Fenster/Schatten
    if (seed === 0) {
        ctx.fillRect(screenX + 4, screenY + 4, 3, 3);
        ctx.fillRect(screenX + 9, screenY + 4, 3, 3);
    } else if (seed === 1) {
        ctx.fillRect(screenX + 6, screenY + 8, 4, 4);
    } else if (seed === 2) {
        ctx.fillStyle = '#8b2500'; // Rotes Dach
        ctx.fillRect(screenX + 2, screenY + 2, 12, 4);
    } else if (seed === 3) {
        ctx.fillStyle = '#d4af37'; // Goldenes Element (vllt. Wissen/Handwerk)
        ctx.fillRect(screenX + 6, screenY + 2, 4, 4);
    }
}

function drawConnections() {
    ctx.fillStyle = C_ROAD;
    for (let [key, bldg] of buildings) {
        const [x, y] = key.split(',').map(Number);
        const screenX = camera.x + (x * TILE_SIZE);
        const screenY = camera.y + (y * TILE_SIZE);

        if (buildings.has(`${x+1},${y}`)) ctx.fillRect(screenX + 10, screenY + 6, 12, 4);
        if (buildings.has(`${x},${y+1}`)) ctx.fillRect(screenX + 6, screenY + 10, 4, 12);
    }
}

function draw() {
    ctx.fillStyle = C_FOG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startCol = Math.floor((-camera.x) / TILE_SIZE);
    const endCol = startCol + Math.floor(canvas.width / TILE_SIZE) + 1;
    const startRow = Math.floor((-camera.y) / TILE_SIZE);
    const endRow = startRow + Math.floor(canvas.height / TILE_SIZE) + 1;

    // Terrain
    for (let x = startCol; x <= endCol; x++) {
        for (let y = startRow; y <= endRow; y++) {
            const key = `${x},${y}`;
            if (world.has(key)) {
                const sx = camera.x + (x * TILE_SIZE);
                const sy = camera.y + (y * TILE_SIZE);
                ctx.fillStyle = world.get(key).color;
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                
                // Leichter Grid-Effekt durch 1px Overlay
                ctx.fillStyle = 'rgba(0,0,0,0.1)';
                ctx.fillRect(sx + TILE_SIZE - 1, sy, 1, TILE_SIZE);
                ctx.fillRect(sx, sy + TILE_SIZE - 1, TILE_SIZE, 1);
            }
        }
    }

    drawConnections();

    // Gebäude
    for (let x = startCol; x <= endCol; x++) {
        for (let y = startRow; y <= endRow; y++) {
            const key = `${x},${y}`;
            if (buildings.has(key)) drawBuilding(x, y, buildings.get(key));
        }
    }
}

// --- BEDÜRFNISSE ---
function updateNeeds() {
    const bCount = buildings.size;
    let worldCount = world.size;
    
    // Einfache Metriken
    let spaceScore = Math.min(100, Math.floor((worldCount / (bCount * 2)) * 100));
    let resourceScore = Math.min(100, Math.floor((worldCount / (bCount * 1.5)) * 100));
    let connScore = 100; // Für den Moment immer gut verbunden durch die Straßenregel
    
    // Balken anpassen
    barSpace.style.width = `${spaceScore}%`;
    barResources.style.width = `${resourceScore}%`;
    barConnection.style.width = `${connScore}%`;

    let totalScore = (spaceScore + resourceScore + connScore) / 3;

    uiInd.className = '';
    if (totalScore >= 90) { uiInd.classList.add('status-100'); textHint.innerText = "Alles im Gleichgewicht."; }
    else if (totalScore >= 70) { uiInd.classList.add('status-75'); textHint.innerText = "Gutes Wachstum."; }
    else if (totalScore >= 50) { uiInd.classList.add('status-50'); textHint.innerText = "Mehr Land erkunden."; }
    else if (totalScore >= 25) { uiInd.classList.add('status-25'); textHint.innerText = "Platz wird eng!"; }
    else { uiInd.classList.add('status-critical'); textHint.innerText = "Ressourcen kritisch!"; }
}

// --- EVENT LISTENERS ---
window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (camera.x === 0 && camera.y === 0) {
        camera.x = Math.floor(canvas.width / 2);
        camera.y = Math.floor(canvas.height / 2);
    }
    draw();
}

// UI Buttons (Menü)
document.getElementById('btn-new-world').addEventListener('click', () => {
    uiMenu.classList.add('hidden');
    iosDock.classList.remove('hidden');
    uiInd.classList.remove('hidden');
    localStorage.removeItem('commune_save');
    world.clear(); buildings.clear();
    initGame();
});

document.getElementById('btn-load-world').addEventListener('click', () => {
    if (localStorage.getItem('commune_save')) {
        initGame();
    } else {
        alert("Keine Welt gespeichert!");
    }
});

// UI Buttons (Dock)
function updateDock(activeBtn) {
    document.querySelectorAll('.dock-btn').forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

btnExplore.addEventListener('click', () => { currentMode = 'EXPLORE'; updateDock(btnExplore); });
btnBuild.addEventListener('click', () => { currentMode = 'BUILD'; updateDock(btnBuild); });
btnMenuOpen.addEventListener('click', () => { 
    uiMenu.classList.remove('hidden'); 
    iosDock.classList.add('hidden');
    uiInd.classList.add('hidden');
});

// Indikator Panel
uiInd.addEventListener('click', () => uiNeedsPanel.classList.remove('hidden'));
document.getElementById('btn-close-needs').addEventListener('click', () => uiNeedsPanel.classList.add('hidden'));

// Steuerung (Maus & Touch)
function startDrag(x, y) { isDragging = true; hasDragged = false; dragStart = {x, y}; cameraStart = {x: camera.x, y: camera.y}; }
function doDrag(x, y) {
    if (!isDragging) return;
    const dx = x - dragStart.x, dy = y - dragStart.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDragged = true;
    camera.x = cameraStart.x + dx; camera.y = cameraStart.y + dy;
    draw();
}
function endDrag(x, y) {
    isDragging = false;
    if (!hasDragged) handleInteraction(x, y);
}

canvas.addEventListener('mousedown', e => startDrag(e.clientX, e.clientY));
window.addEventListener('mousemove', e => doDrag(e.clientX, e.clientY));
window.addEventListener('mouseup', e => { const rect = canvas.getBoundingClientRect(); endDrag(e.clientX - rect.left, e.clientY - rect.top); });

canvas.addEventListener('touchstart', e => startDrag(e.touches[0].clientX, e.touches[0].clientY));
window.addEventListener('touchmove', e => doDrag(e.touches[0].clientX, e.touches[0].clientY), { passive: false });
window.addEventListener('touchend', e => {
    if (e.changedTouches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        endDrag(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top);
    }
});

// START
initGame();
