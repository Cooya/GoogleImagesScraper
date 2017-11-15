if(process.argv.length != 5 && (process.argv.length != 6 || process.argv[5] != '--writeOnly')) {
	console.log('Usage : node script.js <inputSheet> <columnToRead> <columnToWrite> [--writeOnly]');
	return;
}

const child_process = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const phantomjs = require('phantomjs').path;
const request = require('request');
const xlsx = require('xlsx');

const token = '26c57ff9717c63185e28c9d9680f701728d08b8e';
const inputFile = process.argv[2];
const columnToRead = process.argv[3].toUpperCase();
const columnToWrite = process.argv[4].toUpperCase();
const scraper = 'resources/scraper.js';
const outputDir = 'output/';
const inputBasename = path.basename(inputFile, path.extname(inputFile));
const resultFile = outputDir + inputBasename + '_out.json';
const outputFile = outputDir + inputBasename + '_out.xlsx';
const delay = 5000;

var scraperProcess;
var entries;
var entryIndex;

if(process.argv[5] == '--writeOnly')
	writeOutputFile(inputFile, outputFile, resultFile);
else
	runScraperServer();

function runner() {
	requestImageToScraper(entries[entryIndex])
	.then(uploadImage)
	.then(function(res) {
		if(res.wait) { // if the program should wait until the next upload
			if(res.reason == 'limit_reached') {
				console.log('[' + new Date().toLocaleTimeString() + '] Upload limit reached. Need to wait ' + res.wait + ' minutes until next upload...');
				writeOutputFile(inputFile, outputFile, resultFile);
			}
			else if(res.reason == 'imgur_down')
				console.log('[' + new Date().toLocaleTimeString() + '] Imgur down. Next try in ' + res.wait + ' minutes...');
			else if(res.reason == 'imgur_over')
				console.log('[' + new Date().toLocaleTimeString() + '] Imgur under heavy load. Next try in ' + res.wait + ' minutes...');
			else if(res.reason == 'upload_failed')
				console.log('[' + new Date().toLocaleTimeString() + '] The upload has failed. Next try in ' + res.wait + ' minutes...');
			else if(res.reason == 'socket_hang_up')
				console.log('[' + new Date().toLocaleTimeString() + '] The socket has hung up. Next try in ' + res.wait + ' minutes...');
			else if(res.reason == 'connection_down')
				console.log('[' + new Date().toLocaleTimeString() + '] The connection seems to be down. Next try in ' + res.wait + ' minutes...');
			else
				console.log('[' + new Date().toLocaleTimeString() + '] Need to ' + res.wait + ' minutes for unknown reason...');
			setTimeout(runner, res.wait * 60000);
		}
		else if(res.bad_image) { // if the scraper retrieves an invalid image or an image not accepted by imgur
			console.log('Bad image retrieved on Google Images. Next try with the next one.')
			entries[entryIndex].imagePos++; // we try to get the next image in Googl Images
			setTimeout(runner, 5000);
		}
		else { // the upload has succeeded
			delete res.imagePos;
			console.log(res);
			fs.appendFileSync(resultFile, JSON.stringify(res) + ',');
			if(++entryIndex == entries.length) {
				console.log('End of uploading process.');
				writeOutputFile(inputFile, outputFile, resultFile);
				console.log('All entries has been processed. Bye !');
				process.exit();
			}
			setTimeout(runner, 5000);
		}
		return Promise.resolve();
	})
	.catch(function(error) { // fatal error, end of program
		if(error.error == 'scraper_down')
			console.log('Web scraper down, end of process.');
		else if(error.error == "scraper_page_error") {
            console.log('The scraper is unable to retrieve the page, maybe due to a weak connection. Trying again...');
            setTimeout(runner, 5000);
        }
		else {
			console.error(error);
			process.exit(1);
		}
	});
}

function runScraperServer() {
	console.log('Starting web scraper server...');
	scraperProcess = child_process.execFile(phantomjs, [path.join(__dirname, scraper)]);

	scraperProcess.on('exit', function(code) {
		console.error('The web scraper has crashed (code = ' + code + '). Restarting the process...');
		setTimeout(runScraperServer, 30000);
	});

	scraperProcess.stderr.on('data', function(data) {
		console.error(data);
	});

	scraperProcess.stdout.on('data', function(data) {
		data = data.trim().split('\n');
		for(var line of data)
			if(line == 'ok') { // server is ready
				console.log('Web scraper ready.');

				entries = getEntries(outputDir, inputFile, resultFile);
				if(!entries.length) {
					console.log('No entry to process, maybe the process is completed.');
					process.exit(0);
				}

				entryIndex = 0;
				runner();
			}
			else
				console.log(line);
	});
}

function requestImageToScraper(entry) {
	return new Promise(function(resolve, reject) {
		if(!entry.imagePos)
			entry.imagePos = 0;
		entry = JSON.stringify(entry);

		var req = http.request({
			hostname: 'localhost',
			port: 8080,
			path: '/',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(entry)
			}
		}, (res) => {
			var data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => {
				if(data == '')
					reject({error: 'scraper_down'});
				else {
					try {
						data = JSON.parse(data);
					}
					catch(e) {
						reject({error: 'response json parse error'});
						return;
					}
					if(data.error)
						reject({error: data.error});
					else
						resolve(data);
				}
			});
		});

		req.on('error', function(err) {
			console.error(err);
			reject({error: 'scraper_down'});
		});

		req.write(entry);
		req.end();
	});
}

