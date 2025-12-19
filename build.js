const fs = require("fs");
const builder = require('electron-builder')
const JavaScriptObfuscator = require('javascript-obfuscator');
const nodeFetch = require('node-fetch')
const png2icons = require('png2icons');
const Jimp = require('jimp');

const pkg = require('./package.json');
const productName = pkg.preductname || pkg.name;

class Index {
    async init() {
        this.obf = true;
        this.Fileslist = [];
        
        for (let val of process.argv) {
            if (val.startsWith('--icon')) {
                return await this.iconSet(val.split('=')[1]);
            }
            if (val.startsWith('--obf')) {
                this.obf = JSON.parse(val.split('=')[1]);
            }
            if (val.startsWith('--build')) {
                this.Fileslist = this.getFiles("src");
                return await this.buildPlatform();
            }
        }
    }

    async Obfuscate() {
        if (fs.existsSync("./app")) fs.rmSync("./app", { recursive: true });

        for (let path of this.Fileslist) {
            let fileName = path.split('/').pop();
            let extFile = fileName.split(".").pop();
            let folder = path.replace(`/${fileName}`, '').replace('src', 'app');

            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

            if (extFile == 'js') {
                let code = fs.readFileSync(path, "utf8");
                code = code.replace(/src\//g, 'app/');
                if (this.obf) {
                    let obfResult = JavaScriptObfuscator.obfuscate(code, { 
                        optionsPreset: 'medium-obfuscation',
                        target: 'node' 
                    });
                    fs.writeFileSync(`${folder}/${fileName}`, obfResult.getObfuscatedCode(), { encoding: "utf-8" });
                } else {
                    fs.writeFileSync(`${folder}/${fileName}`, code, { encoding: "utf-8" });
                }
            } else {
                fs.copyFileSync(path, `${folder}/${fileName}`);
            }
        }
    }

    async buildPlatform() {
        await this.Obfuscate();
        console.log("Lancement du build Windows...");

        await builder.build({
            config: {
                appId: "com.zendariom.launcher",
                productName: productName,
                directories: { output: "dist" },
                artifactName: "${productName}-Setup-${version}.${ext}",
                extraMetadata: { main: "app/app.js" },
                files: ["app/**/*", "package.json"],
                publish: [{
                    provider: "github",
                    owner: "terrarpg",
                    repo: "Launcher-Game-Zemdariom"
                }],
                win: {
                    target: ["nsis"],
                    icon: "src/assets/images/icon.ico"
                },
                nsis: {
                    oneClick: true,
                    allowToChangeInstallationDirectory: false,
                    createDesktopShortcut: true
                }
                // Les sections Mac et Linux ont été supprimées pour éviter les erreurs
            }
        });
    }

    getFiles(path, file = []) {
        if (fs.existsSync(path)) {
            let files = fs.readdirSync(path);
            for (let i in files) {
                let name = `${path}/${files[i]}`;
                if (fs.statSync(name).isDirectory()) this.getFiles(name, file);
                else file.push(name);
            }
        }
        return file;
    }

    async iconSet(url) {
        let res = await nodeFetch(url);
        let buffer = await res.buffer();
        const image = await Jimp.read(buffer);
        let pngBuffer = await image.resize(256, 256).getBufferAsync(Jimp.MIME_PNG);
        
        if (!fs.existsSync("src/assets/images")) fs.mkdirSync("src/assets/images", { recursive: true });
        fs.writeFileSync("src/assets/images/icon.ico", png2icons.createICO(pngBuffer, png2icons.HERMITE, 0, false));
        fs.writeFileSync("src/assets/images/icon.png", pngBuffer);
    }
}

new Index().init();