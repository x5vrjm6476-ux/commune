// --- BASIS-SETUP ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 16;

// Farben für Nebel und Ressourcen
const C_FOG = '#000000';
const C_LAND = '#2e4c23';
const C_WOOD = '#5c4033'; // Braun
const C_WATER = '#1ca3ec'; // Blau
const C_STONE = '#888c8d'; // Grau
const C_ROAD = '#c2b280'; // Pixelige Strassen 

// UI Elemente
const uiInd = document.getElementById('needs-indicator');
const uiNeedsPanel = document.getElementById('needs-panel');
const uiMenu = document.getElementById('main-menu');
const uiActionBar = document.getElementById('action-bar');
const btnExplore = document.getElementById('btn-explore');
const btnBuild = document.getElementById('btn-build');

// --- SPIELSTATUS ---
let camera = { x: 0, y: 0 };
let isDragging = false, hasDragged = false;
let dragStart = { x: 0, y: 0 }, cameraStart = { x: 0, y: 0 };
let currentMode = 'EXPLORE'; // 'EXPLORE' oder 'BUILD'

// Die Welt: Key ist "x,y", Value ist das Tile-Objekt
let world = new Map();
let buildings = new Map();

// --- INITIALISIERUNG & SPEICHERN ---
function initGame() {
    const saved = localStorage.getItem('commune_save');
    if (saved) {
        loadGameData(JSON.parse(saved));
        uiMenu.classList.add('hidden');
        uiActionBar.classList.remove('hidden');
    } else {
        // Neues Spiel: 3x3 Startgebiet
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                world.set(`${x},${y}`, { type: 'land', color: C_LAND });
            }
        }
        // Erstes Gebäude in der Mitte
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

// --- LOGIK: ERKUNDEN & BAUEN ---
function getGridCoords(screenX, screenY) {
    return {
        x: Math.floor((screenX - camera.x) / TILE_SIZE),
        y: Math.floor((screenY - camera.y) / TILE_SIZE)
    };
}

function isAdjacent(x, y, mapToCheck) {
    return mapToCheck.has(`${x-1},${y}`) || mapToCheck.has(`${x+1},${y}`) || 
           mapToCheck.has(`${x},${y-1}`) || mapToCheck.has(`${x},${y+1}`);
}

// Generiert zufällige Ressourcen basierend auf Distanz zum Zentrum
function generateResource(x, y) {
    const dist = Math.abs(x) + Math.abs(y);
    const rand = Math.random();
    
    if (rand < 0.1 + (dist * 0.01)) return { type: 'forest', color: C_WOOD, gene: 'HOLZ' };
    if (rand < 0.2 + (dist * 0.01)) return { type: 'mountain', color: C_STONE, gene: 'STEIN' };
    if (rand < 0.25) return { type: 'river', color: C_WATER, gene: 'WASSER' };
    return { type: 'land', color: C_LAND };
}

function handleInteraction(screenX, screenY) {
    const coords = getGridCoords(screenX, screenY);
    const key = `${coords.x},${coords.y}`;

    if (currentMode === 'EXPLORE') {
        if (!world.has(key) && isAdjacent(coords.x, coords.y, world)) {
            world.set(key, generateResource(coords.x, coords.y));
            saveGame();
            draw();
        }
    } else if (currentMode === 'BUILD') {
        // Regel 1: Bauen braucht Kontext (angrenzendes Gebäude) 
        if (world.has(key) && !buildings.has(key) && world.get(key).type === 'land' && isAdjacent(coords.x, coords.y, buildings)) {
            
            // Regel 2: Ressourcen in der Nähe prüfen für Gene 
            let newGenes = [];
            const neighbors = [
                world.get(`${coords.x-1},${coords.y}`), world.get(`${coords.x+1},${coords.y}`),
                world.get(`${coords.x},${coords.y-1}`), world.get(`${coords.x},${coords.y+1}`)
            ];
            neighbors.forEach(n => {
                if (n && n.gene && !newGenes.includes(n.gene)) newGenes.push(n.gene);
            });

            if (newGenes.length === 0) newGenes.push('ERDE'); // Standard-Gen

            buildings.set(key, { genes: newGenes });
            saveGame();
            updateNeeds();
            draw();
        }
    }
}

// --- PROZEDURALES ZEICHNEN ---
function drawBuilding(x, y, bldg) {
    const screenX = camera.x + (x * TILE_SIZE);
    const screenY = camera.y + (y * TILE_SIZE);

    // Basis-Farbe anhand der Gene mischen
    let baseColor = '#aa8866'; // Standard
    if (bldg.genes.includes('HOLZ')) baseColor = '#8b5a2b';
    if (bldg.genes.includes('STEIN')) baseColor = '#666666';

    // Fundament (16x16)
    ctx.fillStyle = baseColor;
    ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Algorithmus für Pixel-Deko (Dächer/Fenster)
    // Wir nutzen x+y als einfachen deterministischen Seed
    const seed = Math.abs(x * 31 + y * 17) % 4; 
    
    ctx.fillStyle = '#111'; // Fenster
    if (seed === 0) {
        ctx.fillRect(screenX + 4, screenY + 4, 3, 3);
        ctx.fillRect(screenX + 9, screenY + 4, 3, 3);
    } else if (seed === 1) {
        ctx.fillRect(screenX + 6, screenY + 8, 4, 4);
    } else if (seed === 2) {
        ctx.fillStyle = '#8b0000'; // Rotes Dach-Element
        ctx.fillRect(screenX + 2, screenY + 2, 12, 4);
    }
}

