import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as CONST from './constants.js';
import * as COORD from './coordUtils.js';

// ユニットの状態
const STATE = {
    IDLE: 'idle',
    MOVING: 'moving',
    ATTACKING: 'attacking',
    COOLDOWN: 'cooldown',
};

export class Unit {
    constructor(id, name, x, y, owner, blueprint, game) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.owner = owner;
        this.game = game;

        // Stats from blueprint
        const { hp, atk, def, move, range } = blueprint;
        this.maxHp = hp;
        this.hp = hp;
        this.atk = atk;
        this.def = def;
        this.move = move; // Speed per second
        this.range = range;

        this.sightRange = range * CONST.DEFAULT_SIGHT_SCALE;
        this.radius = CONST.UNIT_RADIUS;

        // Real-time properties
        this.state = STATE.IDLE;
        this.target = null; // Target unit for attack
        this.targetPosition = null; // Target position for movement
        this.attackCooldown = 0; // Time until next attack is ready
        this.attackSpeed = 3000; // ms per attack

        // Formation properties
        this.formation = 'line';
        this.heading = 0;
        this.targetHeading = 0;
        this.turnSpeed = Math.PI / 6; // rad/s. 90deg in 3s

        // Formation transition properties
        this.isChangingFormation = false;
        this.formationTransitionTime = 0;
        this.formationTransitionDuration = 4000; // 4 seconds in ms
        this.shipInitialPositions = [];
        this.shipTargetPositions = [];

        // 3D Object
        this.meshGroup = null;
        this.shipMeshes = [];
        this.selectionRing = null;
        this.hitAreaRing = null;
        this.labelObject = null;
        this.destinationMarker = null;

