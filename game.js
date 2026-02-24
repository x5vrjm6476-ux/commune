// ==========================================
// COMMUNE - GAME ENGINE (CUTE RETRO EDITION)
// ==========================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 16;

// --- WEICHE RETRO-FARBPALETTE ---
const C_FOG = '#181425';     // Nachtblau
const C_LAND = '#4f7754';    // Weiches Grasgrün
const C_WOOD = '#2e453b';    // Dunkler Nadelwald
const C_WATER = '#5a9ebf';   // Sanftes Wasser
const C_WATER_ALT = '#6cb4d4'; // Wasser-Animation
const C_STONE = '#737a8c';   // Bläuliches Grau
const C_RUIN = '#6b4c7a';    // Mystisches Lila
const C_ROAD = '#d2b99b';    // Sandiger Weg

// --- DOM ELEMENTE ---
const uiInd = document.getElementById('needs-indicator');
const uiNeedsPanel = document.getElementById('needs-panel');
const uiMenu = document.getElementById('main-menu');
const iosDock = document.getElementById('ios-pixel-dock');
const barSpace = document.getElementById('bar-space');
const barResources = document.getElementById('bar-resources');
const barConnection = document.getElementById('bar-connection');
const textHint = document.getElementById('needs-hint');

// Entscheidungs-Panel
const dialogDecision = document.getElementById('decision-dialog');
const decTitle = document.getElementById('decision-title');
const decText = document.getElementById('decision-text');
const btnDecA = document.getElementById('btn-decision-a');
const btnDecB = document.getElementById('btn-decision-b');

// --- SPIELSTATUS ---
let camera = { x: 0, y: 0 };
let isDragging = false, hasDragged = false;
let dragStart = { x: 0, y: 0 }, cameraStart = { x: 0, y: 0 };
let isDeciding = false; // Blockiert das Spiel während einer Entscheidung
let tickCount = 0; // Für Animationen

// Welt-Daten
let world = new Map();
let buildings = new Map();
let pendingTile = null; // Speichert die Koordinaten für die aktuelle Entscheidung

// Der Game-Loop für automatisches Wachstum
let growthInterval = null;

// --- INITIALISIERUNG ---
function initGame() {
    const saved = localStorage.getItem('commune_save');
    if (saved) {
        loadGameData(JSON.parse(saved));
        uiMenu.classList.add('hidden');
        iosDock.classList.remove('hidden');
        uiInd.classList.remove('hidden');
    } else {
        for (let x = -2; x <= 2; x++) {
            for (let y = -2; y <= 2; y++) {
                world.set(`${x},${y}`, { type: 'land', color: C_LAND });
            }
        }
        buildings.set(`0,0`, { genes: ['GEMEINSCHAFT'] });
        buildings.set(`1,0`, { genes: ['GEMEINSCHAFT'] });
        buildings.set(`0,1`, { genes: ['GEMEINSCHAFT'] }); // Start-Kern (3 Gebäude)
    }
    resizeCanvas();
    updateNeeds();
    startGameLoop();
}

