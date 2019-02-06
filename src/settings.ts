let fs = require('fs');
let path = `${__dirname}/settings.txt`;
async function readSettings() {
    let settings = {};
    try {
        settings = readFile(path);
    } catch (error) {
        console.log(error);
    }
    return settings;
}

async function writeSettings(settings: any) {
    try {
        writeFile(path, settings);
    } catch (error) {
        console.log(error);
    }
}

function readFile(srcPath: any) {
    return new Promise(function (resolve, reject) {
        fs.readFile(srcPath, 'utf8', function (err: any, data: any) {
            if (err) {
                reject(err)
            } else {
                resolve(data);
            }
        });
    })
}

function writeFile(savPath: any, data: any) {
    return new Promise(function (resolve, reject) {
        fs.writeFile(savPath, data, function (err: any) {
            if (err) {
                reject(err)
            } else {
                resolve();
            }
        });
    })
}
module.exports.writeAsync = writeSettings;
module.exports.readAsync = readSettings;