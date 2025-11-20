import { Game } from './game.js';
import { cacheUIElements } from './uiUpdater.js';

document.addEventListener('DOMContentLoaded', () => {
    cacheUIElements();
    
    let game = new Game();
    game.startGame();

    const resetBtn = document.getElementById('resetButton');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('ゲームをリセットしますか？')) {
                game = new Game();
                game.startGame();
            }
        });
    }
});