        this._init3DObject();
    }

    setFormation(formationType) {
        if (this.formation === formationType && !this.isChangingFormation) {
            return; // No change needed
        }

        // If changing to a new formation, even during a transition, start a new one.
        this.formation = formationType;

        // Store current positions as the starting point for the new transition
        this.shipInitialPositions = this.shipMeshes.map(ship => ship.position.clone());

        // Calculate new target positions
        this.shipTargetPositions = this._calculateFormationPositions(formationType);

        this.isChangingFormation = true;
        this.formationTransitionTime = 0;
    }

    _init3DObject() {
        this.meshGroup = new THREE.Group();

        const shipCount = 100; // 100 ships per unit
        const color = this.owner === CONST.PLAYER_1_ID ? CONST.PLAYER_1_COLOR : CONST.PLAYER_2_COLOR;

        for (let i = 0; i < shipCount; i++) {
            const shipGroup = this._createDetailedShip(color);
            this.shipMeshes.push(shipGroup);
            this.meshGroup.add(shipGroup);
        }

        this._arrangeShipsInFormation();

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
        div.innerHTML = `
            <div class="name">${this.name}</div>
            <div class="hp-bar"><div class="hp-fill" style="width: 100%"></div></div>
        `;
        this.labelObject = new CSS2DObject(div);
        this.labelObject.position.set(0, 50, 0);
        this.meshGroup.add(this.labelObject);

        // Destination Marker (only for player 1)
        if (this.owner === CONST.PLAYER_1_ID) {
            this.destinationMarker = this._createDestinationMarker();
        }

        if (this.game.renderer) {
            this.game.renderer.add(this.meshGroup);
            if (this.destinationMarker) {
                this.game.renderer.add(this.destinationMarker);
            }
        }

        this.update3DPosition();
    }

    _createDestinationMarker() {
        const color = this.owner === CONST.PLAYER_1_ID ? CONST.PLAYER_1_COLOR : CONST.PLAYER_2_COLOR;
        const geometry = new THREE.ConeGeometry(15, 40, 8);
        geometry.translate(0, 20, 0); // Move origin to the base
        geometry.rotateX(Math.PI); // Point down
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.visible = false;
        return marker;
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

    update(dt) {
        if (this.hp <= 0) return;

        this._updateRotation(dt);

        if (this.isChangingFormation) {
            this._updateFormationChange(dt);
        }

        // Cooldowns
        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }

        // State machine
        switch (this.state) {
            case STATE.MOVING:
                this._handleMovement(dt);
                break;
            case STATE.ATTACKING:
                this._handleAttacking(dt);
                break;
            case STATE.IDLE:
                // If idle with a target, switch to attacking state
                if (this.target) {
                    this.state = STATE.ATTACKING;
                } else {
                    // If no target, scan for enemies to attack automatically
                    this._scanAndEngage();
                }
                break;
        }
    }

    _updateRotation(dt) {
        let angleDiff = this.targetHeading - this.heading;

        // Normalize the angle difference to the range [-PI, PI] for shortest turn
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        const maxTurn = this.turnSpeed * (dt / 1000);

        if (Math.abs(angleDiff) < maxTurn) {
            this.heading = this.targetHeading;
        } else {
            this.heading += Math.sign(angleDiff) * maxTurn;
        }

        // Normalize heading to prevent it from growing indefinitely
        while (this.heading > Math.PI) this.heading -= 2 * Math.PI;
        while (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }

    _updateFormationChange(dt) {
        this.formationTransitionTime += dt;
        const progress = Math.min(this.formationTransitionTime / this.formationTransitionDuration, 1.0);

        // Ease-out progress for a smoother stop
        const easedProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

        this.shipMeshes.forEach((ship, i) => {
            if (this.shipInitialPositions[i] && this.shipTargetPositions[i]) {
                ship.position.lerpVectors(this.shipInitialPositions[i], this.shipTargetPositions[i], easedProgress);
            }
        });

        if (progress >= 1.0) {
            this.isChangingFormation = false;
            // Snap to final positions to avoid floating point inaccuracies
            this.shipMeshes.forEach((ship, i) => {
                if (this.shipTargetPositions[i]) {
                    ship.position.copy(this.shipTargetPositions[i]);
                }
            });
        }
    }

    _scanAndEngage() {
        if (this.attackCooldown > 0) return; // Don't scan if can't attack

        const enemies = this.game.units.filter(u =>
            u.owner !== this.owner &&
            u.hp > 0 &&
            COORD.distance(this.x, this.y, u.x, u.y) <= this.range
        );

        if (enemies.length > 0) {
            // Find the closest enemy
            let closestEnemy = enemies[0];
            let minDistance = COORD.distance(this.x, this.y, closestEnemy.x, closestEnemy.y);

            for (let i = 1; i < enemies.length; i++) {
                const distance = COORD.distance(this.x, this.y, enemies[i].x, enemies[i].y);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestEnemy = enemies[i];
                }
            }
            this.attackTarget(closestEnemy);
        }
    }

    _handleMovement(dt) {
        // AI opportunistic attack logic
        if (this.owner === CONST.PLAYER_2_ID) {
            const enemies = this.game.units.filter(u =>
                u.owner !== this.owner &&
                u.hp > 0 &&
                COORD.distance(this.x, this.y, u.x, u.y) <= this.range
            );

            if (enemies.length > 0) {
                this.targetPosition = null; // Stop moving
                this.state = STATE.IDLE; // Switch to idle to trigger scan/attack
                return;
            }
        }

        if (!this.targetPosition) {
            this.state = STATE.IDLE;
            if (this.destinationMarker) this.destinationMarker.visible = false;
            return;
        }

        const dist = COORD.distance(this.x, this.y, this.targetPosition.x, this.targetPosition.y);
        const effectiveStats = this.getEffectiveStats();
        const moveSpeed = effectiveStats.move / 10; // Adjust speed scaling

        if (dist < 10) { // Arrival threshold
            this.targetPosition = null;
            this.state = this.target ? STATE.ATTACKING : STATE.IDLE;
            if (this.destinationMarker) this.destinationMarker.visible = false;
            return;
        }

        const travelDist = Math.min(dist, moveSpeed * (dt / 1000));
        const angle = Math.atan2(this.targetPosition.y - this.y, this.targetPosition.x - this.x);
        this.targetHeading = angle;

        // Only move forward if facing roughly the correct direction
        let angleDiff = this.targetHeading - this.heading;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (Math.abs(angleDiff) < Math.PI / 2) { // Allow movement within 90 degrees of target
            this.x += Math.cos(this.heading) * travelDist;
            this.y += Math.sin(this.heading) * travelDist;
        }
    }

    _handleAttacking(dt) {
        if (!this.target || this.target.hp <= 0) {
            this.target = null;
            this.state = STATE.IDLE;
            return;
        }

        const dist = COORD.distance(this.x, this.y, this.target.x, this.target.y);

        // Turn to face target
        const angleToTarget = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.targetHeading = angleToTarget;

        if (dist > this.range) {
            // Chase target
            this.targetPosition = { x: this.target.x, y: this.target.y };
            this.state = STATE.MOVING;
        } else {
            // In range, try to attack
            let angleDiff = this.targetHeading - this.heading;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            if (this.attackCooldown <= 0 && Math.abs(angleDiff) < Math.PI / 6) { // Must be facing target to fire
                this.performAttack(this.target);
            }
        }
    }

    moveTo(x, y) {
        this.targetPosition = { x, y };
        this.state = STATE.MOVING;
        this.target = null; // Clear attack target when moving
        if (this.destinationMarker) {
            this.destinationMarker.position.set(x, 5, y);
            this.destinationMarker.visible = true;
        }
    }

    attackTarget(targetUnit) {
        if (targetUnit && targetUnit.hp > 0) {
            this.target = targetUnit;
            this.state = STATE.ATTACKING;
            if (this.destinationMarker) {
                this.destinationMarker.visible = false;
            }
        }
    }

    update3DPosition() {
        if (this.meshGroup) {
            this.meshGroup.position.set(this.x, 0, this.y);
            // Correct heading by -90 degrees to align with model orientation
            this.meshGroup.rotation.y = -this.heading - Math.PI / 2;
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

    _arrangeShipsInFormation() {
        const positions = this._calculateFormationPositions(this.formation);
        this.shipMeshes.forEach((ship, i) => {
            ship.position.copy(positions[i]);
            ship.rotation.y = (Math.random() - 0.5) * 0.2; // Slight random rotation
        });
    }

    updateVisuals(isSelected, isVisible = true) {
        if (!this.meshGroup) return;

        this.meshGroup.visible = isVisible;
        if (!isVisible) return;

        if (this.selectionRing) {
            this.selectionRing.material.opacity = isSelected ? 0.8 : 0;
        }

        const hpRatio = this.hp / this.maxHp;
        const currentShipCount = Math.ceil(hpRatio * this.shipMeshes.length);

        this.shipMeshes.forEach((shipGroup, index) => {
            shipGroup.visible = index < currentShipCount;
        });

        if (this.labelObject) {
            const hpPercent = hpRatio * 100;
            const fill = this.labelObject.element.querySelector('.hp-fill');
            if (fill) fill.style.width = `${hpPercent}%`;

            this.labelObject.visible = this.hp > 0;
        }
    }

    // 陣形による有効ステータスを取得
    getEffectiveStats() {
        const formation = CONST.FORMATIONS[this.formation] || CONST.FORMATIONS.spindle;
        return {
            atk: Math.floor(this.atk * formation.atkModifier),
            def: Math.floor(this.def * formation.defModifier),
            move: Math.floor(this.move * formation.moveModifier)
        };
    }

    // ターゲットへの攻撃方向を計算（ラジアン）
    getAttackDirection(target) {
        // ターゲットへの角度
        const angleToTarget = Math.atan2(target.y - this.y, target.x - this.x);
        // 自分の向きとの差分
        let angleDiff = angleToTarget - this.heading;
        // -π to π の範囲に正規化
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        return Math.abs(angleDiff);
    }

    // 方向別ダメージ倍率を取得
    getDirectionalDamageMultiplier(angleToTarget) {
        const angleDeg = (angleToTarget * 180) / Math.PI;
        if (angleDeg <= 60) {
            return CONST.DIRECTION_DAMAGE.FRONT;
        } else if (angleDeg <= 120) {
            return CONST.DIRECTION_DAMAGE.SIDE;
        } else {
            return CONST.DIRECTION_DAMAGE.REAR;
        }
    }

    performAttack(target) {
        if (this.attackCooldown > 0) return;

        // 陣形による有効ステータスを使用
        const effectiveStats = this.getEffectiveStats();
        const targetStats = target.getEffectiveStats();

        // 基本ダメージ計算
        let damage = Math.floor(effectiveStats.atk * (this.hp / this.maxHp) - targetStats.def * 0.5);
        if (damage < 10) damage = 10;

        // 方向別ダメージボーナス
        const attackAngle = target.getAttackDirection(this);
        const directionMultiplier = target.getDirectionalDamageMultiplier(attackAngle);
        damage = Math.floor(damage * directionMultiplier);

        target.takeDamage(damage);
        this.attackCooldown = this.attackSpeed; // Reset cooldown

        // ダメージメッセージ（方向ボーナス表示）
        let directionText = '';
        if (directionMultiplier > 1.0) {
            directionText = ` (方向ボーナス×${directionMultiplier})`;
        }
        this.game.ui.setMessage(`${this.name} の攻撃！ ${target.name} に ${damage} のダメージ！${directionText}`);

        import('./animations.js').then(module => {
            const anim = new module.BeamAnimation(this, target, 500, null, this.game);
            this.game.animations.push(anim);
        });
    }

    takeDamage(amount) {
        this.hp -= amount;

        import('./animations.js').then(module => {
            const anim = new module.DamagePopupAnimation(this.x, this.y, amount, 1000, null, this.game);
            this.game.animations.push(anim);
        });

        if (this.hp <= 0) {
            this.hp = 0;
            this.game.ui.setMessage(`${this.name} は撃沈しました！`);
            this.destroy();
            // Check victory condition after unit destruction
            this.game.checkWinCondition();
        }
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

    getDebugInfo() {
        const effectiveStats = this.getEffectiveStats();
        const formationName = CONST.FORMATIONS[this.formation]?.name || '不明';
        const headingDeg = Math.round((this.heading * 180) / Math.PI);

        return {
            id: this.id,
            name: this.name,
            owner: this.owner,
            x: Math.round(this.x),
            y: Math.round(this.y),
            hp: this.hp,
            maxHp: this.maxHp,
            atk: this.atk,
            def: this.def,
            move: this.move,
            rng: this.range,
            sight: this.sightRange,
            state: this.state,
            target: this.target ? this.target.id : 'N/A',
            formation: formationName,
            heading: headingDeg,
            effectiveAtk: effectiveStats.atk,
            effectiveDef: effectiveStats.def,
            effectiveMove: effectiveStats.move
        };
    }
}