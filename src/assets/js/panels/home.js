/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')
const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const os = require('os')

class Home {
    static id = "home";
    
    async init(config) {
        this.config = config;
        this.db = new database();
        
        await this.applyMinecraftFix();
        
        this.news()
        this.socialLick()
        await this.instancesSelect()
        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'))
        
        this.initSkinClickHandler()
    }

    // ============ PARTIE 1: GESTION DES CHEMINS ============

    getDataPath() {
        const username = os.userInfo().username;
        const basePath = process.platform === 'win32' 
            ? `C:\\Users\\${username}\\AppData\\Roaming\\Zendariom Games Launcher`
            : process.platform === 'darwin'
                ? `/Users/${username}/Library/Application Support/Zendariom Games Launcher`
                : `/home/${username}/Zendariom Games Launcher`;
        
        console.log('📁 CHEMIN RACINE du launcher:', basePath);
        return basePath;
    }

    getInstancePath() {
        const basePath = this.getDataPath();
        console.log('📁 Chemin instance:', basePath);
        return basePath;
    }

    async ensureDirectoriesExist() {
        try {
            const basePath = this.getDataPath();
            
            console.log('🔍 Vérification des permissions pour:', basePath);
            
            const parentDir = path.dirname(basePath);
            try {
                await fs.access(parentDir);
                console.log('✅ Répertoire parent existe:', parentDir);
            } catch (error) {
                console.error('❌ Répertoire parent inaccessible:', parentDir);
                throw new Error(`Le répertoire parent ${parentDir} n'est pas accessible.`);
            }
            
            const directories = [
                basePath,
                path.join(basePath, 'mods'),
                path.join(basePath, 'config'),
                path.join(basePath, 'resourcepacks'),
                path.join(basePath, 'shaderpacks'),
                path.join(basePath, 'saves'),
                path.join(basePath, 'logs'),
                path.join(basePath, 'screenshots'),
                path.join(basePath, 'assets'),
                path.join(basePath, 'libraries'),
                path.join(basePath, 'versions'),
                path.join(basePath, 'runtime'),
                path.join(basePath, 'cache'),
                path.join(basePath, 'temp'),
                path.join(basePath, '.fabric'),
                path.join(basePath, '.fabric', 'remappedJars'),
                path.join(basePath, '.fabric', 'processedMods'),
                path.join(basePath, '.fabric-cache')
            ];
            
            console.log('📁 Création des dossiers...');
            
            let createdCount = 0;
            let errorCount = 0;
            
            for (const dir of directories) {
                try {
                    await fs.mkdir(dir, { recursive: true });
                    console.log(`✅ Dossier créé: ${path.relative(basePath, dir) || 'racine'}`);
                    createdCount++;
                } catch (error) {
                    if (error.code !== 'EEXIST') {
                        errorCount++;
                        console.warn(`⚠️ Impossible de créer ${dir}:`, error.message);
                        
                        if (dir === basePath) {
                            throw new Error(`Impossible de créer le dossier principal: ${error.message}`);
                        }
                    } else {
                        console.log(`✅ Dossier existe déjà: ${path.relative(basePath, dir) || 'racine'}`);
                        createdCount++;
                    }
                }
            }
            
            console.log(`📊 Résultat: ${createdCount} dossiers créés, ${errorCount} erreurs`);
            
            try {
                const testFile = path.join(basePath, 'launcher_test.tmp');
                await fs.writeFile(testFile, 'test écriture launcher');
                await fs.unlink(testFile);
                console.log('✅ Permissions d\'écriture OK dans la racine');
            } catch (error) {
                console.error('❌ Erreur test d\'écriture:', error.message);
                
                const solutions = [
                    '1. Exécutez le launcher en tant qu\'administrateur',
                    '2. Vérifiez que le dossier n\'est pas en lecture seule',
                    '3. Vérifiez les permissions Windows sur le dossier',
                    '4. Essayez de supprimer manuellement le dossier et laissez le launcher le recréer',
                    '5. Vérifiez qu\'aucun programme n\'utilise le dossier'
                ];
                
                throw new Error(`Permission refusée dans ${basePath}\n\nSolutions:\n${solutions.join('\n')}`);
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Erreur création des dossiers:', error);
            
            this.showUserError(
                'Erreur de configuration',
                'Impossible de créer les dossiers nécessaires.',
                `Erreur: ${error.message}\n\nChemin: ${this.getDataPath()}\n\nVeuillez vérifier les permissions d'écriture.`
            );
            return false;
        }
    }

    showUserError(title, message, details = null) {
        console.error(`❌ ${title}: ${message}`);
        if (details) console.error('🔧 Détails techniques:', details);
        
        let popupInstance = new popup();
        popupInstance.openPopup({
            title: title,
            content: this.formatErrorMessage(message, details),
            color: '#ff4444',
            options: true,
            buttons: [
                {
                    text: 'Fermer',
                    action: () => popupInstance.closePopup()
                },
                {
                    text: 'Copier l\'erreur',
                    action: () => {
                        const errorText = `${title}\n\n${message}\n\nDétails: ${details || 'Aucun'}`;
                        navigator.clipboard.writeText(errorText);
                        console.log('✅ Erreur copiée dans le presse-papier');
                    }
                },
                {
                    text: 'Ouvrir Discord',
                    action: () => {
                        shell.openExternal('https://discord.gg/zendariom');
                    }
                },
                {
                    text: 'Ouvrir le dossier',
                    action: () => {
                        const dataPath = this.getDataPath();
                        shell.openPath(path.dirname(dataPath)).then(() => {
                            console.log('✅ Dossier ouvert:', dataPath);
                        });
                    }
                }
            ]
        });
    }

    formatErrorMessage(message, details) {
        let html = `<div style="text-align: left; font-size: 14px; color: #eee; padding: 10px;">`;
        html += `<p style="margin-bottom: 15px; font-size: 16px;"><strong>🚨 ${message}</strong></p>`;
        
        if (details) {
            html += `<div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #ff4444;">`;
            html += `<small style="color: #aaa; display: block; margin-bottom: 5px;">🔍 Détails techniques :</small>`;
            html += `<pre style="font-size: 12px; color: #ddd; margin: 0; overflow: auto; max-height: 150px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px;">${details}</pre>`;
            html += `</div>`;
        }
        
        html += `<div style="margin-top: 20px; padding: 12px; background: rgba(76, 175, 80, 0.1); border-radius: 6px; border-left: 4px solid #4CAF50;">`;
        html += `<p style="margin: 0; color: #a5d6a7; font-size: 13px;">`;
        html += `💡 <strong>Solutions possibles :</strong><br>`;
        html += `• Redémarrez le launcher en tant qu'administrateur<br>`;
        html += `• Vérifiez les permissions du dossier AppData/Roaming<br>`;
        html += `• Contactez le support sur Discord<br>`;
        html += `• Cliquez sur "Ouvrir le dossier" pour vérifier manuellement`;
        html += `</p>`;
        html += `</div>`;
        
        html += `</div>`;
        
        return html;
    }

    async checkCommonErrors() {
        try {
            console.log('🔍 Vérification des erreurs courantes...');
            
            if (!navigator.onLine) {
                this.showUserError(
                    'Pas de connexion internet',
                    'Le launcher nécessite une connexion internet pour fonctionner.',
                    'navigator.onLine = false'
                );
                return false;
            }
            
            const dataPath = this.getDataPath();
            try {
                const freeSpace = await this.getFreeDiskSpace(dataPath);
                const requiredSpace = 2 * 1024 * 1024 * 1024;
                
                if (freeSpace < requiredSpace) {
                    this.showUserError(
                        'Espace disque insuffisant',
                        `Il reste ${(freeSpace / (1024*1024*1024)).toFixed(1)} Go sur le disque. ` +
                        `Minecraft nécessite au moins 2 Go d'espace libre.`,
                        `Espace libre: ${(freeSpace / (1024*1024*1024)).toFixed(2)} Go / 2 Go requis`
                    );
                    return false;
                }
            } catch (err) {
                console.log('⚠️ Impossible de vérifier l\'espace disque:', err.message);
            }
            
            return true;
            
        } catch (error) {
            console.error('Erreur lors de la vérification:', error);
            return true;
        }
    }

    async getFreeDiskSpace(filePath) {
        try {
            const { exec } = require('child_process');
            return new Promise((resolve, reject) => {
                const command = process.platform === 'win32' 
                    ? `wmic logicaldisk where DeviceID="${filePath.substring(0, 2)}" get FreeSpace /value`
                    : `df -k "${path.dirname(filePath)}" | tail -1 | awk '{print $4}'`;
                
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.warn('Impossible de vérifier l\'espace disque:', error);
                        resolve(10 * 1024 * 1024 * 1024);
                    } else {
                        const match = stdout.match(/FreeSpace=(\d+)/) || stdout.match(/\d+/);
                        const freeSpace = match ? parseInt(match[1] || match[0]) : 10000000000;
                        resolve(freeSpace);
                    }
                });
            });
        } catch (error) {
            console.warn('Erreur espace disque:', error);
            return 10 * 1024 * 1024 * 1024;
        }
    }

    initSkinClickHandler() {
        console.log('🎨 Configuration du clic sur le skin...');
        
        let attempts = 0;
        const maxAttempts = 8;
        
        const findSkin = () => {
            attempts++;
            console.log(`🔍 Tentative ${attempts}/${maxAttempts} de trouver le skin...`);
            
            const skinElement = 
                document.querySelector('.player-head') ||
                document.querySelector('.player-avatar') ||
                document.querySelector('.skin-view') ||
                document.querySelector('.minecraft-head') ||
                document.querySelector('.user-avatar') ||
                document.querySelector('.profile-picture') ||
                document.querySelector('img[src*="skin"]') ||
                document.querySelector('img[alt*="skin"]') ||
                document.querySelector('img[src*="avatar"]') ||
                document.querySelector('img[alt*="avatar"]') ||
                document.querySelector('canvas') ||
                document.querySelector('[class*="skin"]') ||
                document.querySelector('[class*="avatar"]') ||
                document.querySelector('[class*="head"]');
            
            if (skinElement) {
                console.log('✅ Élément skin trouvé:', {
                    tag: skinElement.tagName,
                    classe: skinElement.className,
                    id: skinElement.id
                });
                
                this.setupSkinClick(skinElement);
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(findSkin, 1000);
            } else {
                console.log('⚠️ Skin non trouvé après plusieurs tentatives');
                this.createSkinButton();
            }
        };
        
        setTimeout(findSkin, 1500);
    }

    setupSkinClick(element) {
        element.onclick = null;
        
        element.style.cursor = 'pointer';
        element.style.transition = 'all 0.3s ease';
        
        element.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.08)';
            this.style.filter = 'brightness(1.2) drop-shadow(0 0 8px rgba(100, 100, 255, 0.5))';
        });
        
        element.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.filter = 'none';
        });
        
        element.title = 'Cliquez pour ouvrir la configuration du serveur';
        
        element.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log('🎯 Clic sur le skin détecté!');
            this.openConfigWindow();
        });
        
        console.log('✅ Skin configuré avec succès!');
    }

    createSkinButton() {
        const container = document.querySelector('.home-panel') || 
                         document.querySelector('.panel-content') ||
                         document.querySelector('.main-content') ||
                         document.body;
        
        if (!container || document.getElementById('manual-skin-button')) return;
        
        console.log('🛠️ Création d\'un bouton manuel pour le skin...');
        
        const button = document.createElement('div');
        button.id = 'manual-skin-button';
        button.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 14px 24px;
                border-radius: 10px;
                cursor: pointer;
                text-align: center;
                margin: 20px auto;
                max-width: 260px;
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
                border: 2px solid rgba(255, 255, 255, 0.15);
                transition: all 0.3s ease;
                font-weight: bold;
                font-size: 15px;
            ">
                <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <span style="font-size: 20px;">⚙️</span>
                    <span>Ouvrir la Configuration</span>
                </div>
                <div style="font-size: 12px; opacity: 0.8; margin-top: 5px;">Cliquez ici</div>
            </div>
        `;
        
        const innerDiv = button.querySelector('div');
        
        innerDiv.onmouseover = () => {
            innerDiv.style.transform = 'translateY(-3px)';
            innerDiv.style.boxShadow = '0 10px 25px rgba(102, 126, 234, 0.6)';
        };
        
        innerDiv.onmouseout = () => {
            innerDiv.style.transform = 'translateY(0)';
            innerDiv.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
        };
        
        innerDiv.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openConfigWindow();
        };
        
        container.appendChild(button);
        console.log('✅ Bouton manuel créé avec succès');
    }

    openConfigWindow() {
        try {
            const url = 'https://terrarpg.github.io/config/files/instances.json';
            console.log('🌐 Ouverture de la fenêtre de configuration:', url);
            
            this.createConfigWindow(url);
            
        } catch (error) {
            console.error('❌ Erreur ouverture fenêtre:', error);
            this.showUserError(
                'Erreur fenêtre',
                'Impossible d\'ouvrir la fenêtre de configuration.',
                error.message
            );
        }
    }

    createConfigWindow(url) {
        const existingWindow = document.getElementById('config-browser-window');
        if (existingWindow) existingWindow.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'config-browser-window';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.92);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: fadeIn 0.3s ease;
            backdrop-filter: blur(5px);
        `;
        
        const windowDiv = document.createElement('div');
        windowDiv.style.cssText = `
            width: 88%;
            height: 82%;
            background: #1a1a1a;
            border-radius: 12px;
            overflow: hidden;
            border: 2px solid #333;
            box-shadow: 0 0 50px rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
        `;
        
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            background: #2a2a2a;
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
        `;
        
        const title = document.createElement('div');
        title.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; color: white;">
                <span style="font-size: 20px;">🌐</span>
                <span style="font-weight: bold; font-size: 16px;">Configuration du Serveur</span>
            </div>
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: #ff4444;
            color: white;
            border: none;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            font-size: 24px;
            cursor: pointer;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        `;
        
        closeBtn.onmouseover = () => {
            closeBtn.style.background = '#ff6666';
            closeBtn.style.transform = 'scale(1.1)';
        };
        
        closeBtn.onmouseout = () => {
            closeBtn.style.background = '#ff4444';
            closeBtn.style.transform = 'scale(1)';
        };
        
        closeBtn.onclick = () => overlay.remove();
        
        titleBar.appendChild(title);
        titleBar.appendChild(closeBtn);
        
        const addressBar = document.createElement('div');
        addressBar.style.cssText = `
            background: #252525;
            padding: 12px 20px;
            border-bottom: 1px solid #444;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = url;
        urlInput.readOnly = true;
        urlInput.style.cssText = `
            flex: 1;
            background: #333;
            border: 1px solid #555;
            color: #ddd;
            padding: 10px 15px;
            border-radius: 6px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
        `;
        
        const refreshBtn = document.createElement('button');
        refreshBtn.innerHTML = '🔄';
        refreshBtn.title = 'Actualiser';
        refreshBtn.style.cssText = `
            background: #444;
            color: white;
            border: none;
            border-radius: 6px;
            width: 42px;
            height: 42px;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        `;
        
        refreshBtn.onmouseover = () => refreshBtn.style.background = '#555';
        refreshBtn.onmouseout = () => refreshBtn.style.background = '#444';
        
        addressBar.appendChild(urlInput);
        addressBar.appendChild(refreshBtn);
        
        const contentArea = document.createElement('div');
        contentArea.style.cssText = `
            flex: 1;
            overflow: hidden;
            background: white;
            position: relative;
        `;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'config-loading';
        loadingDiv.innerHTML = `
            <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                color: #666;
            ">
                <div style="
                    width: 50px;
                    height: 50px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 20px;
                "></div>
                <div style="font-size: 16px; font-weight: bold;">Chargement de la configuration...</div>
            </div>
        `;
        
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        `;
        iframe.allow = 'fullscreen';
        
        iframe.onload = () => {
            if (loadingDiv.parentNode) {
                contentArea.removeChild(loadingDiv);
            }
            console.log('✅ Configuration chargée dans l\'iframe');
        };
        
        refreshBtn.onclick = () => {
            contentArea.appendChild(loadingDiv);
            iframe.src = iframe.src;
        };
        
        contentArea.appendChild(loadingDiv);
        contentArea.appendChild(iframe);
        
        const actionBar = document.createElement('div');
        actionBar.style.cssText = `
            background: #252525;
            padding: 12px 20px;
            border-top: 1px solid #444;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        `;
        
        const externalBtn = document.createElement('button');
        externalBtn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>🌐</span>
                <span>Ouvrir dans le navigateur</span>
            </div>
        `;
        externalBtn.style.cssText = `
            background: #4a6fa5;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;
        
        externalBtn.onmouseover = () => externalBtn.style.background = '#5b7bb5';
        externalBtn.onmouseout = () => externalBtn.style.background = '#4a6fa5';
        externalBtn.onclick = () => shell.openExternal(url);
        
        actionBar.appendChild(externalBtn);
        
        windowDiv.appendChild(titleBar);
        windowDiv.appendChild(addressBar);
        windowDiv.appendChild(contentArea);
        windowDiv.appendChild(actionBar);
        overlay.appendChild(windowDiv);
        
        document.body.appendChild(overlay);
        
        const escapeHandler = (event) => {
            if (event.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                overlay.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
        
        this.addWindowStyles();
        
        console.log('✅ Fenêtre de configuration ouverte avec succès');
    }

    addWindowStyles() {
        if (document.getElementById('config-window-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'config-window-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        
        document.head.appendChild(style);
    }

    // ============ PARTIE LANCEMENT DU JEU ============

    async startGame() {
        try {
            console.log('=== DÉBUT LANCEMENT ===');
            
            if (!await this.checkCommonErrors()) {
                console.log('❌ Vérifications échouées, annulation');
                return;
            }
            
            if (!await this.ensureDirectoriesExist()) {
                return;
            }
            
            await this.applyMinecraftFix();

            let configClient = await this.db.readData('configClient') || {};
            
            let server = this.getHardcodedServer();

            if (!configClient.account_selected) {
                this.showUserError(
                    'Aucun compte sélectionné',
                    'Veuillez vous connecter avec un compte Minecraft avant de jouer.',
                    'Pas de compte sélectionné'
                );
                return changePanel('login');
            }
            
            let authenticator = await this.db.readData('accounts', configClient.account_selected);
            
            if (!authenticator) {
                this.showUserError(
                    'Compte introuvable',
                    'Le compte sélectionné n\'existe plus.',
                    `ID: ${configClient.account_selected}`
                );
                return changePanel('login');
            }

            let minecraftVersion = '1.20.1';
            let loaderType = 'fabric';
            let loaderVersion = 'latest';

            if (server.loadder) {
                minecraftVersion = server.loadder.minecraft_version || minecraftVersion;
                loaderType = server.loadder.loadder_type || loaderType;
                loaderVersion = server.loadder.loadder_version || loaderVersion;
            }

            const SERVER_FILES_URL = "https://config-20dh.onrender.com/files?instance=zendariom";
            
            // IMPORTANT: Utiliser le chemin .minecraft standard pour les fichiers officiels
            const minecraftPath = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
            const instancePath = this.getDataPath(); // Votre dossier serveur pour mods/config
            
            console.log('📁 Minecraft officiel:', minecraftPath);
            console.log('📁 Instance serveur (mods/config):', instancePath);
            console.log('🌐 URL des fichiers serveur:', SERVER_FILES_URL);

            let playInstanceBTN = document.querySelector('.play-instance');
            let infoStartingBOX = document.querySelector('.info-starting-game');
            let infoStarting = document.querySelector(".info-starting-game-text");
            let progressBar = document.querySelector('.progress-bar');

            if (playInstanceBTN) playInstanceBTN.style.display = "none";
            if (infoStartingBOX) infoStartingBOX.style.display = "block";
            if (progressBar) progressBar.style.display = "";
            if (infoStarting) infoStarting.innerHTML = 'Vérifications en cours...';
            
            this.showServerStatus('preparing', 'Préparation du lancement...');

            try {
                if (infoStarting) infoStarting.innerHTML = 'Téléchargement des fichiers serveur...';
                console.log('📥 Téléchargement des fichiers depuis votre serveur...');
                await this.downloadServerFiles(instancePath, SERVER_FILES_URL);
            } catch (downloadError) {
                this.showUserError(
                    'Erreur de téléchargement',
                    'Impossible de télécharger les fichiers du serveur.',
                    downloadError.message
                );
                this.resetUI(playInstanceBTN, infoStartingBOX, infoStarting);
                return;
            }

            // CONFIGURATION FINALE
            const opt = {
                // Authentification
                url: null,
                authenticator: authenticator,
                
                // CHEMIN .MINECRAFT OFFICIEL pour télécharger Minecraft/Fabric
                path: minecraftPath,
                
                // DOSSIER DU JEU : votre instance avec mods
                gameDir: instancePath,
                
                // Version Minecraft
                version: minecraftVersion,
                
                // Options launcher
                detached: configClient.launcher_config?.closeLauncher == "close-all" ? false : true,
                downloadFileMultiple: configClient.launcher_config?.download_multi || 3,
                intelEnabledMac: configClient.launcher_config?.intelEnabledMac || false,

                // Loader Fabric
                loader: {
                    type: loaderType,
                    build: loaderVersion,
                    enable: true // FORCER l'activation de Fabric
                },

                // Vérification
                verify: true,
                forceUpdate: false,

                // Fichiers ignorés
                ignored: server.ignored || [
                    "logs",
                    "crash-reports",
                    "debug",
                    "*.log",
                    "launcher_*",
                    "hs_err_*"
                ],

                // Assets dans .minecraft
                assetsDir: path.join(minecraftPath, 'assets'),
                
                // Java
                java: {
                    path: configClient.java_config?.java_path || '',
                },

                // ARGUMENTS JVM IMPORTANTS
                JVM_ARGS: [
                    '-XX:+UnlockExperimentalVMOptions',
                    '-XX:+UseG1GC',
                    '-XX:G1NewSizePercent=20',
                    '-XX:G1ReservePercent=20',
                    '-XX:MaxGCPauseMillis=50',
                    '-XX:G1HeapRegionSize=32M',
                    '-DFabricMcEmu= net.minecraft.client.main.Main',
                    // Chemin vers le client jar
                    `-Dminecraft.client.jar=${path.join(minecraftPath, 'versions', minecraftVersion, `${minecraftVersion}.jar`)}`,
                    // Dossier de jeu
                    `-Dfabric.gameDir=${instancePath}`,
                    `-Dminecraft.launcher.brand=Zendariom`,
                    `-Dminecraft.launcher.version=1.0`
                ],
                
                // ARGUMENTS DU JEU
                GAME_ARGS: [
                    '--gameDir', instancePath,
                    '--assetsDir', path.join(minecraftPath, 'assets'),
                    '--version', minecraftVersion,
                    '--accessToken', authenticator.access_token,
                    '--username', authenticator.name,
                    '--uuid', authenticator.uuid,
                    '--width', (configClient.game_config?.screen_size?.width || 854).toString(),
                    '--height', (configClient.game_config?.screen_size?.height || 480).toString()
                ],

                // Résolution
                screen: {
                    width: configClient.game_config?.screen_size?.width || 854,
                    height: configClient.game_config?.screen_size?.height || 480
                },

                // Mémoire
                memory: {
                    min: `${(configClient.java_config?.java_memory?.min || 4) * 1024}M`,
                    max: `${(configClient.java_config?.java_memory?.max || 8) * 1024}M`
                }
            };

            console.log('✅ Configuration finale:');
            console.log('- Path (Minecraft officiel):', opt.path);
            console.log('- GameDir (mods/config):', opt.gameDir);
            console.log('- Version:', opt.version);
            console.log('- Loader activé:', opt.loader.enable);
            console.log('- Loader type:', opt.loader.type);

            console.log('🚀 Lancement de Minecraft...');
            if (infoStarting) infoStarting.innerHTML = 'Lancement du jeu...';
            
            try {
                await this.launchGame(opt, infoStarting, progressBar, playInstanceBTN, infoStartingBOX, server);
            } catch (launchError) {
                this.handleLaunchError(launchError);
            }

        } catch (error) {
            console.log('❌ Erreur fatale lors du démarrage:', error);
            this.showUserError(
                'Erreur de lancement',
                'Une erreur inattendue s\'est produite.',
                error.message
            );
            this.resetUI(
                document.querySelector('.play-instance'),
                document.querySelector('.info-starting-game'),
                document.querySelector(".info-starting-game-text")
            );
        }
    }

    // ============ NOUVELLE MÉTHODE POUR TÉLÉCHARGER LES FICHIERS SERVEUR ============

    async downloadServerFiles(destinationPath, serverUrl) {
        try {
            console.log('📥 Téléchargement depuis votre serveur...');
            console.log('📁 Destination:', destinationPath);
            console.log('🌐 URL:', serverUrl);
            
            const response = await fetch(serverUrl);
            if (!response.ok) {
                throw new Error(`Serveur inaccessible: ${response.status} ${response.statusText}`);
            }
            
            const files = await response.json();
            console.log('📄 Nombre de fichiers:', files.length);
            
            // Afficher les premiers fichiers pour débogage
            if (files.length > 0) {
                console.log('📋 Exemple de fichiers:');
                for (let i = 0; i < Math.min(3, files.length); i++) {
                    console.log(`  - ${files[i].path} (${files[i].size} bytes)`);
                }
            }
            
            if (!Array.isArray(files)) {
                throw new Error('Format de réponse invalide: attendu un tableau de fichiers');
            }
            
            let totalFiles = files.length;
            let downloadedFiles = 0;
            let errors = [];
            
            console.log(`📊 ${totalFiles} fichiers à télécharger depuis votre serveur`);
            
            // Télécharger chaque fichier
            for (const [index, file] of files.entries()) {
                try {
                    if (!file.path || !file.url) {
                        console.log('⚠️ Fichier ignoré (pas de path/url):', file.name);
                        continue;
                    }
                    
                    // Construire l'URL complète (si relative)
                    let fileUrl = file.url;
                    if (file.url.startsWith('/')) {
                        fileUrl = 'https://config-20dh.onrender.com' + file.url;
                    }
                    
                    // Déterminer le chemin de destination complet
                    const filePath = path.join(destinationPath, file.path);
                    const fileDir = path.dirname(filePath);
                    
                    // Créer le dossier si nécessaire
                    await fs.mkdir(fileDir, { recursive: true });
                    
                    // Vérifier si le fichier existe déjà avec la bonne taille
                    const needsDownload = await this.checkFileNeedsDownload(filePath, null, file.size);
                    
                    if (needsDownload) {
                        const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
                        console.log(`⬇️  [${index + 1}/${totalFiles}] ${file.path} (${fileSizeMB} MB)`);
                        
                        await this.downloadSingleFile(fileUrl, filePath);
                        downloadedFiles++;
                        
                        // Mettre à jour l'interface utilisateur
                        const infoStarting = document.querySelector(".info-starting-game-text");
                        if (infoStarting) {
                            const percent = ((downloadedFiles / totalFiles) * 100).toFixed(0);
                            infoStarting.innerHTML = `Téléchargement fichiers serveur ${percent}% (${downloadedFiles}/${totalFiles})`;
                        }
                    } else {
                        console.log(`✅ ${file.path} (déjà présent)`);
                        downloadedFiles++;
                    }
                    
                } catch (error) {
                    errors.push(`${file.path || file.name}: ${error.message}`);
                    console.error(`❌ Erreur ${file.path}:`, error.message);
                }
            }
            
            console.log(`✅ ${downloadedFiles}/${totalFiles} fichiers téléchargés depuis votre serveur`);
            
            if (errors.length > 0) {
                console.error('❌ Erreurs de téléchargement:', errors);
                if (errors.length > 3) {
                    throw new Error(`${errors.length} erreurs de téléchargement. Premières erreurs: ${errors.slice(0, 3).join(', ')}...`);
                } else {
                    throw new Error(`Erreurs: ${errors.join(', ')}`);
                }
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Erreur téléchargement serveur:', error);
            throw error;
        }
    }

    async checkFileNeedsDownload(filePath, expectedHash, expectedSize) {
        try {
            await fs.access(filePath);
            
            // Si on a une taille attendue, vérifier
            if (expectedSize) {
                const stats = await fs.stat(filePath);
                if (stats.size !== expectedSize) {
                    console.log(`📏 Taille différente pour ${path.basename(filePath)}: ${stats.size} vs ${expectedSize}`);
                    return true;
                }
            }
            
            // Si on a un hash attendu, vérifier
            if (expectedHash) {
                const fileBuffer = await fs.readFile(filePath);
                const fileHash = crypto.createHash('sha1').update(fileBuffer).digest('hex');
                if (fileHash !== expectedHash.toLowerCase()) {
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            return true; // Fichier n'existe pas
        }
    }

    async downloadSingleFile(url, filePath) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Écrire le fichier
            await fs.writeFile(filePath, buffer);
            
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            console.log(`✅ Téléchargé: ${path.basename(filePath)} (${fileSizeMB} MB)`);
            
        } catch (error) {
            console.error(`❌ Erreur ${url}:`, error.message);
            throw error;
        }
    }

    resetUI(playInstanceBTN, infoStartingBOX, infoStarting) {
        if (playInstanceBTN) playInstanceBTN.style.display = "flex";
        if (infoStartingBOX) infoStartingBOX.style.display = "none";
        if (infoStarting) infoStarting.innerHTML = "Prêt";
    }

    async applyMinecraftFix() {
        try {
            const librariesPath = path.join(__dirname, '../node_modules/minecraft-java-core/build/Minecraft/Minecraft-Libraries.js');
            
            if (await this.fileExists(librariesPath)) {
                let content = await fs.readFile(librariesPath, 'utf8');
                
                console.log('🔧 Application du correctif...');
                
                if (content.includes('${this.options.path}/instances/${this.options.instance}')) {
                    console.log('✅ Correctif déjà appliqué');
                    return true;
                }
                
                const oldPattern = /path:\s*this\.options\.instance\s*\?\s*`instances\/\$\{this\.options\.instance\}\/\$\{asset\.path\}`\s*:\s*asset\.path,/g;
                
                const newCode = `path: this.options.instance
                    ? \`\${this.options.path}/instances/\${this.options.instance}/\${asset.path}\`
                    : \`\${this.options.path}/\${asset.path}\`,`;
                
                if (content.match(oldPattern)) {
                    content = content.replace(oldPattern, newCode);
                    await fs.writeFile(librariesPath, content, 'utf8');
                    console.log('✅ Correctif appliqué !');
                    return true;
                }
                return false;
            } else {
                console.log('❌ Fichier introuvable');
                return false;
            }
        } catch (error) {
            console.log('❌ Erreur correctif:', error);
            return false;
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async news() {
        let newsElement = document.querySelector('.news-list');
        let news = await config.getNews().then(res => res).catch(err => false);
        if (news) {
            if (!news.length) {
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block');
                blockNews.innerHTML = `
                    <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
                        <div class="header-text">
                            <div class="title">Aucun news disponible.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Janvier</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Vous pourrez suivre ici toutes les news.</p>
                        </div>
                    </div>`
                newsElement.appendChild(blockNews);
            } else {
                for (let News of news) {
                    let date = this.getdate(News.publish_date)
                    let blockNews = document.createElement('div');
                    blockNews.classList.add('news-block');
                    blockNews.innerHTML = `
                        <div class="news-header">
                            <img class="server-status-icon" src="assets/images/icon.png">
                            <div class="header-text">
                                <div class="title">${News.title}</div>
                            </div>
                            <div class="date">
                                <div class="day">${date.day}</div>
                                <div class="month">${date.month}</div>
                            </div>
                        </div>
                        <div class="news-content">
                            <div class="bbWrapper">
                                <p>${News.content.replace(/\n/g, '</br>')}</p>
                                <p class="news-author">Auteur - <span>${News.author}</span></p>
                            </div>
                        </div>`
                    newsElement.appendChild(blockNews);
                }
            }
        } else {
            let blockNews = document.createElement('div');
            blockNews.classList.add('news-block');
            blockNews.innerHTML = `
                <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
                        <div class="header-text">
                            <div class="title">Error.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Janvier</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Impossible de contacter le serveur des news.</p>
                        </div>
                    </div>`
            newsElement.appendChild(blockNews);
        }
    }

    socialLick() {
        let socials = document.querySelectorAll('.social-block')

        socials.forEach(social => {
            social.addEventListener('click', e => {
                shell.openExternal(e.target.dataset.url)
            })
        });
    }

    createMissingStatusElements() {
        console.log('🔧 Création des éléments de statut...');
        
        if (document.querySelector('.server-status-container')) {
            console.log('✅ Éléments déjà existants');
            return;
        }
        
        const possibleContainers = [
            document.querySelector('.home-panel'),
            document.querySelector('.main-content'), 
            document.querySelector('.panel-content'),
            document.querySelector('.home-container'),
            document.querySelector('.container'),
            document.body
        ];
        
        const container = possibleContainers.find(el => el !== null);
        
        if (!container) {
            console.log('❌ Aucun conteneur');
            return;
        }
        
        const statusContainer = document.createElement('div');
        statusContainer.className = 'server-status-container';
        statusContainer.style.cssText = `
            background: #2c2f33;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #36b030;
            color: white;
            font-family: Arial, sans-serif;
        `;
        
        statusContainer.innerHTML = `
            <div class="server-status-info">
                <div class="server-status-text" style="font-size: 18px; font-weight: bold; color: #36b030;">
                    🟢 Chargement...
                </div>
                <div class="server-details" style="margin-top: 10px; font-size: 14px;">
                    <span class="player-count">Joueurs: 0/100</span> | 
                    <span class="server-ip">IP: Chargement...</span>
                </div>
            </div>
        `;
        
        container.prepend(statusContainer);
        console.log('✅ Éléments créés');
        
        return statusContainer;
    }

    getHardcodedServer() {
        console.log('🎯 Chargement du serveur en dur...');
        
        const server = {
            name: "zendariom",
            url: "https://config-20dh.onrender.com/files?instance=zendariom",
            loadder: {
                minecraft_version: "1.20.1",
                loadder_type: "fabric",
                loadder_version: "latest"
            },
            verify: true,
            ignored: [
                "config",
                "logs",
                "resourcepacks",
                "options.txt",
                "optionsof.txt"
            ],
            whitelist: ["Luuxis"],
            whitelistActive: false,
            status: {
                nameServer: "ZENDARIOM",
                ip: "91.197.6.16:26710",
                port: 26710
            }
        };
        
        console.log('📦 Serveur chargé');
        return server;
    }

    async instancesSelect() {
        try {
            console.log('🔍 Début instancesSelect()');
            
            this.createMissingStatusElements();
            
            let configClient = await this.db.readData('configClient') || {};
            
            let server = this.getHardcodedServer();
            
            configClient.instance_selct = "zendariom";
            await this.db.updateData('configClient', configClient);
            
            console.log('🎯 Serveur sélectionné: zendariom');
            
            let instanceSelect = document.querySelector('.instance-select');
            if (instanceSelect) {
                instanceSelect.style.display = 'none';
            }
            
            let instanceBTN = document.querySelector('.play-instance');
            if (instanceBTN) {
                instanceBTN.style.paddingRight = '0';
            }
            
            console.log('🚀 Vérification statut...');
            await this.checkAndDisplayServerStatus(server);

            if (instanceBTN) {
                instanceBTN.addEventListener('click', async e => {
                    this.startGame();
                });
            }

            if (this.statusInterval) {
                clearInterval(this.statusInterval);
            }
            
            this.statusInterval = setInterval(async () => {
                console.log('🔄 Actualisation statut...');
                await this.checkAndDisplayServerStatus(server);
            }, 30000);

        } catch (error) {
            console.log('❌ Erreur instancesSelect:', error);
            const server = this.getHardcodedServer();
            await this.checkAndDisplayServerStatus(server);
        }
    }

    async checkAndDisplayServerStatus(server) {
        try {
            if (!server || !server.status) {
                await this.showServerStatus('offline', 'Configuration manquante');
                return;
            }

            const statusConfig = server.status;
            console.log('🔍 Vérification statut:', statusConfig);

            await this.showServerStatus('checking', 'Vérification...');

            const realTimeStatus = await this.getRealTimeServerStatus(statusConfig);
            
            const finalStatus = {
                ...statusConfig,
                online: realTimeStatus.online,
                players: realTimeStatus.players || { online: 0, max: 100 }
            };

            console.log('📊 Statut final:', finalStatus);
            await this.showServerStatus(finalStatus);

        } catch (error) {
            console.log('❌ Erreur vérification:', error);
            await this.showServerStatus('error', 'Erreur');
        }
    }

    async getRealTimeServerStatus(statusConfig) {
        try {
            if (!statusConfig.ip && !statusConfig.port) {
                return { online: false, players: { online: 0, max: 100 } };
            }

            let host = statusConfig.ip;
            
            if (host && !host.includes(':') && statusConfig.port) {
                host = `${host}:${statusConfig.port}`;
            }

            console.log('🌐 Vérification:', host);

            const response = await fetch(`https://api.mcstatus.io/v2/status/java/${host}`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'MinecraftLauncher/1.0'
                }
            });

            if (response && response.ok) {
                const data = await response.json();
                console.log('✅ Statut API:', data);
                
                return {
                    online: data.online || false,
                    players: {
                        online: data.players?.online || 0,
                        max: data.players?.max || 100
                    }
                };
            } else {
                console.log('❌ Réponse non-OK:', response?.status);
                return { online: false, players: { online: 0, max: 100 } };
            }

        } catch (error) {
            console.log('❌ Erreur API:', error);
            return { online: false, players: { online: 0, max: 100 } };
        }
    }

    async showServerStatus(status, customMessage = null) {
        try {
            console.log('🔄 Affichage statut:', status);
            
            this.createMissingStatusElements();
            
            const statusText = document.querySelector('.server-status-text');
            const playerCount = document.querySelector('.player-count');
            const serverIp = document.querySelector('.server-ip');
            
            if (!statusText) {
                console.log('❌ Éléments introuvables');
                return;
            }
            
            let statusInfo = {
                text: 'Statut inconnu',
                color: '#888888',
                players: '0/0',
                ip: 'Non disponible'
            };
            
            if (customMessage) {
                statusInfo.text = customMessage;
                statusInfo.color = '#ff4444';
            } else if (status === 'checking') {
                statusInfo.text = '🔄 Vérification...';
                statusInfo.color = '#ffaa00';
            } else if (typeof status === 'string') {
                switch(status.toLowerCase()) {
                    case 'online':
                        statusInfo.text = '🟢 Serveur en ligne';
                        statusInfo.color = '#36b030';
                        break;
                    case 'offline':
                        statusInfo.text = '🔴 Serveur hors ligne';
                        statusInfo.color = '#ff4444';
                        break;
                    default:
                        statusInfo.text = status;
                }
            } else if (typeof status === 'object' && status !== null) {
                const serverName = status.nameServer || 'Serveur';
                
                if (status.online) {
                    statusInfo.text = `🟢 ${serverName}`;
                    statusInfo.color = '#36b030';
                    statusInfo.players = `${status.players?.online || 0}/${status.players?.max || 100}`;
                } else {
                    statusInfo.text = `🔴 ${serverName}`;
                    statusInfo.color = '#ff4444';
                    statusInfo.players = '0/0';
                }
                
                statusInfo.ip = status.ip || 'Non disponible';
            }
            
            statusText.textContent = statusInfo.text;
            statusText.style.color = statusInfo.color;
            
            if (playerCount) {
                playerCount.textContent = `Joueurs: ${statusInfo.players}`;
            }
            
            if (serverIp) {
                serverIp.textContent = `IP: ${statusInfo.ip}`;
            }
            
            console.log('✅ Statut affiché');
            
        } catch (error) {
            console.log('❌ Erreur affichage:', error);
        }
    }

    async launchGame(opt, infoStarting, progressBar, playInstanceBTN, infoStartingBOX, server) {
        return new Promise((resolve, reject) => {
            try {
                const launch = new Launch();

                let lastProgress = 0;
                let lastTime = Date.now();
                let currentSpeed = 0;

                this.createSpeedDisplay();

                launch.on('progress', (progress, size, element) => {
                    let percent = ((progress / size) * 100).toFixed(0);
                    
                    const now = Date.now();
                    const timeDiff = (now - lastTime) / 1000;
                    const progressDiff = progress - lastProgress;
                    
                    if (timeDiff > 0.5) {
                        currentSpeed = progressDiff / timeDiff;
                        lastProgress = progress;
                        lastTime = now;
                        
                        this.updateSpeedDisplay(currentSpeed);
                    }
                    
                    if (infoStarting) {
                        let speedText = this.formatSpeed(currentSpeed);
                        if (element) {
                            infoStarting.innerHTML = `Téléchargement Minecraft ${percent}% (${element}) - ${speedText}`;
                        } else {
                            infoStarting.innerHTML = `Téléchargement Minecraft ${percent}% - ${speedText}`;
                        }
                    }
                    if (progressBar) {
                        progressBar.value = progress;
                        progressBar.max = size;
                    }
                    
                    console.log(`Téléchargement Minecraft ${percent}% - Vitesse: ${this.formatSpeed(currentSpeed)}`);
                    
                    ipcRenderer.send('main-window-progress', { progress, size });
                });

                launch.on('check', (progress, size, element) => {
                    let percent = ((progress / size) * 100).toFixed(0);
                    if (infoStarting) infoStarting.innerHTML = `Vérification ${percent}% (${element || 'fichiers'})`;
                    if (progressBar) {
                        progressBar.value = progress;
                        progressBar.max = size;
                    }
                    console.log(`Vérification ${percent}%`);
                    ipcRenderer.send('main-window-progress', { progress, size });
                });

                launch.on('extract', (extract) => {
                    if (infoStarting) infoStarting.innerHTML = 'Extraction...';
                    console.log('📦 Extraction en cours');
                    ipcRenderer.send('main-window-progress-load');
                });

                launch.on('estimated', (time) => {
                    let hours = Math.floor(time / 3600);
                    let minutes = Math.floor((time - hours * 3600) / 60);
                    let seconds = Math.floor(time - hours * 3600 - minutes * 60);
                    console.log(`Temps total estimé: ${hours}h ${minutes}m ${seconds}s`);
                });

                launch.on('speed', (speed) => {
                    let speedInMB = (speed / 1048576).toFixed(2);
                    console.log(`Vitesse actuelle: ${speedInMB} MB/s`);
                });

                launch.on('patch', (patch) => {
                    if (infoStarting) infoStarting.innerHTML = 'Installation Fabric...';
                    console.log('🔧 Installation de Fabric (depuis serveur officiel)');
                    ipcRenderer.send('main-window-progress-load');
                });

                launch.on('data', (e) => {
                    if (progressBar) progressBar.style.display = "none";
                    if (infoStarting) infoStarting.innerHTML = 'Démarrage Minecraft...';
                    
                    this.removeSpeedDisplay();
                    
                    if (opt.detached === false) {
                        ipcRenderer.send("main-window-hide");
                    }
                    
                    let loaderName = this.getLoaderName(opt.loader.type);
                    new logger(`Minecraft ${opt.version} ${loaderName}`, '#36b030');
                    console.log('✅ Jeu lancé avec succès !');
                    console.log('- Minecraft/Fabric: téléchargés depuis serveurs officiels');
                    console.log('- Mods/config/options.txt: téléchargés depuis votre serveur');
                    resolve();
                });

                launch.on('close', (code) => {
                    ipcRenderer.send('main-window-progress-reset');
                    if (infoStartingBOX) infoStartingBOX.style.display = "none";
                    if (playInstanceBTN) playInstanceBTN.style.display = "flex";
                    if (infoStarting) infoStarting.innerHTML = "Prêt";
                    new logger(pkg.name, '#7289da');
                    
                    this.removeSpeedDisplay();
                    
                    if (opt.detached === false) {
                        ipcRenderer.send("main-window-show");
                    }
                    
                    if (server.status) {
                        this.checkAndDisplayServerStatus(server);
                    }
                    
                    console.log('🔚 Jeu fermé');
                });

                launch.on('error', (err) => {
                    console.log('❌ Erreur lancement:', err);
                    
                    this.removeSpeedDisplay();
                    
                    this.handleLaunchError(err);
                    reject(err);
                });

                console.log('🎯 Début lancement...');
                console.log('📥 Téléchargement Minecraft 1.20.1 et Fabric depuis serveurs officiels...');
                launch.Launch(opt);

            } catch (error) {
                reject(error);
            }
        });
    }

    formatSpeed(bytesPerSecond) {
        if (bytesPerSecond < 1024) {
            return `${bytesPerSecond.toFixed(0)} B/s`;
        } else if (bytesPerSecond < 1048576) {
            return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        } else {
            return `${(bytesPerSecond / 1048576).toFixed(2)} MB/s`;
        }
    }

    createSpeedDisplay() {
        this.removeSpeedDisplay();
        
        const speedDisplay = document.createElement('div');
        speedDisplay.id = 'download-speed-display';
        speedDisplay.style.cssText = `
            position: absolute;
            bottom: -25px;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 12px;
            color: #aaa;
            font-family: Arial, sans-serif;
        `;
        
        const progressContainer = document.querySelector('.progress-bar-container') || 
                                 document.querySelector('.info-starting-game') ||
                                 document.querySelector('.progress-bar').parentNode;
        
        if (progressContainer) {
            progressContainer.style.position = 'relative';
            progressContainer.appendChild(speedDisplay);
        }
        
        console.log('📊 Démarrage du suivi de vitesse...');
    }

    updateSpeedDisplay(speed) {
        const speedDisplay = document.getElementById('download-speed-display');
        if (speedDisplay) {
            speedDisplay.textContent = `Vitesse: ${this.formatSpeed(speed)}`;
        }
    }

    removeSpeedDisplay() {
        const speedDisplay = document.getElementById('download-speed-display');
        if (speedDisplay) {
            speedDisplay.remove();
        }
    }

    handleLaunchError(error) {
        console.log('❌ Gestion erreur:', error);
        let popupError = new popup();
        popupError.openPopup({
            title: 'Erreur de lancement',
            content: error.message,
            color: 'red',
            options: true
        });
        
        let playInstanceBTN = document.querySelector('.play-instance');
        let infoStartingBOX = document.querySelector('.info-starting-game');
        if (playInstanceBTN) playInstanceBTN.style.display = "flex";
        if (infoStartingBOX) infoStartingBOX.style.display = "none";
        
        this.showServerStatus('error', error.message);
    }

    getJVMArgs(loaderType, customArgs = []) {
        let baseArgs = [
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+UseG1GC',
            '-XX:G1NewSizePercent=20',
            '-XX:G1ReservePercent=20',
            '-XX:MaxGCPauseMillis=50',
            '-XX:G1HeapRegionSize=32M'
        ];

        if (loaderType === 'forge') {
            baseArgs.push(
                '-Dfml.ignoreInvalidMinecraftCertificates=true',
                '-Dfml.ignorePatchDiscrepancies=true'
            );
        } else if (loaderType === 'fabric') {
            baseArgs.push(
                '-DFabricMcEmu= net.minecraft.client.main.Main'
            );
        }

        if (customArgs && Array.isArray(customArgs)) {
            baseArgs.push(...customArgs);
        }

        return baseArgs;
    }

    getLoaderName(loaderType) {
        const names = {
            'none': 'Vanilla',
            'forge': 'Forge',
            'fabric': 'Fabric',
            'quilt': 'Quilt'
        };
        return names[loaderType] || loaderType;
    }

    getdate(e) {
        let date = new Date(e);
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let allMonth = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        return { year: year, month: allMonth[month - 1], day: day };
    }

    destroy() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        
        this.removeSpeedDisplay();
    }
}

export default Home;