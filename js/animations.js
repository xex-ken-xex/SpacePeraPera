import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class Animation {
    constructor(duration, onComplete, game) {
        this.duration = duration;
        this.elapsed = 0;
        this.onComplete = onComplete;
        this.isFinished = false;
        this.game = game;
    }

    update(dt) {
        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.elapsed = this.duration;
            this.isFinished = true;
            this.cleanup();
            if (this.onComplete) this.onComplete();
        }
    }

    cleanup() {
        // Override me
    }
}

export class MoveAnimation extends Animation {
    constructor(unit, targetX, targetY, duration = 500, onComplete, game) {
        super(duration, onComplete, game);
        this.unit = unit;
        this.startX = unit.x;
        this.startY = unit.y;
        this.targetX = targetX;
        this.targetY = targetY;
    }

    update(dt) {
        super.update(dt);
        const t = this.elapsed / this.duration;
        // Ease out cubic
        const ease = 1 - Math.pow(1 - t, 3);

        this.unit.x = this.startX + (this.targetX - this.startX) * ease;
        this.unit.y = this.startY + (this.targetY - this.startY) * ease;

        // Sync 3D position immediately for smooth animation
        if (this.unit.update3DPosition) {
            this.unit.update3DPosition();
        }
    }
}

export class BeamAnimation extends Animation {
    constructor(attacker, target, duration = 800, onComplete, game) {
        super(duration, onComplete, game);
        this.attacker = attacker;
        this.target = target;
        this.beams = []; // { mesh, delay, active, startPos, endPos, fired }
        this.effects = []; // { mesh, life, maxLife }

        this._prepareBeams();
    }

    _prepareBeams() {
        if (!this.game.renderer || !this.attacker.shipMeshes) return;

        const targetPos = new THREE.Vector3(this.target.x, 0, this.target.y);

        this.attacker.shipMeshes.forEach(ship => {
            if (!ship.visible) return;

            const shipWorldPos = new THREE.Vector3();
            ship.getWorldPosition(shipWorldPos);

            // Random delay for firing (0 to 300ms) - creates scattered firing effect
            const delay = Math.random() * 300;

            // Random target offset for visual variety
            const randomOffset = new THREE.Vector3(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 20
            );
            const endPos = targetPos.clone().add(randomOffset);

            // Create Beam Mesh (initially invisible)
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                shipWorldPos.x, shipWorldPos.y, shipWorldPos.z,
                endPos.x, endPos.y, endPos.z
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const material = new THREE.LineBasicMaterial({
                color: 0x88ccff,
                linewidth: 1,
                transparent: true,
                opacity: 0
            });

            const beamMesh = new THREE.Line(geometry, material);
            beamMesh.visible = false;
            this.game.renderer.add(beamMesh);

            this.beams.push({
                mesh: beamMesh,
                delay: delay,
                active: false,
                startPos: shipWorldPos,
                endPos: endPos,
                fired: false
            });
        });
    }

    _createMuzzleFlash(pos) {
        const geometry = new THREE.SphereGeometry(2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);
        this.game.renderer.add(mesh);
        this.effects.push({ mesh: mesh, life: 0, maxLife: 200 });
    }

    _createImpact(pos) {
        const geometry = new THREE.SphereGeometry(3, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);
        this.game.renderer.add(mesh);
        this.effects.push({ mesh: mesh, life: 0, maxLife: 300 });
    }

    update(dt) {
        super.update(dt);

        // Update Beams
        this.beams.forEach(beam => {
            if (!beam.fired && this.elapsed >= beam.delay) {
                beam.fired = true;
                beam.active = true;
                beam.mesh.visible = true;
                beam.mesh.material.opacity = 1;
                this._createMuzzleFlash(beam.startPos);
                this._createImpact(beam.endPos);
            }

            if (beam.active) {
                const beamLife = this.elapsed - beam.delay;
                const maxBeamLife = 400; // Beam lasts 400ms
                if (beamLife < maxBeamLife) {
                    beam.mesh.material.opacity = 1 - (beamLife / maxBeamLife);
                } else {
                    beam.mesh.visible = false;
                    beam.active = false;
                }
            }
        });

        // Update Effects (muzzle flashes and impacts)
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.life += dt;
            if (effect.life < effect.maxLife) {
                const t = effect.life / effect.maxLife;
                effect.mesh.scale.setScalar(1 + t * 2);
                effect.mesh.material.opacity = 1 - t;
            } else {
                this.game.renderer.remove(effect.mesh);
                effect.mesh.geometry.dispose();
                effect.mesh.material.dispose();
                this.effects.splice(i, 1);
            }
        }
    }

    cleanup() {
        if (this.game.renderer) {
            this.beams.forEach(beam => {
                this.game.renderer.remove(beam.mesh);
                beam.mesh.geometry.dispose();
                beam.mesh.material.dispose();
            });
            this.effects.forEach(effect => {
                this.game.renderer.remove(effect.mesh);
                effect.mesh.geometry.dispose();
                effect.mesh.material.dispose();
            });
        }
        this.beams = [];
        this.effects = [];
    }
}

export class ExplosionAnimation extends Animation {
    constructor(x, y, duration = 600, onComplete, game) {
        super(duration, onComplete, game);
        this.x = x;
        this.y = y;

        this._createExplosion();
    }

    _createExplosion() {
        if (!this.game.renderer) return;

        const geometry = new THREE.SphereGeometry(5, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, 0, this.y);

        this.game.renderer.add(this.mesh);
    }

    update(dt) {
        super.update(dt);
        if (this.mesh) {
            const t = this.elapsed / this.duration;
            const scale = 1 + t * 10;
            this.mesh.scale.set(scale, scale, scale);
            this.mesh.material.opacity = 1 - t;
        }
    }

    cleanup() {
        if (this.mesh && this.game.renderer) {
            this.game.renderer.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}

export class DamagePopupAnimation extends Animation {
    constructor(x, y, damage, duration = 1000, onComplete, game) {
        super(duration, onComplete, game);
        this.x = x;
        this.y = y;
        this.damage = damage;
        this.labelObject = null;

        this._createPopup();
    }

    _createPopup() {
        if (!this.game.renderer) return;

        const div = document.createElement('div');
        div.className = 'damage-popup';
        div.textContent = `-${this.damage}`;
        div.style.color = '#ff3333';
        div.style.fontSize = '20px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '0 0 5px black';
        div.style.pointerEvents = 'none';
        div.style.opacity = '1';
        div.style.transition = 'opacity 0.5s';

        this.labelObject = new CSS2DObject(div);
        this.labelObject.position.set(this.x, 50, this.y);
        this.game.renderer.add(this.labelObject);
    }

    update(dt) {
        super.update(dt);
        if (this.labelObject) {
            const t = this.elapsed / this.duration;
            // Float up
            this.labelObject.position.y = 50 + t * 50;

            // Fade out in last half
            if (t > 0.5) {
                this.labelObject.element.style.opacity = 1 - (t - 0.5) * 2;
            }
        }
    }

    cleanup() {
        if (this.labelObject && this.game.renderer) {
            this.game.renderer.remove(this.labelObject);
        }
    }
}