function readInputFile(file) {
	if(!fileExists(file)) {
		console.error('Input file "' + file + '" does not exist.');
		process.exit(1);
	}

	var entries = [];
	var sheet = xlsx.readFile(file).Sheets['Sheet1'];
	var keys = Object.keys(sheet);
	for(var key of keys)
		if(key[0] == columnToRead && !sheet[key.replace(columnToRead, columnToWrite)])
			entries.push({keywords: sheet[key].v.trim(), cellId: key});
	return entries;
}

function writeOutputFile(inputFile, outputFile, resultFile) {
	try {
		var resultEntries = JSON.parse('[' + fs.readFileSync(resultFile).toString('utf-8').replace(/.$/, ']'));
	}
	catch(e) {
		console.error(e);
		console.error('Your result file is corrupted, you need to delete it.');
		process.exit(1);
	}
	var workbook = xlsx.readFile(inputFile);
	var sheet = workbook.Sheets['Sheet1'];
	for(var entry of resultEntries) {
		if(entry.cellId && entry.imgurURL)
			sheet[entry.cellId.replace(columnToRead, columnToWrite)] = {v: entry.imgurURL};
		else {
			console.log('Your result file is corrupted.');
			recoverResultFile(resultFile);
			writeOutputFile(inputFile, outputFile, resultFile);
			return;
		}
	}
	xlsx.writeFile(workbook, outputFile);
	console.log('Output spreadsheet updated.');
}

function recoverResultFile(resultFile) {
	console.log('Trying to recover result file...');
	var resultEntries = JSON.parse('[' + fs.readFileSync(resultFile).toString('utf-8').replace(/.$/, ']'));
	var newContent = '';
	for(var entry of resultEntries) {
		if(!entry.cellId || !entry.imgurURL)
			break;
		newContent += JSON.stringify(entry) + ',';
	}
	fs.writeFileSync(resultFile, newContent);
	console.log('Result file recovered successfully.');
	entries = getEntriesFromResultFile(); // update entries from the rectified result file
	entryIndex = 0;
}

function getEntries(outputDir, inputFile, resultFile) {
	if(!fileExists(outputDir))
		fs.mkdirSync(outputDir);

	if(!fileExists(resultFile)) {
		console.log('No result file yet. Reading keywords spreadsheet...');
		return readInputFile(inputFile);
	}
	else {
		console.log('Result file found. Skipping entries already processed...');
		return getEntriesFromResultFile(inputFile, resultFile);
	}
}

function getEntriesFromResultFile(inputFile, resultFile) {

	// list all keys of processed entries in the result file
	var matches = fs.readFileSync(resultFile).toString('utf-8').match(/"cellId":"([A-Z]{1,5}[0-9]+)"/g);
	var processedKeys = [];
	for(var match of matches)
		processedKeys.push(match.match(/[A-Z]{1,5}[0-9]+/)[0]);

	// list all keyword from the input file
	var keywords = readInputFile(inputFile);

	// keep only the keywords not still processed
	var keywordsToProcess = [];
	for(var keyword of keywords)
		if(processedKeys.indexOf(keyword.cellId) == -1)
			keywordsToProcess.push(keyword);
	return keywordsToProcess;
}

function uploadImage(entry) {
	return new Promise(function(resolve, reject) {
		if(!entry.imageURL) {
			entry.imgurURL = 'None image associated.';
			resolve(entry);
			return;
		}

		console.log('Uploading image "' + entry.imageURL + '"...');
		request.post({
			url: 'https://api.imgur.com/3/image',
			auth: {'bearer': token},
			formData: {image: entry.imageURL, type: 'url'},
			timeout: 20000
		}, function(err, httpResponse, body) {
			if(err) {
				if(err.code == 'ETIMEDOUT' || err.code == 'ESOCKETTIMEDOUT') {
					if(err.connect === true) // if true => connection timeout
						resolve({wait: 3, reason: 'imgur_down'}); // try again in 3 minutes
					else // read timeout => the image is not downloaded by the imgur server
						resolve({bad_image: true});
				}
				else if(err.code == 'ENOTFOUND')
					resolve({wait: 1, reason: 'connection_down'});
				else if(err.message == "socket hang up")
					resolve({wait: 1, reason: 'socket_hang_up'});
				else
					reject({error: err});
			}
			else {
				try {
					body = JSON.parse(body);
				}
				catch(e) {
					if(body.indexOf('Imgur is over capacity!' != -1))
						resolve({wait: 3, reason: 'imgur_over'}); // try again in 3 minutes
					else
						reject({error: 'imgur response json parse error', data: body});
					return;
				}
				if(!body.success) { // upload has failed
					if(body.data.error.code == 429)
						resolve({wait: body.data.error.message.match(/wait ([0-9]+) more/)[1], reason: 'limit_reached'});
					else if(body.data.error == 'Unable to process upload!')
						resolve({bad_image: true});
					else if(body.data.error.code == 1003)
						resolve({bad_image: true});
					else if(body.data.error.substring(0, 11) == 'Invalid URL')
						resolve({bad_image: true});
					else
						reject(body);
				}
				else {
					entry.imgurURL = body.data.link;
					resolve(entry);
				}
			}
		});
	});
}

function fileExists(path) {
	try {
		fs.accessSync(path);
		return true;
	} catch(e) {
		return false;
	}
}

function auth() {
	request.get('https://api.imgur.com/oauth2/authorize?client_id=26dd520c168b205&response_type=token', function(err, httpResponse, body) {
		if(err)
			console.error(err);
		else
			console.log(body);
	});
}

function getIntFromStr(str) {
	return parseInt(str.match(/[0-9]+/)[0]);
}