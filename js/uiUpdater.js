let ui = {};

export function cacheUIElements() {
    ui = {
        // Messages
        messageArea: document.getElementById('messageArea'),
        gameOverMessage: document.getElementById('gameOverMessage'),
        pauseMessage: document.getElementById('pauseMessage'),

        // Command Bar
        timeInfo: document.getElementById('timeInfo'),
        pauseButton: document.getElementById('pauseButton'),
        pauseButtonIcon: document.querySelector('#pauseButton i'),
        timeSlower: document.getElementById('time-slower'),
        timeFaster: document.getElementById('time-faster'),
        formationDeck: document.getElementById('formation-deck'),

        // Side Panel
        mouseCoord: document.getElementById('mouseCoord'),
        unitDataDisplay: document.getElementById('unit-data-display'),
        
        // Tabs
        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content'),
    };
    return ui;
}

export function updateTimeInfo(elapsedTime, timeScale) {
    if (!ui.timeInfo) return;

    const totalSeconds = Math.floor(elapsedTime / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');

    const timeString = `TIME: ${minutes}:${seconds}`;
    const scaleString = `x${timeScale}`;

    ui.timeInfo.textContent = `${timeString} | ${scaleString}`;
}

export function updatePauseButton(isPaused) {
    if (!ui.pauseButtonIcon) return;
    if (isPaused) {
        ui.pauseButtonIcon.classList.remove('fa-pause');
        ui.pauseButtonIcon.classList.add('fa-play');
    } else {
        ui.pauseButtonIcon.classList.remove('fa-play');
        ui.pauseButtonIcon.classList.add('fa-pause');
    }
}

export function setMessage(msg) {
    if (ui.messageArea) {
        // Add new message to the top
        const p = document.createElement('p');
        p.textContent = msg;
        ui.messageArea.prepend(p);
    }
    console.log(`[GAME] ${msg}`);
}

export function updateSelectedUnitInfo(unit) {
    if (!ui.unitDataDisplay) return;
    if (unit && unit.hp > 0) {
        const d = unit.getDebugInfo();
        const hpPercent = (d.hp / d.maxHp) * 100;
        // Max stats can be estimated or stored in blueprints if needed.
        // For now, let's assume a max of 200 for ATK/DEF for visualization.
        const atkPercent = (d.effectiveAtk / 200) * 100;
        const defPercent = (d.effectiveDef / 200) * 100;

        ui.unitDataDisplay.innerHTML = `
            <div class="data-row">
                <span class="data-label">NAME</span>
                <span class="data-value">${d.name}</span>
            </div>
            <div class="data-row">
                <span class="data-label">OWNER</span>
                <span class="data-value">PLAYER ${d.owner}</span>
            </div>
            <div id="unit-data-hp">
                <div class="data-row">
                    <span class="data-label">HULL</span>
                    <span class="data-value">${d.hp} / ${d.maxHp}</span>
                </div>
                <div class="stat-bar">
                    <div class="stat-bar-inner" style="width: ${hpPercent}%"></div>
                </div>
            </div>
            <div id="unit-data-atk">
                <div class="data-row">
                    <span class="data-label">ATTACK</span>
                    <span class="data-value">${d.effectiveAtk}</span>
                </div>
                <div class="stat-bar">
                    <div class="stat-bar-inner" style="width: ${atkPercent}%"></div>
                </div>
            </div>
            <div id="unit-data-def">
                <div class="data-row">
                    <span class="data-label">DEFENSE</span>
                    <span class="data-value">${d.effectiveDef}</span>
                </div>
                <div class="stat-bar">
                    <div class="stat-bar-inner" style="width: ${defPercent}%"></div>
                </div>
            </div>
             <div class="data-row">
                <span class="data-label">FORMATION</span>
                <span class="data-value">${d.formation}</span>
            </div>
            <div class="data-row">
                <span class="data-label">STATE</span>
                <span class="data-value">${d.state}</span>
            </div>
        `;
    } else {
        ui.unitDataDisplay.innerHTML = `<div class="unit-data-placeholder">NO UNIT SELECTED</div>`;
    }
}

export function updateMouseCoord(x, y) {
    if (ui.mouseCoord) ui.mouseCoord.textContent = `(${Math.round(x)}, ${Math.round(y)})`;
}

export function showGameOverMessage(msg) {
    if (ui.gameOverMessage) {
        ui.gameOverMessage.textContent = msg;
        ui.gameOverMessage.style.display = 'block';
    }
}

export function hideGameOverMessage() {
    if (ui.gameOverMessage) ui.gameOverMessage.style.display = 'none';
}

export function showPauseMessage() {
    if (ui.pauseMessage) ui.pauseMessage.style.display = 'block';
}

export function hidePauseMessage() {
    if (ui.pauseMessage) ui.pauseMessage.style.display = 'none';
}

export function updateFormationButtons(unit) {
    const buttons = ui.formationDeck ? ui.formationDeck.querySelectorAll('.cyber-button') : [];
    
    if (!unit) {
        buttons.forEach(btn => btn.classList.remove('active'));
        return;
    }

    buttons.forEach(btn => {
        if (btn.dataset.formation === unit.formation) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

export function initTabSystem() {
    if (!ui.tabButtons) return;
    ui.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Handle button active state
            ui.tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Handle content visibility
            const tabId = button.dataset.tab;
            ui.tabContents.forEach(content => {
                if (content.id === `tab-${tabId}`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });
}