import * as CONST from './constants.js';
import * as COORD from './coordUtils.js';
import { Unit } from './unit.js';
import * as UI from './uiUpdater.js';
import { BLUEPRINTS } from './unitBlueprints.js';
import { GameRenderer } from './renderer.js';
import { InputManager } from './inputManager.js';

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

        // Initialize InputManager
        this.inputManager = new InputManager(this.renderer, this);
        this._setupInputCallbacks();

        UI.initTabSystem();
    }

    _setupInputCallbacks() {
        this.inputManager.onUnitSelected = (unit) => {
            if (unit) {
                if (unit.owner === CONST.PLAYER_1_ID) {
                    this.selectUnit(unit);
                } else {
                    this._resetSelection();
                }
            } else {
                this._resetSelection();
            }
        };

        this.inputManager.onUnitCommand = (command) => {
            if (!this.selectedUnit) return;

            if (command.type === 'attack') {
                if (command.target.owner !== this.selectedUnit.owner) {
                    this.selectedUnit.attackTarget(command.target);
                    UI.setMessage(`${this.selectedUnit.name} が ${command.target.name} を攻撃目標に設定！`);
                }
            } else if (command.type === 'move') {
                this.selectedUnit.moveTo(command.x, command.y);
                UI.setMessage(`${this.selectedUnit.name} が移動を開始。`);
            }
        };

        this.inputManager.onMouseMove = (x, y) => {
            UI.updateMouseCoord(x, y);
        };

        this.inputManager.onPauseToggle = () => {
            this.togglePause();
        };

        this.inputManager.onTimeScaleChange = (delta) => {
            this.timeScale = Math.max(1, Math.min(10, this.timeScale + delta));
        };

        // UI Button controls (still handled here or could be moved to InputManager if they were DOM elements managed by it, but UI is separate)
        const uiElements = this.ui.cacheUIElements();
        if (uiElements.pauseButton) uiElements.pauseButton.addEventListener('click', () => this.togglePause());
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

    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            UI.showPauseMessage();
        } else {
            // When unpausing, we need to reset lastTime to avoid a huge dt jump
            this.lastTime = performance.now();
            UI.hidePauseMessage();
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

            // Update AI
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
            if (aiUnit.state === 'idle' && !aiUnit.target) {
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
                    aiUnit.attackTarget(closestTarget);
                }
            }
        });
    }

    _isUnitVisibleToPlayer(target, viewerId) {
        if (target.hp <= 0) return false;
        if (target.owner === viewerId) return true;
        return true;
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