const fs = require('fs');
const path = require('path')

const logsPath = path.join(__dirname, 'logs');

const writeLogs = (content) => {

    fs.writeFile(logsPath, content + '\n', function (err) {
        if (err) {
            return console.log(err);
        }
        console.log("The file was saved!");
    })
}
module.exports = writeLogs