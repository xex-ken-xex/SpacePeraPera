import * as CONST from './constants.js';
import * as COORD from './coordUtils.js';
import { Unit } from './unit.js';
import * as UI from './uiUpdater.js';
import { BLUEPRINTS } from './unitBlueprints.js';
import { GameRenderer } from './renderer.js';

export class Game {
    constructor() {
        UI.cacheUIElements();
        this.renderer = new GameRenderer('gameContainer');
        this.ui = UI;

        this.units = [];
        this.selectedUnit = null;
        this.gameOver = false;
        this.animations = [];
        this.lastTime = 0;
        this.aiUpdateAccumulator = 0;

        this.timeScale = 1;
        this.elapsedGameTime = 0;
        this.isPaused = false;

        this._initEventListeners();
        UI.initTabSystem();
    }

    _initEventListeners() {
        this.renderer.container.addEventListener('mousemove', this._handleMouseMove.bind(this));
        // Left-click for selection
        this.renderer.container.addEventListener('click', this._handleLeftClick.bind(this));
        // Right-click for commands
        this.renderer.container.addEventListener('contextmenu', this._handleRightClick.bind(this));

        const togglePause = (e) => {
            if (e) e.preventDefault();
            this.isPaused = !this.isPaused;
            if (this.isPaused) {
                UI.showPauseMessage();
            } else {
                // When unpausing, we need to reset lastTime to avoid a huge dt jump
                this.lastTime = performance.now();
                UI.hidePauseMessage();
            }
        };

        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            if (e.key === 'PageUp') this.timeScale = Math.min(10, this.timeScale + 1);
            if (e.key === 'PageDown') this.timeScale = Math.max(1, this.timeScale - 1);
            if (e.key === ' ') togglePause(e);
        });

        // UI Button controls
        const uiElements = this.ui.cacheUIElements(); // Re-call to ensure ui is populated
        if (uiElements.pauseButton) uiElements.pauseButton.addEventListener('click', togglePause);
        if (uiElements.timeSlower) uiElements.timeSlower.addEventListener('click', () => this.timeScale = Math.max(1, this.timeScale - 1));
        if (uiElements.timeFaster) uiElements.timeFaster.addEventListener('click', () => this.timeScale = Math.min(10, this.timeScale + 1));

        // Formation buttons
        if (uiElements.formationDeck) {
            uiElements.formationDeck.addEventListener('click', (e) => {
                if (e.target.classList.contains('cyber-button')) {
                    this._changeFormation(e.target.dataset.formation);
                }
            });
        }
    }

    startGame() {
        const unitData = [
            // Player 1 (Blue)
            { id: 1, name: '第一艦隊', x: 500, y: 2000, owner: CONST.PLAYER_1_ID },
            { id: 2, name: '第三艦隊', x: 500, y: 1500, owner: CONST.PLAYER_1_ID },
            { id: 3, name: '第六艦隊', x: 500, y: 2500, owner: CONST.PLAYER_1_ID },
            { id: 4, name: '第八艦隊', x: 800, y: 2000, owner: CONST.PLAYER_1_ID },

            // Player 2 (Red/AI)
            { id: 5, name: 'アテナ艦隊', x: 3500, y: 2000, owner: CONST.PLAYER_2_ID },
            { id: 6, name: 'ゼウス艦隊', x: 3500, y: 1500, owner: CONST.PLAYER_2_ID },
            { id: 7, name: 'ネプチューン艦隊', x: 3500, y: 2500, owner: CONST.PLAYER_2_ID },
            { id: 8, name: 'ヘルメス艦隊', x: 3200, y: 2000, owner: CONST.PLAYER_2_ID },
        ];

        this.units = unitData.map(data => {
            const blueprint = BLUEPRINTS[data.name];
            if (!blueprint) {
                console.error(`Blueprint not found for unit: ${data.name}`);
                return null;
            }
            return new Unit(data.id, data.name, data.x, data.y, data.owner, blueprint, this);
        }).filter(u => u !== null);

        this._resetSelection();
        this.gameOver = false;
        this.animations = [];
        this.aiUpdateAccumulator = 0;
        this.timeScale = 1;
        this.elapsedGameTime = 0;
        this.isPaused = false;

        UI.hideGameOverMessage();
        UI.hidePauseMessage();
        UI.setMessage('ゲーム開始。全艦、行動開始！');
        UI.updateSelectedUnitInfo(null);

        if (!this.gameOver) {
            this.lastTime = performance.now();
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }

    gameLoop(timestamp) {
        if (this.isPaused) {
            // When paused, only render the scene and listen for the next frame.
            // We also update the pause button icon state.
            UI.updatePauseButton(this.isPaused);
            this.renderer.render();
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }

        const dt = this.lastTime ? timestamp - this.lastTime : 0;
        this.lastTime = timestamp;
        const scaledDt = dt * this.timeScale;

        if (!this.gameOver) {
            this.elapsedGameTime += scaledDt;

            // Update AI - use real dt to avoid excessive updates on high speed
            this.aiUpdateAccumulator += dt;
            if (this.aiUpdateAccumulator >= CONST.AI_UPDATE_INTERVAL) {
                this._updateAI(this.aiUpdateAccumulator);
                this.aiUpdateAccumulator = 0;
            }

            // Update all units
            this.units.forEach(unit => {
                if (unit.hp > 0) {
                    unit.update(scaledDt);
                }
            });
        }

        // Update animations
        for (let i = this.animations.length - 1; i >= 0; i--) {
            const anim = this.animations[i];
            anim.update(scaledDt);
            if (anim.isFinished) {
                this.animations.splice(i, 1);
            }
        }

        // Update unit visuals
        this.units.forEach(unit => {
            const isVisible = this._isUnitVisibleToPlayer(unit, CONST.PLAYER_1_ID);
            unit.updateVisuals(unit === this.selectedUnit, isVisible);
            unit.update3DPosition();
        });

        if (this.selectedUnit) {
            this.renderer.showRangeCircles(this.selectedUnit.x, this.selectedUnit.y, 0, this.selectedUnit.range);
        }

        // Update UI
        UI.updateTimeInfo(this.elapsedGameTime, this.timeScale);
        UI.updatePauseButton(this.isPaused);

        // Render 3D scene
        this.renderer.render();

        if (!this.gameOver) {
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }

    _updateAI() {
        const aiUnits = this.units.filter(u => u.owner === CONST.PLAYER_2_ID && u.hp > 0);
        const playerUnits = this.units.filter(u => u.owner === CONST.PLAYER_1_ID && u.hp > 0);

        if (playerUnits.length === 0) return;

        aiUnits.forEach(aiUnit => {
            // If idle and has no target, find a new one to move towards.
            // The _scanAndEngage logic in the Unit class will handle opportunistic attacks.
            if (aiUnit.state === 'idle' && !aiUnit.target) {
                // Find the closest player unit
                let closestTarget = null;
                let minDistance = Infinity;

                playerUnits.forEach(playerUnit => {
                    const distance = COORD.distance(aiUnit.x, aiUnit.y, playerUnit.x, playerUnit.y);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestTarget = playerUnit;
                    }
                });

                if (closestTarget) {
                    // Command to attack, which will cause movement if out of range
                    aiUnit.attackTarget(closestTarget);
                }
            }
        });
    }

    _isUnitVisibleToPlayer(target, viewerId) {
        if (target.hp <= 0) return false;
        if (target.owner === viewerId) return true;
        // In real-time, maybe all units are visible for now
        return true;
        // Or use sight range:
        // return this.units.some(u =>
        //     u.owner === viewerId &&
        //     u.hp > 0 &&
        //     COORD.distance(u.x, u.y, target.x, target.y) <= u.sightRange
        // );
    }

    checkWinCondition() {
        if (this.gameOver) return true;

        const p1Alive = this.units.some(u => u.owner === CONST.PLAYER_1_ID && u.hp > 0);
        const p2Alive = this.units.some(u => u.owner === CONST.PLAYER_2_ID && u.hp > 0);

        let winner = null;
        if (!p1Alive && !p2Alive) winner = "DRAW";
        else if (!p1Alive) winner = CONST.PLAYER_2_ID;
        else if (!p2Alive) winner = CONST.PLAYER_1_ID;

        if (winner) {
            this.gameOver = true;
            const msg = winner === "DRAW" ? "引き分け！" : `プレイヤー${winner}の勝利！`;
            UI.showGameOverMessage(msg);
            this._resetSelection();
            return true;
        }
        return false;
    }

    _getUnitAt(x, y) {
        for (let i = this.units.length - 1; i >= 0; i--) {
            const u = this.units[i];
            if (u.hp > 0 && COORD.distance(x, y, u.x, u.y) <= u.radius + 50) {
                return u;
            }
        }
        return null;
    }

    _handleMouseMove(e) {
        const intersect = this.renderer.getRayIntersection(e.clientX, e.clientY);
        if (intersect) {
            UI.updateMouseCoord(intersect.x, intersect.y);
        }
    }

    _handleLeftClick(e) {
        if (this.gameOver) return;

        // 1. Check for 3D object intersection (Ships, Rings)
        const unitMeshes = this.units.map(u => u.meshGroup).filter(g => g !== null);
        const intersects = this.renderer.raycastObjects(e.clientX, e.clientY, unitMeshes);

        if (intersects.length > 0) {
            // Find which unit belongs to the intersected object
            const hitObject = intersects[0].object;
            let targetGroup = hitObject;
            while (targetGroup.parent && targetGroup.parent.type !== 'Scene') {
                targetGroup = targetGroup.parent;
            }

            const clickedUnit = this.units.find(u => u.meshGroup === targetGroup);
            if (clickedUnit) {
                if (clickedUnit.owner === CONST.PLAYER_1_ID) {
                    this.selectUnit(clickedUnit);
                } else {
                    this._resetSelection();
                }
                return;
            }
        }

        // 2. Fallback to ground plane intersection (for empty space clicks or loose targeting)
        const intersect = this.renderer.getRayIntersection(e.clientX, e.clientY);
        if (!intersect) return;

        const clickedUnit = this._getUnitAt(intersect.x, intersect.y);

        if (clickedUnit && clickedUnit.owner === CONST.PLAYER_1_ID) {
            this.selectUnit(clickedUnit);
        } else {
            this._resetSelection();
        }
    }

    _handleRightClick(e) {
        e.preventDefault();
        if (this.gameOver) return;
        if (!this.selectedUnit) return;

        // Check for 3D object intersection first (for attacking)
        const unitMeshes = this.units.map(u => u.meshGroup).filter(g => g !== null);
        const intersects = this.renderer.raycastObjects(e.clientX, e.clientY, unitMeshes);

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;
            let targetGroup = hitObject;
            while (targetGroup.parent && targetGroup.parent.type !== 'Scene') {
                targetGroup = targetGroup.parent;
            }

            const targetUnit = this.units.find(u => u.meshGroup === targetGroup);
            if (targetUnit && targetUnit.owner !== this.selectedUnit.owner) {
                this.selectedUnit.attackTarget(targetUnit);
                UI.setMessage(`${this.selectedUnit.name} が ${targetUnit.name} を攻撃目標に設定！`);
                return;
            }
        }

        // Fallback to ground intersection
        const intersect = this.renderer.getRayIntersection(e.clientX, e.clientY);
        if (!intersect) return;

        const targetUnit = this._getUnitAt(intersect.x, intersect.y);

        if (targetUnit) {
            if (targetUnit.owner !== this.selectedUnit.owner) {
                this.selectedUnit.attackTarget(targetUnit);
                UI.setMessage(`${this.selectedUnit.name} が ${targetUnit.name} を攻撃目標に設定！`);
            }
        } else {
            this.selectedUnit.moveTo(intersect.x, intersect.y);
            UI.setMessage(`${this.selectedUnit.name} が移動を開始。`);
        }
    }

    _resetSelection() {
        if (this.selectedUnit) {
            this.selectedUnit.setSelected(false);
        }
        this.selectedUnit = null;
        UI.updateSelectedUnitInfo(null);
        UI.updateFormationButtons(null);
    }

    _selectUnit(unit) {
        if (this.selectedUnit) {
            this.selectedUnit.setSelected(false);
        }
        this.selectedUnit = unit;
        this.selectedUnit.setSelected(true);
        UI.updateSelectedUnitInfo(this.selectedUnit);
        UI.updateFormationButtons(this.selectedUnit);
        UI.setMessage(`${unit.name} を選択中。`);
    }

    selectUnit(unit) {
        this._selectUnit(unit);
    }

    _changeFormation(formationType) {
        if (!this.selectedUnit || this.selectedUnit.owner !== CONST.PLAYER_1_ID) {
            UI.setMessage("陣形を変更できるユニットが選択されていません。");
            return;
        }

        this.selectedUnit.setFormation(formationType);
        const formationName = CONST.FORMATIONS[formationType]?.name || formationType;
        UI.setMessage(`${this.selectedUnit.name} の陣形を ${formationName} に変更しました。`);
        UI.updateSelectedUnitInfo(this.selectedUnit);
        UI.updateFormationButtons(this.selectedUnit);
    }
}