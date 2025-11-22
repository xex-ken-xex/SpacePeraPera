import * as THREE from 'three';
import * as CONST from './constants.js';

export class InputManager {
    constructor(renderer, game) {
        this.renderer = renderer;
        this.game = game;
        this.container = renderer.container;

        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();

        // Event callbacks
        this.onUnitSelected = null;
        this.onUnitCommand = null; // Right click command
        this.onMouseMove = null;
        this.onPauseToggle = null;
        this.onTimeScaleChange = null;
        this.onFormationChange = null;

        this._initEventListeners();
    }

    _initEventListeners() {
        // Mouse Move
        this.container.addEventListener('mousemove', this._handleMouseMove.bind(this));

        // Left Click (Selection)
        this.container.addEventListener('click', this._handleLeftClick.bind(this));

        // Right Click (Command)
        this.container.addEventListener('contextmenu', this._handleRightClick.bind(this));

        // Keyboard
        window.addEventListener('keydown', this._handleKeyDown.bind(this));
    }

    _handleMouseMove(e) {
        if (this.onMouseMove) {
            const intersect = this.renderer.getRayIntersection(e.clientX, e.clientY);
            if (intersect) {
                this.onMouseMove(intersect.x, intersect.y);
            }
        }
    }

    _handleLeftClick(e) {
        if (this.game.gameOver) return;

        // 1. Check for 3D object intersection (Ships, Rings)
        const unitMeshes = this.game.units.map(u => u.meshGroup).filter(g => g !== null);
        const intersects = this.renderer.raycastObjects(e.clientX, e.clientY, unitMeshes);

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;
            let targetGroup = hitObject;
            while (targetGroup.parent && targetGroup.parent.type !== 'Scene') {
                targetGroup = targetGroup.parent;
            }

            const clickedUnit = this.game.units.find(u => u.meshGroup === targetGroup);
            if (clickedUnit && this.onUnitSelected) {
                this.onUnitSelected(clickedUnit);
                return;
            }
        }

        // 2. Fallback to ground plane intersection
        const intersect = this.renderer.getRayIntersection(e.clientX, e.clientY);
        if (!intersect) return;

        const clickedUnit = this.game._getUnitAt(intersect.x, intersect.y);
        if (this.onUnitSelected) {
            this.onUnitSelected(clickedUnit); // Pass null if no unit found (deselect)
        }
    }

    _handleRightClick(e) {
        e.preventDefault();
        if (this.game.gameOver) return;
        if (!this.onUnitCommand) return;

        // 1. Check for 3D object intersection (Attack target)
        const unitMeshes = this.game.units.map(u => u.meshGroup).filter(g => g !== null);
        const intersects = this.renderer.raycastObjects(e.clientX, e.clientY, unitMeshes);

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;
            let targetGroup = hitObject;
            while (targetGroup.parent && targetGroup.parent.type !== 'Scene') {
                targetGroup = targetGroup.parent;
            }

            const targetUnit = this.game.units.find(u => u.meshGroup === targetGroup);
            if (targetUnit) {
                this.onUnitCommand({ type: 'attack', target: targetUnit });
                return;
            }
        }

        // 2. Fallback to ground intersection (Move)
        const intersect = this.renderer.getRayIntersection(e.clientX, e.clientY);
        if (!intersect) return;

        const targetUnit = this.game._getUnitAt(intersect.x, intersect.y);
        if (targetUnit) {
            this.onUnitCommand({ type: 'attack', target: targetUnit });
        } else {
            this.onUnitCommand({ type: 'move', x: intersect.x, y: intersect.y });
        }
    }

    _handleKeyDown(e) {
        if (e.key === ' ') {
            if (this.onPauseToggle) {
                e.preventDefault();
                this.onPauseToggle();
            }
        } else if (e.key === 'PageUp') {
            if (this.onTimeScaleChange) this.onTimeScaleChange(1);
        } else if (e.key === 'PageDown') {
            if (this.onTimeScaleChange) this.onTimeScaleChange(-1);
        }
    }
}
