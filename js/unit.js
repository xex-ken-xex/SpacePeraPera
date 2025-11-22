import * as CONST from './constants.js';
import * as COORD from './coordUtils.js';
import { UnitView } from './unitView.js';
import { BeamAnimation, DamagePopupAnimation } from './animations.js';

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
        this._state = STATE.IDLE;
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

        // View
        this.view = new UnitView(this, game);
    }

    get state() {
        return this._state;
    }

    set state(newState) {
        if (this._state !== newState) {
            this._state = newState;
            if (this.game.selectedUnit === this) {
                this.game.ui.updateSelectedUnitInfo(this);
            }
        }
    }

    get meshGroup() {
        return this.view.meshGroup;
    }

    get shipMeshes() {
        return this.view.shipMeshes;
    }

    setFormation(formationType) {
        if (this.formation === formationType && !this.isChangingFormation) {
            return; // No change needed
        }
        this.formation = formationType;
        this.shipInitialPositions = this.view.shipMeshes.map(ship => ship.position.clone());
        this.shipTargetPositions = this.view._calculateFormationPositions(formationType);
        this.isChangingFormation = true;
        this.formationTransitionTime = 0;
    }

    setSelected(isSelected) {
        this.view.updateVisuals(isSelected, true);
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
                if (this.target) {
                    this.state = STATE.ATTACKING;
                } else {
                    this._scanAndEngage();
                }
                break;
        }
    }

    _updateRotation(dt) {
        let angleDiff = this.targetHeading - this.heading;
        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const maxTurn = this.turnSpeed * (dt / 1000);
        if (Math.abs(angleDiff) < maxTurn) {
            this.heading = this.targetHeading;
        } else {
            this.heading += Math.sign(angleDiff) * maxTurn;
        }
        // Normalize heading
        while (this.heading > Math.PI) this.heading -= 2 * Math.PI;
        while (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }

    _updateFormationChange(dt) {
        this.formationTransitionTime += dt;
        const progress = Math.min(this.formationTransitionTime / this.formationTransitionDuration, 1.0);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        this.view.lerpShips(this.shipInitialPositions, this.shipTargetPositions, easedProgress);
        if (progress >= 1.0) {
            this.isChangingFormation = false;
            this.view.snapShips(this.shipTargetPositions);
        }
    }

    _scanAndEngage() {
        if (this.attackCooldown > 0) return;
        // 1. Enemies within attack range
        const enemiesInRange = this.game.units.filter(u =>
            u.owner !== this.owner && u.hp > 0 && COORD.distance(this.x, this.y, u.x, u.y) <= this.range
        );
        if (enemiesInRange.length > 0) {
            let closest = enemiesInRange[0];
            let minDist = COORD.distance(this.x, this.y, closest.x, closest.y);
            for (let i = 1; i < enemiesInRange.length; i++) {
                const e = enemiesInRange[i];
                const d = COORD.distance(this.x, this.y, e.x, e.y);
                if (d < minDist) {
                    minDist = d;
                    closest = e;
                }
            }
            this.target = closest;
            this.state = STATE.ATTACKING;
            this.view.setDestinationMarker(false);
            return;
        }
        // 2. Enemies visible to allies
        const allies = this.game.units.filter(u => u.owner === this.owner && u.hp > 0);
        const visibleSet = new Set();
        for (const ally of allies) {
            const visible = this.game.units.filter(u =>
                u.owner !== this.owner && u.hp > 0 && COORD.distance(ally.x, ally.y, u.x, u.y) <= ally.sightRange
            );
            for (const v of visible) visibleSet.add(v);
        }
        const visibleEnemies = Array.from(visibleSet);
        if (visibleEnemies.length > 0) {
            let closest = visibleEnemies[0];
            let minDist = COORD.distance(this.x, this.y, closest.x, closest.y);
            for (let i = 1; i < visibleEnemies.length; i++) {
                const e = visibleEnemies[i];
                const d = COORD.distance(this.x, this.y, e.x, e.y);
                if (d < minDist) {
                    minDist = d;
                    closest = e;
                }
            }
            this.target = closest;
            this.targetPosition = { x: closest.x, y: closest.y };
            this.state = STATE.MOVING;
            this.view.setDestinationMarker(true, closest.x, closest.y);
        }
    }

    _handleMovement(dt) {
        if (!this.targetPosition) {
            this.state = STATE.IDLE;
            return;
        }
        const dist = COORD.distance(this.x, this.y, this.targetPosition.x, this.targetPosition.y);
        if (dist < 5) {
            this.x = this.targetPosition.x;
            this.y = this.targetPosition.y;
            this.state = STATE.IDLE;
            this.view.setDestinationMarker(false);
            return;
        }
        const effectiveStats = this.getEffectiveStats();
        const moveSpeed = effectiveStats.move;
        const travelDist = Math.min(dist, moveSpeed * (dt / 1000));
        const angle = Math.atan2(this.targetPosition.y - this.y, this.targetPosition.x - this.x);
        this.targetHeading = angle;
        let angleDiff = this.targetHeading - this.heading;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const angleTolerance = dist < 50 ? Math.PI : Math.PI / 2;
        if (Math.abs(angleDiff) < angleTolerance) {
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
        const angleToTarget = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.targetHeading = angleToTarget;
        if (dist > this.range) {
            this.targetPosition = { x: this.target.x, y: this.target.y };
            this.state = STATE.MOVING;
        } else {
            let angleDiff = this.targetHeading - this.heading;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            if (this.attackCooldown <= 0 && Math.abs(angleDiff) < Math.PI / 6) {
                this.performAttack(this.target);
            }
        }
    }

    moveTo(x, y) {
        this.targetPosition = { x, y };
        this.state = STATE.MOVING;
        this.target = null;
        this.view.setDestinationMarker(true, x, y);
    }

    attackTarget(targetUnit) {
        if (targetUnit && targetUnit.hp > 0) {
            this.target = targetUnit;
            this.state = STATE.ATTACKING;
            this.view.setDestinationMarker(false);
        }
    }

    update3DPosition() {
        this.view.updatePosition();
    }

    updateVisuals(isSelected, isVisible = true) {
        this.view.updateVisuals(isSelected, isVisible);
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

    // ターゲットへの攻撃方向を計算(ラジアン)
    getAttackDirection(target) {
        const angleToTarget = Math.atan2(target.y - this.y, target.x - this.x);
        let angleDiff = angleToTarget - this.heading;
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
        const effectiveStats = this.getEffectiveStats();
        const targetStats = target.getEffectiveStats();
        let damage = Math.floor(effectiveStats.atk * (this.hp / this.maxHp) - targetStats.def * 0.5);
        if (damage < 10) damage = 10;
        const attackAngle = target.getAttackDirection(this);
        const directionMultiplier = target.getDirectionalDamageMultiplier(attackAngle);
        damage = Math.floor(damage * directionMultiplier);
        target.takeDamage(damage);
        this.attackCooldown = this.attackSpeed;
        let directionText = '';
        if (directionMultiplier > 1.0) {
            directionText = ` (方向ボーナス×${directionMultiplier})`;
        }
        this.game.ui.setMessage(`${this.name} の攻撃！ ${target.name} に ${damage} のダメージ！${directionText}`);
        const anim = new BeamAnimation(this, target, 500, null, this.game);
        this.game.animations.push(anim);
    }

    takeDamage(amount) {
        this.hp -= amount;
        const anim = new DamagePopupAnimation(this.x, this.y, amount, 1000, null, this.game);
        this.game.animations.push(anim);
        if (this.hp <= 0) {
            this.hp = 0;
            this.game.ui.setMessage(`${this.name} は撃沈しました！`);
            this.destroy();
            this.game.checkWinCondition();
        }
    }

    destroy() {
        this.view.destroy();
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