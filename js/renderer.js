import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import * as CONST from './constants.js';

export class GameRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container ${containerId} not found`);

        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000020);
        this.scene.fog = new THREE.FogExp2(0x000020, 0.0002);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            CONST.CAMERA_FOV,
            this.width / this.height,
            CONST.CAMERA_NEAR,
            CONST.CAMERA_FAR
        );
        const initialCameraPosition = new THREE.Vector3(-2000, -4000, 2000);
        const initialTarget = new THREE.Vector3(2000, 0, 2000);

        this.camera.position.copy(initialCameraPosition);
        this.camera.lookAt(initialTarget);

        // WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // CSS2D Renderer
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(this.width, this.height);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.container.appendChild(this.labelRenderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = CONST.ZOOM_MIN;
        this.controls.maxDistance = CONST.ZOOM_MAX;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
        this.controls.enableZoom = false; // Disable default zoom
        this.controls.target.copy(initialTarget);

        // Swap mouse buttons: right button rotates, left button pans
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };

        // Custom zoom handling
        this.targetDistance = this.camera.position.distanceTo(this.controls.target);
        this.currentDistance = this.targetDistance;
        this._setupCustomZoom();

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(100, 200, 100);
        this.scene.add(dirLight);

        // Starfield
        this._createStarfield();

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Keyboard State
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };

        // Event Listeners
        window.addEventListener('resize', this._onWindowResize.bind(this));
        window.addEventListener('keydown', (e) => this._onKeyChange(e, true));
        window.addEventListener('keyup', (e) => this._onKeyChange(e, false));

        // Cursor Guide
        this._createCursorGuide();
    }

    _createCursorGuide() {
        const geometry = new THREE.RingGeometry(10, 12, 32);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        this.cursorGuide = new THREE.Mesh(geometry, material);
        this.cursorGuide.visible = false;
        this.scene.add(this.cursorGuide);

        // Range Visualization Group
        this.rangeGroup = new THREE.Group();
        this.scene.add(this.rangeGroup);
    }

    showRangeCircles(x, y, moveRange, attackRange) {
        this.hideRangeCircles();

        // Movement Range (Blue)
        if (moveRange > 0) {
            const moveGeo = new THREE.RingGeometry(moveRange - 2, moveRange + 2, 64);
            moveGeo.rotateX(-Math.PI / 2);
            const moveMat = new THREE.MeshBasicMaterial({
                color: 0x0088ff,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            const moveMesh = new THREE.Mesh(moveGeo, moveMat);
            moveMesh.position.set(x, 2, y);
            this.rangeGroup.add(moveMesh);

            // Fill for movement area
            const moveFillGeo = new THREE.CircleGeometry(moveRange, 64);
            moveFillGeo.rotateX(-Math.PI / 2);
            const moveFillMat = new THREE.MeshBasicMaterial({
                color: 0x0044aa,
                transparent: true,
                opacity: 0.1,
                side: THREE.DoubleSide
            });
            const moveFillMesh = new THREE.Mesh(moveFillGeo, moveFillMat);
            moveFillMesh.position.set(x, 1, y);
            this.rangeGroup.add(moveFillMesh);
        }

        // Attack Range (Red)
        if (attackRange > 0) {
            const atkGeo = new THREE.RingGeometry(attackRange - 2, attackRange + 2, 64);
            atkGeo.rotateX(-Math.PI / 2);
            const atkMat = new THREE.MeshBasicMaterial({
                color: 0xff4444,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            const atkMesh = new THREE.Mesh(atkGeo, atkMat);
            atkMesh.position.set(x, 3, y);
            this.rangeGroup.add(atkMesh);
        }
    }

    hideRangeCircles() {
        while (this.rangeGroup.children.length > 0) {
            const child = this.rangeGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.rangeGroup.remove(child);
        }
    }

    _createStarfield() {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        for (let i = 0; i < 5000; i++) {
            vertices.push(
                THREE.MathUtils.randFloatSpread(CONST.MAP_WIDTH * 2),
                THREE.MathUtils.randFloatSpread(2000),
                THREE.MathUtils.randFloatSpread(CONST.MAP_HEIGHT * 2)
            );
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.PointsMaterial({ color: 0xffffff, size: 2, transparent: true, opacity: 0.8 });
        const points = new THREE.Points(geometry, material);
        points.position.set(CONST.MAP_WIDTH / 2, 0, CONST.MAP_HEIGHT / 2);
        this.scene.add(points);
    }

    _onWindowResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
        this.labelRenderer.setSize(this.width, this.height);
    }

    _onKeyChange(e, isDown) {
        this.keys[e.key.toLowerCase()] = isDown;
    }

    _setupCustomZoom() {
        this.renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();

            // Fine-grained zoom: 4% per tick (previously 2%)
            const zoomFactor = 1.04;
            const delta = e.deltaY;

            if (delta > 0) {
                // Zoom out
                this.targetDistance *= zoomFactor;
            } else {
                // Zoom in
                this.targetDistance /= zoomFactor;
            }

            // Clamp to min/max
            this.targetDistance = Math.max(CONST.ZOOM_MIN, Math.min(CONST.ZOOM_MAX, this.targetDistance));
        }, { passive: false });
    }

    _updateCameraMovement() {
        const moveSpeed = 20;
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();

        // Get camera forward vector projected on XZ plane
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        // Get camera right vector
        right.crossVectors(forward, this.camera.up).normalize();

        if (this.keys.w) {
            this.camera.position.addScaledVector(forward, moveSpeed);
            this.controls.target.addScaledVector(forward, moveSpeed);
        }
        if (this.keys.s) {
            this.camera.position.addScaledVector(forward, -moveSpeed);
            this.controls.target.addScaledVector(forward, -moveSpeed);
        }
        if (this.keys.a) {
            this.camera.position.addScaledVector(right, -moveSpeed);
            this.controls.target.addScaledVector(right, -moveSpeed);
        }
        if (this.keys.d) {
            this.camera.position.addScaledVector(right, moveSpeed);
            this.controls.target.addScaledVector(right, moveSpeed);
        }
    }

    render() {
        this._updateCameraMovement();

        // Smooth zoom interpolation
        this.currentDistance += (this.targetDistance - this.currentDistance) * 0.1;

        // Update camera position to maintain distance from target
        const direction = new THREE.Vector3();
        direction.subVectors(this.camera.position, this.controls.target).normalize();
        this.camera.position.copy(this.controls.target).addScaledVector(direction, this.currentDistance);

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    getRayIntersection(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, target);

        if (target) {
            if (this.cursorGuide) {
                this.cursorGuide.visible = true;
                this.cursorGuide.position.copy(target);
                this.cursorGuide.position.y = 5;
            }
            return { x: target.x, y: target.z };
        }

        if (this.cursorGuide) this.cursorGuide.visible = false;
        return null;
    }

    raycastObjects(clientX, clientY, objects) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        return this.raycaster.intersectObjects(objects, true);
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }
}
