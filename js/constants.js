// マップ設定 (3D化に伴い拡大)
export const MAP_WIDTH = 4000;
export const MAP_HEIGHT = 4000;
export const MAP_DEPTH = 4000;

// ユニット設定
export const UNIT_RADIUS = 20;
export const UNIT_TEXT_OFFSET_Y = 28;
export const DEFAULT_SIGHT_SCALE = 3.0;

// 描画設定 (3D)
export const SHIP_SIZE = 4;
export const HP_PER_VISUAL_SHIP = 5;
export const CAMERA_FOV = 45;
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 10000;
export const ZOOM_MIN = 100;
export const ZOOM_MAX = 2000;

// プレイヤー設定
export const PLAYER_1_ID = 1;
export const PLAYER_2_ID = 2;

// カラー設定
export const PLAYER_1_COLOR = '#88ccff';
export const PLAYER_2_COLOR = '#ff8888';
export const SELECTED_UNIT_BORDER_COLOR = '#ffff00';
export const MOVEMENT_RANGE_COLOR = 'rgba(0, 255, 100, 0.1)';
export const ATTACK_RANGE_COLOR = 'rgba(255, 50, 50, 0.1)';
export const ATTACKABLE_HIGHLIGHT_COLOR = 'rgba(255, 0, 0, 0.6)';

// システム設定
export const AI_UPDATE_INTERVAL = 1000; // AIの思考間隔 (ms)

// 陣形定義
export const FORMATIONS = {
    spindle: {
        name: 'スピンドル',
        atkModifier: 1.1,
        defModifier: 1.0,
        moveModifier: 1.0
    },
    line: {
        name: 'ライン',
        atkModifier: 1.2,
        defModifier: 0.9,
        moveModifier: 0.9
    },
    ring: {
        name: 'リング',
        atkModifier: 0.95,
        defModifier: 1.2,
        moveModifier: 0.85
    }
};

// 方向別ダメージ補正
export const DIRECTION_DAMAGE = {
    FRONT: 1.0,      // 0° から ±60°
    SIDE: 1.25,      // ±60° から ±120°
    REAR: 1.5        // ±120° から 180°
};