function startGameLoop() {
    if (growthInterval) clearInterval(growthInterval);
    // Alle 2 Sekunden wächst die Welt organisch
    growthInterval = setInterval(() => {
        if (!isDeciding) {
            processGrowth();
            tickCount++;
            draw();
        }
    }, 2000);
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

// --- HILFSFUNKTIONEN ---
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

// --- ERKUNDEN & ENTSCHEIDEN ---
function generateResource(x, y) {
    const dist = Math.abs(x) + Math.abs(y);
    const rand = Math.random();
    
    if (rand < 0.05 + (dist * 0.005)) return { type: 'ruin', name: 'Ruine', color: C_RUIN, gene: 'WISSEN' };
    if (rand < 0.15 + (dist * 0.01)) return { type: 'mountain', name: 'Gebirge', color: C_STONE, gene: 'STEIN' };
    if (rand < 0.30 + (dist * 0.01)) return { type: 'forest', name: 'Wald', color: C_WOOD, gene: 'HOLZ' };
    if (rand < 0.40) return { type: 'river', name: 'Fluss', color: C_WATER, gene: 'WASSER' };
    return { type: 'land', name: 'Leeres Land', color: C_LAND, gene: 'ERDE' };
}

function handleInteraction(screenX, screenY) {
    if (isDeciding) return; // Nichts tun, wenn Dialog offen ist

    const coords = getGridCoords(screenX, screenY);
    const key = `${coords.x},${coords.y}`;

    // Erkunden (Nebel anklicken)
    if (!world.has(key) && isAdjacent(coords.x, coords.y, world)) {
        const discovered = generateResource(coords.x, coords.y);
        pendingTile = { key: key, x: coords.x, y: coords.y, resource: discovered };
        showDecisionDialog(discovered);
    }
}

function showDecisionDialog(resource) {
    isDeciding = true;
    dialogDecision.classList.remove('hidden');
    decTitle.innerText = `Ein ${resource.name}!`;

    if (resource.type === 'forest') {
        decText.innerText = "Ein alter Nadelwald. Was ist dein Wille?";
        btnDecA.innerText = "Natur belassen (Liefert Holz-Gen)";
        btnDecB.innerText = "Abholzen (Schafft Bauplatz)";
    } else if (resource.type === 'mountain') {
        decText.innerText = "Massiver Fels. Sollen wir ihn nutzen?";
        btnDecA.innerText = "Belassen (Liefert Stein-Gen)";
        btnDecB.innerText = "Steinbruch (Schafft Bauplatz)";
    } else if (resource.type === 'river') {
        decText.innerText = "Frisches Wasser kreuzt den Weg.";
        btnDecA.innerText = "Fliessen lassen (Wasser-Gen)";
        btnDecB.innerText = "Brücke bauen (Verbindung)";
    } else if (resource.type === 'ruin') {
        decText.innerText = "Geheimnisvolle Steine aus alter Zeit.";
        btnDecA.innerText = "Beobachten (Wissen-Gen)";
        btnDecB.innerText = "Ausgraben (Bauplatz)";
    } else {
        decText.innerText = "Fruchtbares, grünes Land.";
        btnDecA.innerText = "Naturraum belassen";
        btnDecB.innerText = "Für Siedler freigeben";
    }

    // Event Listener neu binden (alte entfernen durch Klonen)
    const newBtnA = btnDecA.cloneNode(true);
    const newBtnB = btnDecB.cloneNode(true);
    btnDecA.parentNode.replaceChild(newBtnA, btnDecA);
    btnDecB.parentNode.replaceChild(newBtnB, btnDecB);

    newBtnA.addEventListener('click', () => resolveDecision('A', resource));
    newBtnB.addEventListener('click', () => resolveDecision('B', resource));
}

function resolveDecision(choice, resource) {
    dialogDecision.classList.add('hidden');
    isDeciding = false;

    if (choice === 'A') {
        // Option A: Ressource belassen (gibt Gene ab)
        world.set(pendingTile.key, resource);
    } else {
        // Option B: Platz machen / Bebauen
        world.set(pendingTile.key, { type: 'land', name: 'Land', color: C_LAND, gene: 'ERDE' });
        // Setzt sofort ein kleines Basis-Gebäude dorthin, wenn es neben anderen steht
        if (isAdjacent(pendingTile.x, pendingTile.y, buildings)) {
            buildings.set(pendingTile.key, { genes: ['ERDE', resource.gene] });
        }
    }

    pendingTile = null;
    saveGame();
    draw();
    updateNeeds();
}

// --- AUTOMATISCHES WACHSTUM ---
function processGrowth() {
    let newBuildings = [];

    for (let [key, bldg] of buildings) {
        const [x, y] = key.split(',').map(Number);
        const bldgNeighbors = getNeighbors(x, y, buildings).filter(n => n.v !== undefined);
        
        // KERN-Bedingung: 2 oder mehr Nachbarn (also 3er Cluster)
        if (bldgNeighbors.length >= 2) {
            // Eine 10% Chance pro Tick, dass dieser Kern sich teilt
            if (Math.random() < 0.10) {
                // Finde ein leeres Feld neben diesem Gebäude
                const emptyLands = getNeighbors(x, y, world).filter(n => 
                    n.v !== undefined && 
                    n.v.type === 'land' && 
                    !buildings.has(n.k)
                );

                if (emptyLands.length > 0) {
                    const target = emptyLands[Math.floor(Math.random() * emptyLands.length)];
                    
                    // Sammle Gene der Umgebung für das neue Gebäude
                    let newGenes = [...bldg.genes];
                    getNeighbors(target.x, target.y, world).forEach(wn => {
                        if (wn.v && wn.v.gene && !newGenes.includes(wn.v.gene)) newGenes.push(wn.v.gene);
                    });

                    // Verhindere unendlichen Wucher: Bauen nur, wenn das Zielfeld NICHT schon umzingelt ist
                    const targetBldgNeighbors = getNeighbors(target.x, target.y, buildings).filter(n => n.v !== undefined);
                    if (targetBldgNeighbors.length <= 2) {
                        newBuildings.push({ key: target.k, genes: newGenes });
                    }
                }
            }
        }
    }

    if (newBuildings.length > 0) {
        newBuildings.forEach(nb => buildings.set(nb.key, { genes: nb.genes }));
        updateNeeds();
        saveGame();
    }
}

// --- RENDERING ---
function drawBuilding(x, y, bldg) {
    const screenX = camera.x + (x * TILE_SIZE);
    const screenY = camera.y + (y * TILE_SIZE);

    // Gebäude sind etwas kleiner als das Feld (12x12 statt 16x16), so entsteht der "Dorf"-Look
    const bOffset = 2; 
    const bSize = TILE_SIZE - (bOffset * 2);

    let baseColor = '#e4a672'; // Standard (Erde/Holz)
    let roofColor = '#bf6a5c'; // Ziegelrot

    if (bldg.genes.includes('STEIN')) { baseColor = '#949bb0'; roofColor = '#5a6988'; }
    if (bldg.genes.includes('WISSEN')) { baseColor = '#d9c5e3'; roofColor = '#6b4c7a'; }

    // Pulsier-Animation für einsame Gebäude (Bedürfnis nach Verbindung)
    const isConnected = getNeighbors(x, y, buildings).some(n => n.v !== undefined);
    let animOffset = (!isConnected && tickCount % 2 === 0) ? 1 : 0;

    // Haus zeichnen
    ctx.fillStyle = baseColor;
    ctx.fillRect(screenX + bOffset, screenY + bOffset - animOffset, bSize, bSize);

    // Dach zeichnen
    ctx.fillStyle = roofColor;
    ctx.fillRect(screenX + bOffset - 1, screenY + bOffset - animOffset - 2, bSize + 2, 4);

    // Kleines Fenster
    ctx.fillStyle = '#262b44';
    ctx.fillRect(screenX + bOffset + 2, screenY + bOffset + 4 - animOffset, 3, 3);
}

function drawConnections() {
    ctx.fillStyle = C_ROAD;
    for (let [key, bldg] of buildings) {
        const [x, y] = key.split(',').map(Number);
        const screenX = camera.x + (x * TILE_SIZE);
        const screenY = camera.y + (y * TILE_SIZE);

        if (buildings.has(`${x+1},${y}`)) ctx.fillRect(screenX + 12, screenY + 6, 6, 4);
        if (buildings.has(`${x},${y+1}`)) ctx.fillRect(screenX + 6, screenY + 12, 4, 6);
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
                const tile = world.get(key);
                const sx = camera.x + (x * TILE_SIZE);
                const sy = camera.y + (y * TILE_SIZE);
                
                // Wasser Animation
                if (tile.type === 'river') {
                    ctx.fillStyle = (tickCount % 2 === 0) ? C_WATER : C_WATER_ALT;
                } else {
                    ctx.fillStyle = tile.color;
                }
                
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                
                // Leichte, niedliche Punkte auf Land und Wald
                if (tile.type === 'land' || tile.type === 'forest') {
                    ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    ctx.fillRect(sx + 2, sy + 2, 2, 2);
                    ctx.fillRect(sx + 10, sy + 12, 2, 2);
                }
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
    
    let spaceScore = Math.min(100, Math.floor((worldCount / (bCount * 2.5)) * 100));
    let resourceScore = Math.min(100, Math.floor((worldCount / (bCount * 1.5)) * 100));
    
    // Prüft auf einsame Gebäude für den Verbindungs-Score
    let isolatedCount = 0;
    for (let [key, bldg] of buildings) {
        const [x, y] = key.split(',').map(Number);
        if (!isAdjacent(x, y, buildings)) isolatedCount++;
    }
    let connScore = Math.max(0, 100 - (isolatedCount * 10));

    barSpace.style.width = `${spaceScore}%`;
    barResources.style.width = `${resourceScore}%`;
    barConnection.style.width = `${connScore}%`;

    let totalScore = (spaceScore + resourceScore + connScore) / 3;

    uiInd.className = '';
    if (totalScore >= 90) { uiInd.classList.add('status-100'); textHint.innerText = "Die Welt atmet ruhig."; }
    else if (totalScore >= 70) { uiInd.classList.add('status-75'); textHint.innerText = "Die Siedlung floriert."; }
    else if (totalScore >= 50) { uiInd.classList.add('status-50'); textHint.innerText = "Der Platz wird knapp."; }
    else if (totalScore >= 25) { uiInd.classList.add('status-25'); textHint.innerText = "Ressourcen fehlen."; }
    else { uiInd.classList.add('status-critical'); textHint.innerText = "Dein Geist wird unruhig."; }
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

document.getElementById('btn-menu-open').addEventListener('click', () => { 
    uiMenu.classList.remove('hidden'); 
    iosDock.classList.add('hidden');
    uiInd.classList.add('hidden');
});

uiInd.addEventListener('click', () => uiNeedsPanel.classList.remove('hidden'));
document.getElementById('btn-close-needs').addEventListener('click', () => uiNeedsPanel.classList.add('hidden'));

// Steuerung (Maus & Touch)
function startDrag(x, y) { isDragging = true; hasDragged = false; dragStart = {x, y}; cameraStart = {x: camera.x, y: camera.y}; }
function doDrag(x, y) {
    if (!isDragging || isDeciding) return;
    const dx = x - dragStart.x, dy = y - dragStart.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDragged = true;
    camera.x = cameraStart.x + dx; camera.y = cameraStart.y + dy;
    draw();
}
function endDrag(x, y) {
    isDragging = false;
    if (!hasDragged && !isDeciding) handleInteraction(x, y);
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

// INITIAL DRAW
resizeCanvas();
