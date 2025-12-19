const fs = require("fs");
const builder = require('electron-builder');
const JavaScriptObfuscator = require('javascript-obfuscator');

class Index {
    async init() {
        this.obf = true;
        this.Fileslist = [];
        
        for (let val of process.argv) {
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
        console.log("Démarrage du build Electron...");

        await builder.build({
            publish: 'always', // Force l'envoi vers GitHub
            config: {
                // Les configurations sont lues depuis le package.json
            }
        }).then(() => {
            console.log("Build Windows réussi !");
        }).catch(err => {
            console.error("Erreur de build:", err);
            process.exit(1);
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
}

new Index().init();