function drawConnections() {
    // Regel 3: Verbindungen als pixelige Strassen 
    ctx.fillStyle = C_ROAD;
    for (let [key, bldg] of buildings) {
        const [x, y] = key.split(',').map(Number);
        const screenX = camera.x + (x * TILE_SIZE);
        const screenY = camera.y + (y * TILE_SIZE);

        // Nach rechts verbunden?
        if (buildings.has(`${x+1},${y}`)) {
            ctx.fillRect(screenX + 10, screenY + 6, 12, 4);
        }
        // Nach unten verbunden?
        if (buildings.has(`${x},${y+1}`)) {
            ctx.fillRect(screenX + 6, screenY + 10, 4, 12);
        }
    }
}

function draw() {
    ctx.fillStyle = C_FOG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startCol = Math.floor((-camera.x) / TILE_SIZE);
    const endCol = startCol + Math.floor(canvas.width / TILE_SIZE) + 1;
    const startRow = Math.floor((-camera.y) / TILE_SIZE);
    const endRow = startRow + Math.floor(canvas.height / TILE_SIZE) + 1;

    // 1. Terrain zeichnen
    for (let x = startCol; x <= endCol; x++) {
        for (let y = startRow; y <= endRow; y++) {
            const key = `${x},${y}`;
            if (world.has(key)) {
                const tile = world.get(key);
                const sx = camera.x + (x * TILE_SIZE);
                const sy = camera.y + (y * TILE_SIZE);
                ctx.fillStyle = tile.color;
                ctx.fillRect(sx, sy, TILE_SIZE - 1, TILE_SIZE - 1);
            }
        }
    }

    // 2. Verbindungen zeichnen
    drawConnections();

    // 3. Gebäude zeichnen
    for (let x = startCol; x <= endCol; x++) {
        for (let y = startRow; y <= endRow; y++) {
            const key = `${x},${y}`;
            if (buildings.has(key)) {
                drawBuilding(x, y, buildings.get(key));
            }
        }
    }
}

// --- BEDÜRFNIS-SYSTEM ---
function updateNeeds() {
    const totalBuildings = buildings.size;
    let score = 100;

    // Simples Bedürfnis: Wenn zu wenig Ressourcen erkundet wurden, sinkt der Score
    if (world.size < totalBuildings * 2) score -= 25;

    // Farbe des Indikators anpassen
    uiInd.className = '';
    if (score >= 100) uiInd.classList.add('status-100');
    else if (score >= 75) uiInd.classList.add('status-75');
    else if (score >= 50) uiInd.classList.add('status-50');
    else if (score >= 25) uiInd.classList.add('status-25');
    else uiInd.classList.add('status-critical');
}

// --- EVENT LISTENERS ---
window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (camera.x === 0 && camera.y === 0) {
        camera.x = canvas.width / 2; camera.y = canvas.height / 2;
    }
    draw();
}

// UI Buttons
document.getElementById('btn-new-world').addEventListener('click', () => {
    uiMenu.classList.add('hidden');
    uiActionBar.classList.remove('hidden');
    localStorage.removeItem('commune_save');
    world.clear(); buildings.clear();
    initGame();
});

btnExplore.addEventListener('click', () => {
    currentMode = 'EXPLORE';
    btnExplore.style.borderColor = '#fff';
    btnBuild.style.borderColor = '#555';
});

btnBuild.addEventListener('click', () => {
    currentMode = 'BUILD';
    btnBuild.style.borderColor = '#fff';
    btnExplore.style.borderColor = '#555';
});

uiInd.addEventListener('click', () => {
    uiNeedsPanel.classList.remove('hidden');
});
document.getElementById('btn-close-needs').addEventListener('click', () => {
    uiNeedsPanel.classList.add('hidden');
});

// Touch / Maus Steuerung (identisch, kompakt)
function startDrag(x, y) { isDragging = true; hasDragged = false; dragStart = {x, y}; cameraStart = {x: camera.x, y: camera.y}; }
function doDrag(x, y) {
    if (!isDragging) return;
    const dx = x - dragStart.x, dy = y - dragStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;
    camera.x = cameraStart.x + dx; camera.y = cameraStart.y + dy;
    draw();
}
function endDrag(x, y) {
    isDragging = false;
    if (!hasDragged) handleInteraction(x, y);
}

canvas.addEventListener('mousedown', e => startDrag(e.clientX, e.clientY));
window.addEventListener('mousemove', e => doDrag(e.clientX, e.clientY));
window.addEventListener('mouseup', e => {
    const rect = canvas.getBoundingClientRect();
    endDrag(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener('touchstart', e => startDrag(e.touches[0].clientX, e.touches[0].clientY));
window.addEventListener('touchmove', e => { doDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
window.addEventListener('touchend', e => {
    if (e.changedTouches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        endDrag(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top);
    }
});

// START
initGame();
