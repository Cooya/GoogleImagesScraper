const server = require('webserver').create();
const webpage = require('webpage');
const baseUrl = "https://www.google.co.uk/search?tbm=isch&q=";

var page = createPage();
var requestCounter = 0;


server.listen('127.0.0.1:8080', function(request, response) {
	if(requestCounter++ >= 50) {
		console.log('Clearing memory cache of web scraper...');
        page.clearMemoryCache();
		page.close();
		page = createPage();
		requestCounter = 0;
	}

	response.statusCode = 200;
	try {
		var entry = JSON.parse(request.post);
	}
	catch(e) {
		response.write('{"error": "request json parse error"}');
		response.close();
		return;
	}
	getImage(entry, response);
});

console.log('ok'); // ready

function createPage() {
	var page = webpage.create();
	page.onError = function(msg, trace) {
		console.log(msg);
		//phantom.exit(1); // apparently exit() creates problem...
	};
	page.onConsoleMessage = function(msg, lineNum, sourceId) {
		console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
	};
	page.settings.userAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36';
	page.settings.loadImages = false;
    page.settings.loadPlugins = false;
	page.customHeaders = {'Accept-Language': 'en-US,en;q=0.5'};
	return page;
}

function getImage(entry, response) {
	page.open(baseUrl + entry.keywords, function(status) {
		try {
			if(status !== "success") {
				response.write('{"error": "scraper_page_error"}');
				response.close();
			}
			else {
				if(page.injectJs('jquery.js')) {
					entry.imageURL = page.evaluate(function(i) {
						var images = $('#search .rg_l');
						if(!images) return null; // none image found by the search engine
						if(i >= images.length) return null; // none good image found 
						return JSON.parse(images.eq(i).parent().find('.rg_meta').text()).ou;
					}, entry.imagePos);
					response.write(JSON.stringify(entry));
					response.close();
				}
				else {
					response.write('{"error": "scraper_injection_error"}');
					response.close();
				}

			}
		} catch(e) {
			response.write(e);
			response.close();
		}
	});
}