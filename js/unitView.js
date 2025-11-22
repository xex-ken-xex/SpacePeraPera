import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as CONST from './constants.js';

export class UnitView {
    constructor(unit, game) {
        this.unit = unit;
        this.game = game;
        this.meshGroup = null;
        this.shipMeshes = [];
        this.selectionRing = null;
        this.hitAreaRing = null;
        this.labelObject = null;
        this.destinationMarker = null;

        this._init3DObject();
    }

    _init3DObject() {
        this.meshGroup = new THREE.Group();

        const shipCount = 100; // 100 ships per unit
        const color = this.unit.owner === CONST.PLAYER_1_ID ? CONST.PLAYER_1_COLOR : CONST.PLAYER_2_COLOR;

        for (let i = 0; i < shipCount; i++) {
            const shipGroup = this._createDetailedShip(color);
            this.shipMeshes.push(shipGroup);
            this.meshGroup.add(shipGroup);
        }

        // Initial formation arrangement
        this.arrangeShipsInFormation(this.unit.formation);

        // Selection Ring
        const ringGeo = new THREE.RingGeometry(CONST.UNIT_RADIUS + 10, CONST.UNIT_RADIUS + 15, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0
        });
        this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
        this.meshGroup.add(this.selectionRing);

        // Debug Hit Area
        const hitGeo = new THREE.RingGeometry(CONST.UNIT_RADIUS + 45, CONST.UNIT_RADIUS + 50, 32);
        hitGeo.rotateX(-Math.PI / 2);
        const hitMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
        });
        this.hitAreaRing = new THREE.Mesh(hitGeo, hitMat);
        this.meshGroup.add(this.hitAreaRing);

        // Spatial Label
        const div = document.createElement('div');
        div.className = 'unit-label';
        div.textContent = this.unit.name;
        div.style.color = this.unit.owner === CONST.PLAYER_1_ID ? '#00ffff' : '#ff0000';

        // Add HP bar container
        const hpBar = document.createElement('div');
        hpBar.className = 'hp-bar';
        const hpFill = document.createElement('div');
        hpFill.className = 'hp-fill';
        hpBar.appendChild(hpFill);
        div.appendChild(hpBar);

        this.labelObject = new CSS2DObject(div);
        this.labelObject.position.set(0, 50, 0);
        this.meshGroup.add(this.labelObject);

        // Movement Arrow (only for player 1)
        if (this.unit.owner === CONST.PLAYER_1_ID) {
            this.destinationMarker = this._createMovementArrow();
        }

        if (this.game.renderer) {
            this.game.renderer.add(this.meshGroup);
            if (this.destinationMarker) {
                this.game.renderer.add(this.destinationMarker);
            }
        }

        this.updatePosition();
    }

    _createDetailedShip(color) {
        const shipGroup = new THREE.Group();

        // Main hull (elongated box)
        const hullGeo = new THREE.BoxGeometry(CONST.SHIP_SIZE * 0.6, CONST.SHIP_SIZE * 0.4, CONST.SHIP_SIZE * 2);
        const hullMat = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.7,
            roughness: 0.3,
            emissive: color,
            emissiveIntensity: 0.1
        });
        const hull = new THREE.Mesh(hullGeo, hullMat);
        hull.position.z = 0;
        shipGroup.add(hull);

        // Bridge (command tower)
        const bridgeGeo = new THREE.BoxGeometry(CONST.SHIP_SIZE * 0.4, CONST.SHIP_SIZE * 0.6, CONST.SHIP_SIZE * 0.5);
        const bridgeMat = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.6,
            roughness: 0.4,
            emissive: color,
            emissiveIntensity: 0.15
        });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        bridge.position.set(0, CONST.SHIP_SIZE * 0.3, -CONST.SHIP_SIZE * 0.3);
        shipGroup.add(bridge);

        // Engine glow (back of ship)
        const engineGeo = new THREE.CylinderGeometry(CONST.SHIP_SIZE * 0.15, CONST.SHIP_SIZE * 0.2, CONST.SHIP_SIZE * 0.4, 8);
        engineGeo.rotateX(Math.PI / 2);
        const engineMat = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.9
        });
        const engine = new THREE.Mesh(engineGeo, engineMat);
        engine.position.z = CONST.SHIP_SIZE * 1.2;
        shipGroup.add(engine);

        // Weapon pods (small boxes on sides)
        const weaponGeo = new THREE.BoxGeometry(CONST.SHIP_SIZE * 0.2, CONST.SHIP_SIZE * 0.2, CONST.SHIP_SIZE * 0.6);
        const weaponMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.8,
            roughness: 0.2
        });

        const weaponLeft = new THREE.Mesh(weaponGeo, weaponMat);
        weaponLeft.position.set(-CONST.SHIP_SIZE * 0.4, 0, -CONST.SHIP_SIZE * 0.2);
        shipGroup.add(weaponLeft);

        const weaponRight = new THREE.Mesh(weaponGeo, weaponMat);
        weaponRight.position.set(CONST.SHIP_SIZE * 0.4, 0, -CONST.SHIP_SIZE * 0.2);
        shipGroup.add(weaponRight);

        // Antenna (thin cylinder)
        const antennaGeo = new THREE.CylinderGeometry(CONST.SHIP_SIZE * 0.05, CONST.SHIP_SIZE * 0.05, CONST.SHIP_SIZE * 0.8, 4);
        const antennaMat = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0xff0000,
            emissiveIntensity: 0.3
        });
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.set(0, CONST.SHIP_SIZE * 0.7, -CONST.SHIP_SIZE * 0.3);
        shipGroup.add(antenna);

        return shipGroup;
    }

    _createMovementArrow() {
        const dir = new THREE.Vector3(0, 0, 1);
        const origin = new THREE.Vector3(0, 0, 0);
        const length = 50;
        const hex = 0x00ffff;

        const arrowHelper = new THREE.ArrowHelper(dir, origin, length, hex, 20, 10);
        arrowHelper.visible = false;

        // Make it semi-transparent
        if (arrowHelper.line.material) {
            arrowHelper.line.material.transparent = true;
            arrowHelper.line.material.opacity = 0.5;
        }
        if (arrowHelper.cone.material) {
            arrowHelper.cone.material.transparent = true;
            arrowHelper.cone.material.opacity = 0.5;
        }

        return arrowHelper;
    }

    updatePosition() {
        if (this.meshGroup) {
            this.meshGroup.position.set(this.unit.x, 0, this.unit.y);
            // Correct heading by -90 degrees to align with model orientation
            this.meshGroup.rotation.y = -this.unit.heading - Math.PI / 2;
        }

        if (this.destinationMarker && this.destinationMarker.visible && this.unit.targetPosition) {
            // Update arrow position to follow unit
            this.destinationMarker.position.set(this.unit.x, 5, this.unit.y);

            // Update arrow direction and length
            const dist = Math.sqrt(Math.pow(this.unit.targetPosition.x - this.unit.x, 2) + Math.pow(this.unit.targetPosition.y - this.unit.y, 2));
            const dir = new THREE.Vector3(this.unit.targetPosition.x - this.unit.x, 0, this.unit.targetPosition.y - this.unit.y).normalize();
            this.destinationMarker.setDirection(dir);
            this.destinationMarker.setLength(Math.min(dist, 200), 20, 10);
        }
    }

    updateVisuals(isSelected, isVisible = true) {
        if (!this.meshGroup) return;

        this.meshGroup.visible = isVisible;
        if (!isVisible) return;

        if (this.selectionRing) {
            this.selectionRing.material.opacity = isSelected ? 0.8 : 0;
        }

        const hpRatio = this.unit.hp / this.unit.maxHp;
        const currentShipCount = Math.ceil(hpRatio * this.shipMeshes.length);

        this.shipMeshes.forEach((shipGroup, index) => {
            shipGroup.visible = index < currentShipCount;
        });

        if (this.labelObject) {
            const hpPercent = hpRatio * 100;
            const fill = this.labelObject.element.querySelector('.hp-fill');
            if (fill) fill.style.width = `${hpPercent}%`;

            this.labelObject.visible = this.unit.hp > 0;
        }
    }

    setDestinationMarker(visible, x, y) {
        if (this.destinationMarker) {
            this.destinationMarker.visible = visible;
            if (visible && x !== undefined && y !== undefined) {
                // Initial setup when target is set
                const dir = new THREE.Vector3(x - this.unit.x, 0, y - this.unit.y).normalize();
                this.destinationMarker.setDirection(dir);
                this.destinationMarker.position.set(this.unit.x, 5, this.unit.y);
            }
        }
    }

    _calculateFormationPositions(formationType) {
        const positions = [];
        const shipCount = this.shipMeshes.length;

        // Formation parameters
        const shipSpacing = CONST.SHIP_SIZE * 3;
        const lineLength = 200;

        for (let i = 0; i < shipCount; i++) {
            let x = 0,
                y = 0,
                z = 0;

            switch (formationType) {
                case 'spindle': // Diamond shape
                    const numPerSide = Math.ceil(Math.sqrt(shipCount));
                    const row = Math.floor(i / numPerSide);
                    const col = i % numPerSide;
                    const totalRows = Math.ceil(shipCount / numPerSide);

                    x = (col - (numPerSide - 1) / 2) * shipSpacing * 1.5;
                    z = (row - (totalRows - 1) / 2) * shipSpacing * 2;

                    // Make it diamond-like by squeezing the ends
                    if (totalRows > 1) {
                        const normalizedRow = Math.abs((row - (totalRows - 1) / 2) / ((totalRows - 1) / 2));
                        x *= (1 - normalizedRow);
                    }
                    break;

                case 'line': // Horizontal line
                    const shipsPerLine = 25;
                    const lineNum = Math.floor(i / shipsPerLine);
                    const posInLine = i % shipsPerLine;

                    x = (posInLine - shipsPerLine / 2) * (lineLength / shipsPerLine);
                    z = lineNum * shipSpacing * -1.5;
                    break;

                default: // Default to circle if formation is unknown
                    const r = Math.sqrt(i / shipCount) * CONST.UNIT_RADIUS * 2;
                    const theta = i * (Math.PI * (3 - Math.sqrt(5))); // Golden angle for spiral
                    x = r * Math.cos(theta);
                    z = r * Math.sin(theta);
                    break;
            }
            positions.push(new THREE.Vector3(x, y, z));
        }
        return positions;
    }

    arrangeShipsInFormation(formationType) {
        const positions = this._calculateFormationPositions(formationType);
        this.shipMeshes.forEach((ship, i) => {
            ship.position.copy(positions[i]);
            ship.rotation.y = (Math.random() - 0.5) * 0.2; // Slight random rotation
        });
        return positions; // Return for logic use if needed (e.g. lerping)
    }

    lerpShips(initialPositions, targetPositions, progress) {
        this.shipMeshes.forEach((ship, i) => {
            if (initialPositions[i] && targetPositions[i]) {
                ship.position.lerpVectors(initialPositions[i], targetPositions[i], progress);
            }
        });
    }

    snapShips(targetPositions) {
        this.shipMeshes.forEach((ship, i) => {
            if (targetPositions[i]) {
                ship.position.copy(targetPositions[i]);
            }
        });
    }

    destroy() {
        if (!this.meshGroup) return;

        // Dispose all geometries and materials in ship groups
        this.shipMeshes.forEach(shipGroup => {
            shipGroup.children.forEach(mesh => {
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            });
        });

        if (this.selectionRing) {
            if (this.selectionRing.geometry) this.selectionRing.geometry.dispose();
            if (this.selectionRing.material) this.selectionRing.material.dispose();
        }

        if (this.hitAreaRing) {
            if (this.hitAreaRing.geometry) this.hitAreaRing.geometry.dispose();
            if (this.hitAreaRing.material) this.hitAreaRing.material.dispose();
        }

        // Remove label
        if (this.labelObject) {
            this.meshGroup.remove(this.labelObject);
            this.labelObject = null;
        }

        // Remove from scene
        this.game.renderer.remove(this.meshGroup);
        this.meshGroup = null;
        this.shipMeshes = [];

        // Clean up marker
        if (this.destinationMarker) {
            this.game.renderer.remove(this.destinationMarker);
            if (this.destinationMarker.geometry) this.destinationMarker.geometry.dispose();
            if (this.destinationMarker.material) this.destinationMarker.material.dispose();
            this.destinationMarker = null;
        }
    }
}
